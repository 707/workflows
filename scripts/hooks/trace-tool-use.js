#!/usr/bin/env node
/**
 * PostToolUse Hook — append a tool_use event to .ai/runs/{ticket}/events.jsonl
 *
 * Reads Claude Code's PostToolUse JSON payload from stdin, extracts the tool
 * name + minimal metadata, appends a tool_use event if an active ticket exists,
 * then echoes stdin back to stdout to allow continuation.
 *
 * Silent on errors. Never blocks tool execution.
 *
 * Hermes pattern: per-tool-call events are what power /pattern-mine Stage 1
 * clustering. We capture only what we need (tool name, file paths if present,
 * coarse classification) — no raw arguments, no payload content, no PII.
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

function summarizeToolInput(tool, input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  if (typeof input.file_path === 'string') out.file_path = input.file_path;
  if (typeof input.path === 'string') out.file_path = input.path;
  if (typeof input.command === 'string') out.command_first_word = input.command.split(/\s+/)[0];
  if (Array.isArray(input.file_paths)) out.file_count = input.file_paths.length;
  if (typeof input.pattern === 'string') out.pattern_kind = 'present';
  return out;
}

(async () => {
  const raw = await readStdin();
  process.stdout.write(raw);

  if (!raw) return;
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  const ticketId = readActiveTicketId();
  if (!ticketId) return;

  const tool = payload.tool_name || payload.tool || 'unknown';
  const input = payload.tool_input || {};
  const meta = summarizeToolInput(tool, input);
  const exitCode = payload.tool_output?.exit_code;
  const errorPresent = Boolean(payload.tool_output?.error || payload.error);

  appendEvent(ticketId, {
    event: 'tool_use',
    tool,
    session_id: payload.session_id || null,
    agent: payload.agent || 'claude-code',
    ...meta,
    ...(typeof exitCode === 'number' ? { exit_code: exitCode } : {}),
    ...(errorPresent ? { error: true } : {}),
  });
})();
