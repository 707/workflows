#!/usr/bin/env node
/**
 * Validator for skills, agents, and harness additions.
 *
 * Catches drift before it lands:
 *   1. Frontmatter schema (required fields, valid stack values)
 *   2. Duplicate names across scopes (skills/, .ai/agents/, user-level)
 *   3. Description similarity (TF-IDF cosine > 0.7 → warn)
 *   4. Skill ↔ agent overlap (same topic in both → flag)
 *   5. Read-only safety: think/critique/review/plan agents shouldn't have Write/Edit
 *   6. Cross-scope collision: ~/.claude/skills vs ./skills name conflicts
 *   7. Eval gate (optional --eval-gate flag): runs evals/run-evals.js
 *
 * Exit codes:
 *   0 — clean
 *   1 — warnings only (informational)
 *   2 — errors (block adding)
 *
 * Usage:
 *   node scripts/validate-additions.js                  # full validation
 *   node scripts/validate-additions.js --quiet          # only errors
 *   node scripts/validate-additions.js --eval-gate      # also run evals
 *   node scripts/validate-additions.js --json           # machine-readable
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_SKILLS = path.join(ROOT, 'skills');
const PROJECT_AGENTS = path.join(ROOT, '.ai', 'agents');
const CLAUDE_AGENTS = path.join(ROOT, '.claude', 'agents');
const GEMINI_AGENTS = path.join(ROOT, '.gemini', 'agents');
const USER_SKILLS = path.join(os.homedir(), '.claude', 'skills');
const USER_AGENTS = path.join(os.homedir(), '.claude', 'agents');

const VALID_STACKS = ['web', 'python', 'go', 'java', 'swift', 'cpp', 'database', 'general'];
const READ_ONLY_ROLES = ['plan', 'review', 'critique', 'think'];
const WRITE_TOOLS = new Set(['Write', 'Edit', 'write_file', 'replace_in_file']);

const args = process.argv.slice(2);
const opts = {
  quiet: args.includes('--quiet'),
  evalGate: args.includes('--eval-gate'),
  json: args.includes('--json'),
};

const findings = { errors: [], warnings: [], info: [] };
function err(msg, ctx) { findings.errors.push({ msg, ...ctx }); }
function warn(msg, ctx) { findings.warnings.push({ msg, ...ctx }); }
function info(msg, ctx) { findings.info.push({ msg, ...ctx }); }

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.+)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (val.startsWith('[')) {
      try { val = JSON.parse(val.replace(/'/g, '"')); } catch { /* leave string */ }
    } else if (/^["'].*["']$/.test(val)) {
      val = val.slice(1, -1);
    }
    fm[kv[1]] = val;
  }
  return fm;
}

