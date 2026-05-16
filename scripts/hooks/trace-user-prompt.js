#!/usr/bin/env node
/**
 * UserPromptSubmit Hook — append a user_message event to .ai/runs/{ticket}/events.jsonl
 *
 * Powers semantic clustering in /pattern-mine Stage 2. We store only:
 *   - first 400 chars of the message (truncated)
 *   - char_count
 *   - whether the message begins with a slash command
 *
 * No PII beyond what the user typed. The transcript already contains the full
 * message; this trace is for cross-session pattern detection.
 */

const { readActiveTicketId, appendEvent } = require('../lib/trace');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

(async () => {
  const raw = await readStdin();
  process.stdout.write(raw);

  if (!raw) return;
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  const ticketId = readActiveTicketId();
  if (!ticketId) return;

  const text = (payload.user_prompt || payload.prompt || payload.message || '').toString();
  if (!text) return;

  const excerpt = text.length > 400 ? text.slice(0, 400) + '…' : text;
  const isSlashCommand = /^\s*\//.test(text);
  const firstWord = text.trim().split(/\s+/)[0] || '';

  appendEvent(ticketId, {
    event: 'user_message',
    session_id: payload.session_id || null,
    agent: payload.agent || 'claude-code',
    char_count: text.length,
    is_slash_command: isSlashCommand,
    first_word: isSlashCommand ? firstWord : null,
    excerpt,
  });
})();
