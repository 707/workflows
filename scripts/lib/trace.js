/**
 * Shared trace utilities for harness event tracing.
 *
 * Events land in .ai/runs/{ticket}/events.jsonl — Hermes/Meta-Harness pattern.
 * Raw events > summaries for downstream pattern mining (raw > summary by ~15 pts
 * in the Meta-Harness ablation).
 *
 * Used by:
 *   - scripts/hooks/session-end.js
 *   - scripts/hooks/trace-tool-use.js (PostToolUse)
 *   - scripts/hooks/trace-user-prompt.js (UserPromptSubmit)
 *   - scripts/hooks/pre-compact.js (lineage)
 */

const fs = require('fs');
const path = require('path');

function readActiveTicketId(cwd = process.cwd()) {
  const activeFile = path.join(cwd, '.ai', 'tickets', 'active.md');
  if (!fs.existsSync(activeFile)) return null;
  try {
    const content = fs.readFileSync(activeFile, 'utf8');
    const match = content.match(/^([A-Z]+-\d+|\d+)$/m);
    if (!match) return null;
    const rawId = match[1];
    return /^[A-Z]+-\d+$/.test(rawId) ? rawId : `GH-${rawId}`;
  } catch {
    return null;
  }
}

function appendEvent(ticketId, event, cwd = process.cwd()) {
  if (!ticketId) return false;
  const runsDir = path.join(cwd, '.ai', 'runs', ticketId);
  try {
    fs.mkdirSync(runsDir, { recursive: true });
  } catch { return false; }
  const eventsFile = path.join(runsDir, 'events.jsonl');
  const enriched = { ts: new Date().toISOString(), ticket: ticketId, ...event };
  try {
    fs.appendFileSync(eventsFile, JSON.stringify(enriched) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the most recent event from a ticket's events.jsonl, optionally filtered.
 * Used for lineage tracking and resumption context.
 */
function readLastEvent(ticketId, filter = null, cwd = process.cwd()) {
  if (!ticketId) return null;
  const eventsFile = path.join(cwd, '.ai', 'runs', ticketId, 'events.jsonl');
  if (!fs.existsSync(eventsFile)) return null;
  try {
    const lines = fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (!filter || filter(e)) return e;
      } catch { continue; }
    }
  } catch { /* ignore */ }
  return null;
}

module.exports = { readActiveTicketId, appendEvent, readLastEvent };