function listFilesRecursive(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'agents' || entry.name === 'node_modules') continue;
      out.push(...listFilesRecursive(full, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// TF-IDF similarity (cheap, deterministic)
function tokenize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}
function cosine(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const x = a.get(k) || 0;
    const y = b.get(k) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function loadSkills() {
  const out = [];
  if (!fs.existsSync(PROJECT_SKILLS)) return out;
  for (const entry of fs.readdirSync(PROJECT_SKILLS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(PROJECT_SKILLS, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const content = fs.readFileSync(skillFile, 'utf8');
    const fm = parseFrontmatter(content);
    out.push({ scope: 'project', name: entry.name, path: skillFile, frontmatter: fm, body: content });
  }
  return out;
}

function loadAgents() {
  // Frontmatter for agents lives in scripts/agent-config.json — .ai/agents/*.md
  // is the body only (with optional frontmatter as a reading convenience that
  // gen-agents.js strips). Load frontmatter from the config, merge with body.
  const out = [];
  const configFile = path.join(ROOT, 'scripts', 'agent-config.json');
  if (!fs.existsSync(configFile)) return out;
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return out; }

  for (const [name, platformCfg] of Object.entries(config)) {
    const bodyFile = path.join(PROJECT_AGENTS, `${name}.md`);
    const body = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf8') : '';
    // Use the Claude block as the canonical frontmatter source for validation.
    out.push({
      scope: 'project',
      name,
      path: bodyFile,
      frontmatter: platformCfg.claude || null,
      body,
    });
  }
  return out;
}

function validateSkill(skill) {
  const fm = skill.frontmatter;
  if (!fm) { err(`Missing frontmatter`, { file: skill.path }); return; }
  if (!fm.name) err(`Missing 'name' in frontmatter`, { file: skill.path });
  if (!fm.description) err(`Missing 'description' in frontmatter`, { file: skill.path });
  if (fm.stack && !VALID_STACKS.includes(fm.stack)) {
    warn(`Invalid stack '${fm.stack}'. Valid: ${VALID_STACKS.join(', ')}`, { file: skill.path });
  }
  if (!fm.stack) info(`Skill has no 'stack' field — will appear in Uncategorized`, { file: skill.path });
  if (fm.name && fm.name !== skill.name) {
    err(`Frontmatter name '${fm.name}' doesn't match folder '${skill.name}'`, { file: skill.path });
  }
  if (fm.description && fm.description.length > 500) {
    warn(`Description ${fm.description.length} chars > 500 (Hermes constraint)`, { file: skill.path });
  }
  const size = fs.statSync(skill.path).size;
  if (size > 15 * 1024) {
    warn(`SKILL.md size ${(size/1024).toFixed(1)}KB > 15KB (Hermes constraint)`, { file: skill.path });
  }
}

function validateAgent(agent) {
  const fm = agent.frontmatter;
  if (!fm) { err(`Missing frontmatter`, { file: agent.path }); return; }
  if (!fm.name) err(`Missing 'name'`, { file: agent.path });
  if (!fm.description) err(`Missing 'description'`, { file: agent.path });
  if (!fm.tools && !fm.role) warn(`No 'tools' or 'role' declared`, { file: agent.path });
  if (fm.name && fm.name !== agent.name) {
    err(`Frontmatter name '${fm.name}' doesn't match file '${agent.name}'`, { file: agent.path });
  }
  // Read-only safety
  const role = fm.role || null;
  const tools = Array.isArray(fm.tools) ? fm.tools : (typeof fm.tools === 'string' ? JSON.parse(fm.tools.replace(/'/g, '"')) : []);
  if (role && READ_ONLY_ROLES.includes(role)) {
    const writeTool = tools.find(t => WRITE_TOOLS.has(t));
    if (writeTool) {
      warn(`Agent with role '${role}' has write tool '${writeTool}' — consider removing for schema-level safety`, { file: agent.path });
    }
  }
  if (fm.description && fm.description.length > 500) {
    warn(`Description ${fm.description.length} chars > 500 (Hermes constraint)`, { file: agent.path });
  }
}

function checkDuplicates(items, label) {
  const byName = new Map();
  for (const item of items) {
    const key = (item.frontmatter?.name || item.name).toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
  }
  for (const [name, group] of byName) {
    if (group.length > 1) {
      err(`Duplicate ${label} name '${name}'`, { files: group.map(g => g.path) });
    }
  }
}

function checkSimilarity(items, label, threshold = 0.7) {
  const vectors = items.map(item => ({
    item,
    tf: termFreq(tokenize(item.frontmatter?.description || '')),
  }));
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const sim = cosine(vectors[i].tf, vectors[j].tf);
      if (sim > threshold) {
        warn(`${label} '${vectors[i].item.name}' ↔ '${vectors[j].item.name}' similarity ${sim.toFixed(2)} > ${threshold}`, {
          files: [vectors[i].item.path, vectors[j].item.path],
        });
      }
    }
  }
}

function checkSkillVsAgentOverlap(skills, agents, threshold = 0.6) {
  const skillVecs = skills.map(s => ({ name: s.name, tf: termFreq(tokenize(s.frontmatter?.description || '')) }));
  const agentVecs = agents.map(a => ({ name: a.name, tf: termFreq(tokenize(a.frontmatter?.description || '')) }));
  for (const sv of skillVecs) {
    for (const av of agentVecs) {
      const sim = cosine(sv.tf, av.tf);
      if (sim > threshold) {
        warn(`Skill '${sv.name}' overlaps agent '${av.name}' (sim ${sim.toFixed(2)} > ${threshold}) — consider deleting skill or merging`);
      }
    }
  }
}

function checkCrossScopeCollisions() {
  const projectNames = new Set();
  const skip = new Set(['.DS_Store', 'INDEX.md', '.gitkeep']);
  if (fs.existsSync(PROJECT_SKILLS)) {
    for (const e of fs.readdirSync(PROJECT_SKILLS)) {
      if (!skip.has(e)) projectNames.add(e);
    }
  }
  if (fs.existsSync(USER_SKILLS)) {
    for (const e of fs.readdirSync(USER_SKILLS)) {
      if (skip.has(e)) continue;
      if (projectNames.has(e)) {
        info(`Cross-scope: '${e}' exists in both ~/.claude/skills/ and ./skills/ — project wins; usually intentional`);
      }
    }
  }
}

function runEvalGate() {
  const evalDir = path.join(ROOT, 'evals');
  const fixturesDir = path.join(evalDir, 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    info('No evals/fixtures/ directory — skipping eval gate');
    return;
  }
  const fixtures = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.md'));
  let failed = 0;
  for (const fix of fixtures) {
    try {
      execSync(`node ${path.join(evalDir, 'run-evals.js')} ${path.join(fixturesDir, fix)}`, { stdio: 'pipe' });
    } catch {
      err(`Eval fixture failed: ${fix}`, { file: path.join(fixturesDir, fix) });
      failed++;
    }
  }
  if (!failed) info(`Eval gate passed: ${fixtures.length} fixture(s)`);
}

function main() {
  const skills = loadSkills();
  const agents = loadAgents();

  for (const s of skills) validateSkill(s);
  for (const a of agents) validateAgent(a);

  checkDuplicates(skills, 'skill');
  checkDuplicates(agents, 'agent');
  checkSimilarity(skills, 'Skill');
  checkSimilarity(agents, 'Agent');
  checkSkillVsAgentOverlap(skills, agents);
  checkCrossScopeCollisions();

  if (opts.evalGate) runEvalGate();

  if (opts.json) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    if (findings.errors.length) {
      console.error('ERRORS:');
      for (const e of findings.errors) console.error(`  ✗ ${e.msg}${e.file ? `  (${path.relative(ROOT, e.file)})` : ''}`);
    }
    if (findings.warnings.length && !opts.quiet) {
      console.error('WARNINGS:');
      for (const w of findings.warnings) console.error(`  ⚠ ${w.msg}${w.file ? `  (${path.relative(ROOT, w.file)})` : ''}`);
    }
    if (findings.info.length && !opts.quiet) {
      console.error('INFO:');
      for (const i of findings.info) console.error(`  i ${i.msg}${i.file ? `  (${path.relative(ROOT, i.file)})` : ''}`);
    }
    const summary = `${skills.length} skill(s), ${agents.length} agent(s) — ${findings.errors.length} error(s), ${findings.warnings.length} warning(s)`;
    console.error(summary);
  }

  process.exit(findings.errors.length ? 2 : (findings.warnings.length ? 1 : 0));
}

main();
