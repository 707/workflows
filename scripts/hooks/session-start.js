#!/usr/bin/env node
/**
 * SessionStart Hook - Load previous context on new session
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs when a new Claude session starts. Loads the most recent session
 * summary into Claude's context via stdout, and reports available
 * sessions and learned skills.
 */

const path = require('path');
const fs = require('fs');
const {
  getSessionsDir,
  getLearnedSkillsDir,
  findFiles,
  ensureDir,
  readFile,
  log,
  output
} = require('../lib/utils');
const { getPackageManager, getSelectionPrompt } = require('../lib/package-manager');
const { listAliases } = require('../lib/session-aliases');

async function main() {
  const sessionsDir = getSessionsDir();
  const learnedDir = getLearnedSkillsDir();

  // Ensure directories exist
  ensureDir(sessionsDir);
  ensureDir(learnedDir);

  // Check for recent session files (last 7 days)
  const recentSessions = findFiles(sessionsDir, '*-session.tmp', { maxAge: 7 });

  if (recentSessions.length > 0) {
    const latest = recentSessions[0];
    log(`[SessionStart] Found ${recentSessions.length} recent session(s)`);
    log(`[SessionStart] Latest: ${latest.path}`);

    // Read and inject the latest session content into Claude's context
    const content = readFile(latest.path);
    if (content && !content.includes('[Session context goes here]')) {
      // Only inject if the session has actual content (not the blank template)
      output(`Previous session summary:\n${content}`);
    }
  }

  // Check for learned skills
  const learnedSkills = findFiles(learnedDir, '*.md');

  if (learnedSkills.length > 0) {
    log(`[SessionStart] ${learnedSkills.length} learned skill(s) available in ${learnedDir}`);
  }

  // Check for available session aliases
  const aliases = listAliases({ limit: 5 });

  if (aliases.length > 0) {
    const aliasNames = aliases.map(a => a.name).join(', ');
    log(`[SessionStart] ${aliases.length} session alias(es) available: ${aliasNames}`);
    log(`[SessionStart] Use /sessions load <alias> to continue a previous session`);
  }

  // Load active ticket context if present
  const activeTicketFile = path.join(process.cwd(), '.ai', 'tickets', 'active.md');
  if (fs.existsSync(activeTicketFile)) {
    const activeContent = readFile(activeTicketFile);
    // Support GH-N (GitHub), ENG-42 / ABC-7 etc. (Linear), and bare N.
    const ticketIdMatch = activeContent && activeContent.match(/^([A-Z]+-\d+|\d+)$/m);
    if (ticketIdMatch) {
      const rawId = ticketIdMatch[1];
      const ticketId = /^[A-Z]+-\d+$/.test(rawId) ? rawId : `GH-${rawId}`;
      const contextFile = path.join(process.cwd(), '.ai', 'tickets', ticketId, 'context.md');
      if (fs.existsSync(contextFile)) {
        const contextContent = readFile(contextFile);
        if (contextContent) {
          output(`Active ticket context (${ticketId}):\n${contextContent}`);
          log(`[SessionStart] Loaded ticket context: ${ticketId}`);
        }
      }

      // Surface recent run-trace events for this ticket so resumption sees what
      // previous sessions actually did (Meta-Harness pattern — raw events > summary).
      const eventsFile = path.join(process.cwd(), '.ai', 'runs', ticketId, 'events.jsonl');
      if (fs.existsSync(eventsFile)) {
        try {
          const lines = fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean);
          const recent = lines.slice(-10);
          if (recent.length > 0) {
            const formatted = recent.map(l => {
              try {
                const e = JSON.parse(l);
                const parts = [e.ts, e.event, e.agent || ''].filter(Boolean);
                if (e.tools_used && e.tools_used.length) parts.push(`tools=${e.tools_used.join(',')}`);
                if (e.files_modified && e.files_modified.length) parts.push(`files=${e.files_modified.length}`);
                return `- ${parts.join(' | ')}`;
              } catch {
                return `- ${l}`;
              }
            }).join('\n');
            output(`Recent run events for ${ticketId} (last ${recent.length} of ${lines.length}):\n${formatted}`);
            log(`[SessionStart] Loaded ${recent.length} trace event(s) for ${ticketId}`);
          }
        } catch (err) {
          log(`[SessionStart] Failed to read trace ${eventsFile}: ${err.message}`);
        }
      }
    }
  }

  // BUILDING-SETUP.md reminder — fires until wizard runs and self-deletes the setup file
  const buildingSetupPath = path.join(process.cwd(), 'BUILDING-SETUP.md');
  const buildingMdPath = path.join(process.cwd(), 'BUILDING.md');
  if (fs.existsSync(buildingSetupPath) && !fs.existsSync(buildingMdPath)) {
    log('[SessionStart] BUILDING-SETUP.md found — build journal not yet initialized');
    output(`IMPORTANT: This project has BUILDING-SETUP.md but no BUILDING.md yet.
The build journal has not been set up. Before starting any work, tell the user:
"I noticed BUILDING-SETUP.md is present but BUILDING.md hasn't been created yet. Would you like to set up your build journal now? Just say the word and I'll run through the setup — it takes 2-3 minutes and will self-update as you build."
Do not start any implementation work until you've offered this.`);
  }

  // Detect and report package manager
  const pm = getPackageManager();
  log(`[SessionStart] Package manager: ${pm.name} (${pm.source})`);

  // If no explicit package manager config was found, show selection prompt
  if (pm.source === 'default') {
    log('[SessionStart] No package manager preference found.');
    log(getSelectionPrompt());
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[SessionStart] Error:', err.message);
  process.exit(0); // Don't block on errors
});
