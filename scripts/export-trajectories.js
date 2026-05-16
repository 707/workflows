#!/usr/bin/env node
/**
 * ShareGPT-format trajectory exporter.
 *
 * Reads .ai/runs/{ticket}/events.jsonl and per-session transcript files,
 * emits one ShareGPT-format JSON object per session into evals/trajectories/.
 *
 * ShareGPT format (de-facto standard for fine-tuning + analysis):
 *   {
 *     "id": "session-{short_id}",
 *     "ticket": "GH-42",
 *     "conversations": [
 *       {"from": "human", "value": "..."},
 *       {"from": "gpt",   "value": "...", "tool_calls": [...]},
 *       ...
 *     ],
 *     "metadata": { agent, tools_used, files_modified, duration_ms, ... }
 *   }
 *
 * Used by /pattern-mine as Stage 1 input. Also portable for external evaluation,
 * fine-tuning, or archival.
 *
 * Usage:
 *   node scripts/export-trajectories.js                         # all sessions
 *   node scripts/export-trajectories.js --ticket GH-42          # one ticket
 *   node scripts/export-trajectories.js --since 30d             # last 30 days
 *   node scripts/export-trajectories.js --output /tmp/traj.json # single file
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT, '.ai', 'runs');
const DEFAULT_OUT_DIR = path.join(ROOT, 'evals', 'trajectories');

function parseArgs(argv) {
  const args = { ticket: null, since: null, output: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticket' && argv[i + 1]) args.ticket = argv[++i];
    else if (a === '--since' && argv[i + 1]) args.since = argv[++i];
    else if (a === '--output' && argv[i + 1]) args.output = argv[++i];
  }
  return args;
}

function parseSinceDays(s) {
  if (!s) return null;
  const m = s.match(/^(\d+)d$/);
  return m ? parseInt(m[1], 10) : null;
}

function readEvents(eventsFile) {
  if (!fs.existsSync(eventsFile)) return [];
  return fs.readFileSync(eventsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function groupBySession(events) {
  const sessions = new Map();
  for (const e of events) {
    const sid = e.session_id || 'unknown';
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push(e);
  }
  return sessions;
}

function eventsToShareGpt(sessionId, ticket, events) {
  const conversations = [];
  const toolsUsed = new Set();
  const filesModified = new Set();

  for (const e of events) {
    if (e.event === 'user_message') {
      conversations.push({ from: 'human', value: e.excerpt || '' });
    } else if (e.event === 'tool_use') {
      toolsUsed.add(e.tool);
      if (e.file_path) filesModified.add(e.file_path);
      const last = conversations[conversations.length - 1];
      const toolCall = {
        tool: e.tool,
        ...(e.file_path ? { file_path: e.file_path } : {}),
        ...(e.command_first_word ? { command_first_word: e.command_first_word } : {}),
        ...(typeof e.exit_code === 'number' ? { exit_code: e.exit_code } : {}),
      };
      if (last && last.from === 'gpt') {
        last.tool_calls = last.tool_calls || [];
        last.tool_calls.push(toolCall);
      } else {
        conversations.push({ from: 'gpt', value: '', tool_calls: [toolCall] });
      }
    } else if (e.event === 'session_end') {
      for (const t of e.tools_used || []) toolsUsed.add(t);
      for (const f of e.files_modified || []) filesModified.add(f);
    }
  }

  const firstTs = events[0]?.ts;
  const lastTs = events[events.length - 1]?.ts;
  const duration_ms = (firstTs && lastTs) ? (new Date(lastTs) - new Date(firstTs)) : null;

  return {
    id: `session-${sessionId}`,
    ticket,
    conversations,
    metadata: {
      session_id: sessionId,
      ticket,
      tools_used: Array.from(toolsUsed),
      files_modified: Array.from(filesModified),
      event_count: events.length,
      duration_ms,
      started_at: firstTs || null,
      ended_at: lastTs || null,
      agent: events.find(e => e.agent)?.agent || null,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const sinceDays = parseSinceDays(args.since);
  const sinceCutoff = sinceDays ? Date.now() - sinceDays * 86400 * 1000 : null;

  if (!fs.existsSync(RUNS_DIR)) {
    console.log(`No runs directory found at ${RUNS_DIR}. Nothing to export.`);
    return;
  }

  const tickets = fs.readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => !args.ticket || name === args.ticket);

  const trajectories = [];
  for (const ticket of tickets) {
    const eventsFile = path.join(RUNS_DIR, ticket, 'events.jsonl');
    const events = readEvents(eventsFile);
    if (!events.length) continue;
    const sessions = groupBySession(events);
    for (const [sid, sessionEvents] of sessions) {
      if (sinceCutoff) {
        const last = sessionEvents[sessionEvents.length - 1];
        if (last && new Date(last.ts).getTime() < sinceCutoff) continue;
      }
      trajectories.push(eventsToShareGpt(sid, ticket, sessionEvents));
    }
  }

  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(trajectories, null, 2), 'utf8');
    console.log(`Wrote ${trajectories.length} trajectories to ${args.output}`);
  } else {
    fs.mkdirSync(DEFAULT_OUT_DIR, { recursive: true });
    for (const t of trajectories) {
      const file = path.join(DEFAULT_OUT_DIR, `${t.ticket}-${t.metadata.session_id}.json`);
      fs.writeFileSync(file, JSON.stringify(t, null, 2), 'utf8');
    }
    console.log(`Wrote ${trajectories.length} trajectory file(s) to ${DEFAULT_OUT_DIR}`);
  }
}

main();
