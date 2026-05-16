#!/usr/bin/env node
/**
 * PreCompact Hook - Save state before context compaction
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs before Claude compacts context, giving you a chance to
 * preserve important state that might get lost in summarization.
 */

const path = require('path');
const {
  getSessionsDir,
  getDateTimeString,
  getTimeString,
  findFiles,
  ensureDir,
  appendFile,
  log
} = require('../lib/utils');
const { readActiveTicketId, appendEvent, readLastEvent } = require('../lib/trace');

async function main() {
  const sessionsDir = getSessionsDir();
  const compactionLog = path.join(sessionsDir, 'compaction-log.txt');

  ensureDir(sessionsDir);

  // Log compaction event with timestamp
  const timestamp = getDateTimeString();
  appendFile(compactionLog, `[${timestamp}] Context compaction triggered\n`);

  // If there's an active session file, note the compaction
  const sessions = findFiles(sessionsDir, '*-session.tmp');

  if (sessions.length > 0) {
    const activeSession = sessions[0].path;
    const timeStr = getTimeString();
    appendFile(activeSession, `\n---\n**[Compaction occurred at ${timeStr}]** - Context was summarized\n`);
  }

  // Hermes pattern: session lineage. Link the compacted session to its predecessor
  // so /pattern-mine can see continuous work across compactions instead of treating
  // each as an unrelated session.
  const ticketId = readActiveTicketId();
  if (ticketId) {
    const lastSession = readLastEvent(ticketId, (e) => e.session_id);
    appendEvent(ticketId, {
      event: 'compaction',
      parent_session_id: lastSession ? lastSession.session_id : null,
      agent: 'claude-code',
    });
    log(`[PreCompact] Logged compaction event for ${ticketId} (parent: ${lastSession?.session_id || 'none'})`);
  }

  log('[PreCompact] State saved before compaction');
  process.exit(0);
}

main().catch(err => {
  console.error('[PreCompact] Error:', err.message);
  process.exit(0);
});
