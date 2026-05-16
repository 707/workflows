#!/usr/bin/env node
/**
 * Pattern Miner — retrospective trace analyzer for /pattern-mine.
 *
 * Stage 1 (this script, deterministic, zero LLM tokens):
 *   - Reads .ai/runs/{ticket}/events.jsonl across all tickets
 *   - Builds per-session feature vectors (directories, files, user intents, tools)
 *   - Clusters by directory overlap + TF-IDF intent similarity + file co-occurrence
 *   - Classifies each cluster: skill candidate, agent candidate, or noise
 *   - Applies Hermes-style constraint gates (size, recurrence, duplicate check)
 *   - Outputs JSON for the /pattern-mine command to feed into Stage 2 (LLM enrichment)
 *
 * Stage 2 happens in the slash command (.claude/commands/pattern-mine.md):
 *   - Sonnet reads the JSON output and proposes per-cluster skill/agent drafts
 *   - User approves each candidate
 *
 * Stage 3 also in the command: validate-additions.js + evals/run-evals.js before save.
 *
 * Usage:
 *   node scripts/pattern-miner.js                       # mine all sessions
 *   node scripts/pattern-miner.js --since 30d           # last 30 days
 *   node scripts/pattern-miner.js --min-occurrences 3   # min sessions per pattern
 *   node scripts/pattern-miner.js --output candidates.json
 *   node scripts/pattern-miner.js --dry-run             # cluster summary, no JSON
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT, '.ai', 'runs');
const SKILLS_DIR = path.join(ROOT, 'skills');
const AI_AGENTS_DIR = path.join(ROOT, '.ai', 'agents');

const args = process.argv.slice(2);
function getArg(flag, def = null) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const opts = {
  since: getArg('--since'),
  minOccurrences: parseInt(getArg('--min-occurrences', '3'), 10),
  output: getArg('--output'),
  dryRun: args.includes('--dry-run'),
};

function parseSinceDays(s) {
  if (!s) return null;
  const m = s.match(/^(\d+)d$/);
  return m ? parseInt(m[1], 10) : null;
}

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function tokenize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function tf(tokens) { const m = new Map(); for (const t of tokens) m.set(t, (m.get(t) || 0) + 1); return m; }
function cosine(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) { const x = a.get(k) || 0; const y = b.get(k) || 0; dot += x * y; na += x * x; nb += y * y; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function topLevelDirs(filePaths) {
  const dirs = new Set();
  for (const fp of filePaths) {
    const parts = fp.split('/').filter(Boolean);
    if (parts.length >= 2) dirs.add(parts.slice(0, 2).join('/'));
    else if (parts.length === 1) dirs.add(parts[0]);
  }
  return Array.from(dirs);
}

function readTicketContext(ticket) {
  const p = path.join(ROOT, '.ai', 'tickets', ticket, 'context.md');
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function existingArtifactNames() {
  const skills = new Set();
  const agents = new Set();
  if (fs.existsSync(SKILLS_DIR)) {
    for (const e of fs.readdirSync(SKILLS_DIR)) if (!e.startsWith('.') && e !== 'INDEX.md') skills.add(e);
  }
  if (fs.existsSync(AI_AGENTS_DIR)) {
    for (const e of fs.readdirSync(AI_AGENTS_DIR)) if (e.endsWith('.md')) agents.add(e.replace(/\.md$/, ''));
  }
  return { skills, agents };
}

function loadSessions(sinceCutoff) {
  const sessions = [];
  if (!fs.existsSync(RUNS_DIR)) return sessions;
  for (const ticket of fs.readdirSync(RUNS_DIR)) {
    const events = readEvents(path.join(RUNS_DIR, ticket, 'events.jsonl'));
    if (!events.length) continue;

    const bySession = new Map();
    for (const e of events) {
      const sid = e.session_id || 'unknown';
      if (!bySession.has(sid)) bySession.set(sid, []);
      bySession.get(sid).push(e);
    }
    for (const [sid, evts] of bySession) {
      const last = evts[evts.length - 1];
      if (sinceCutoff && last && new Date(last.ts).getTime() < sinceCutoff) continue;

      const userMessages = evts.filter(e => e.event === 'user_message').map(e => e.excerpt || '');
      const toolUses = evts.filter(e => e.event === 'tool_use');
      const files = toolUses.map(e => e.file_path).filter(Boolean);
      const tools = toolUses.map(e => e.tool);

      const intent = userMessages.join(' ');
      const intentTokens = tokenize(intent);
      const ticketCtx = readTicketContext(ticket);
      const goalTokens = ticketCtx ? tokenize(ticketCtx.slice(0, 1000)) : [];
      const allTokens = [...intentTokens, ...goalTokens];

      sessions.push({
        ticket,
        session_id: sid,
        started_at: evts[0]?.ts,
        ended_at: last?.ts,
        agent: evts.find(e => e.agent)?.agent || null,
        user_messages: userMessages,
        tool_count: toolUses.length,
        tools_used: Array.from(new Set(tools)),
        files_touched: Array.from(new Set(files)),
        directories: topLevelDirs(files),
        intent_tf: tf(allTokens),
        outcome: evts.some(e => e.event === 'session_end') ? 'ended' : 'in_progress',
        has_handoff: userMessages.some(m => /\/handoff\b/.test(m)),
      });
    }
  }
  return sessions;
}

/**
 * Cluster sessions. Two sessions cluster together when:
 *   - shared directory(ies), OR
 *   - intent cosine similarity > 0.35, AND
 *   - share at least one file or tool overlap
 */
function clusterSessions(sessions) {
  const clusters = [];
  const assigned = new Set();
  for (let i = 0; i < sessions.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    assigned.add(i);
    for (let j = i + 1; j < sessions.length; j++) {
      if (assigned.has(j)) continue;
      const a = sessions[i], b = sessions[j];
      const sharedDir = a.directories.some(d => b.directories.includes(d));
      const sharedFile = a.files_touched.some(f => b.files_touched.includes(f));
      const sharedTool = a.tools_used.some(t => b.tools_used.includes(t));
      const intentSim = cosine(a.intent_tf, b.intent_tf);
      if ((sharedDir || intentSim > 0.35) && (sharedFile || sharedTool)) {
        cluster.push(j);
        assigned.add(j);
      }
    }
    if (cluster.length >= 1) clusters.push(cluster.map(idx => sessions[idx]));
  }
  return clusters;
}

/**
 * Classify a cluster as skill candidate, agent candidate, or noise.
 * Uses the rubric from CLAUDE.md / skills/INDEX.md.
 */
function classifyCluster(cluster) {
  const n = cluster.length;
  const avgTools = cluster.reduce((s, c) => s + c.tool_count, 0) / n;
  const allDirs = new Set(cluster.flatMap(c => c.directories));
  const writeRatio = cluster.flatMap(c => c.tools_used).filter(t => /Write|Edit|write_file|replace/i.test(t)).length /
                     Math.max(1, cluster.flatMap(c => c.tools_used).length);
  const allTokens = new Map();
  for (const s of cluster) {
    for (const [k, v] of s.intent_tf) allTokens.set(k, (allTokens.get(k) || 0) + v);
  }
  const topKeywords = Array.from(allTokens.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

  let kind = 'noise';
  let reason = '';
  if (n < 2) {
    kind = 'noise';
    reason = 'single occurrence (below recurrence threshold)';
  } else if (avgTools >= 10 && writeRatio < 0.3) {
    kind = 'agent';
    reason = `${avgTools.toFixed(0)} avg tool calls, mostly reads — dispatch-and-return audit shape`;
  } else if (avgTools >= 15) {
    kind = 'agent';
    reason = `${avgTools.toFixed(0)} avg tool calls — long task, context-isolation worthwhile`;
  } else if (avgTools < 8 && writeRatio > 0.2) {
    kind = 'skill';
    reason = `${avgTools.toFixed(0)} avg tool calls, applied inline — fits skill shape`;
  } else {
    kind = 'skill';
    reason = `${avgTools.toFixed(0)} avg tool calls — moderate inline pattern`;
  }

  return {
    kind,
    reason,
    n_sessions: n,
    avg_tool_calls: Number(avgTools.toFixed(1)),
    write_ratio: Number(writeRatio.toFixed(2)),
    top_keywords: topKeywords,
    directories: Array.from(allDirs).slice(0, 5),
    tickets: Array.from(new Set(cluster.map(c => c.ticket))),
    sample_user_messages: cluster.slice(0, 3).flatMap(s => s.user_messages).slice(0, 5),
    files_most_touched: Object.entries(cluster.flatMap(c => c.files_touched).reduce((m, f) => (m[f] = (m[f] || 0) + 1, m), {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, c]) => ({ file: f, count: c })),
  };
}

function applyConstraintGates(classified, existing) {
  return classified.map(c => {
    const gates = { passes: true, blocks: [] };
    if (c.n_sessions < opts.minOccurrences) {
      gates.passes = false;
      gates.blocks.push(`below min_occurrences (${c.n_sessions} < ${opts.minOccurrences})`);
    }
    const proposedName = (c.top_keywords[0] || 'pattern') + '-' + (c.top_keywords[1] || 'recurring');
    if (c.kind === 'skill' && existing.skills.has(proposedName)) {
      gates.blocks.push(`name collision with existing skill '${proposedName}'`);
    }
    if (c.kind === 'agent' && existing.agents.has(proposedName)) {
      gates.blocks.push(`name collision with existing agent '${proposedName}'`);
    }
    return { ...c, proposed_name: proposedName, gates };
  });
}

function main() {
  const sinceDays = parseSinceDays(opts.since);
  const sinceCutoff = sinceDays ? Date.now() - sinceDays * 86400 * 1000 : null;

  console.error(`[pattern-miner] Loading sessions${opts.since ? ` (since ${opts.since})` : ''}...`);
  const sessions = loadSessions(sinceCutoff);
  console.error(`[pattern-miner] Loaded ${sessions.length} session(s).`);

  if (!sessions.length) {
    console.error('No sessions to analyze. Generate some traces first (.ai/runs/{ticket}/events.jsonl).');
    return;
  }

  const clusters = clusterSessions(sessions);
  console.error(`[pattern-miner] Built ${clusters.length} cluster(s).`);

  const existing = existingArtifactNames();
  const classified = clusters.map(classifyCluster);
  const gated = applyConstraintGates(classified, existing);

  const candidates = gated.filter(c => c.kind !== 'noise' && c.gates.passes);
  const blocked = gated.filter(c => c.kind !== 'noise' && !c.gates.passes);
  const noise = gated.filter(c => c.kind === 'noise');

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      sessions: sessions.length,
      clusters: clusters.length,
      since: opts.since || 'all',
      min_occurrences: opts.minOccurrences,
    },
    candidates,
    blocked,
    noise_count: noise.length,
  };

  if (opts.dryRun) {
    console.error(`\nCandidates: ${candidates.length}`);
    for (const c of candidates) {
      console.error(`  [${c.kind.toUpperCase()}] ${c.proposed_name}: ${c.reason} (n=${c.n_sessions})`);
    }
    console.error(`Blocked: ${blocked.length}`);
    console.error(`Noise:   ${noise.length}`);
    return;
  }

  const outPath = opts.output || path.join(ROOT, '.ai', 'runs', `pattern-mine-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.error(`[pattern-miner] Wrote ${candidates.length} candidate(s) to ${outPath}`);
  console.log(outPath);
}

main();
