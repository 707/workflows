# Project Template

A structured agent development scaffold for Claude Code, Gemini CLI, Codex, and OpenCode.

## What is this?

Specialist agents, slash commands, automatic quality hooks, cross-platform agent generation, role-based model routing, a ticket context system that resumes across sessions, deterministic harness evals, run-trace events for retrospective pattern mining, and a multi-stage `/pattern-mine` command that proposes new skills or agents from recurring patterns. Copy it into any new project and start with the harness you actually use.

---

### Setup

1. Copy this folder into your project
2. Open `CLAUDE.md` and fill in the PROJECT SETUP block at the top: project name, tech stack, issue tracker URL
3. If you use Gemini CLI, review `GEMINI.md`
4. If you use Codex CLI or the Codex macOS app, review `AGENTS.md` and `.codex/AGENTS.md`
5. If you use OpenCode, review `.opencode/README.md` and run `node scripts/gen-opencode-assets.js`
6. If you want reusable machine-level skills, set `AI_SHARED_SKILLS_DIR` and read `SHARED-SKILLS.md`
7. Run `node scripts/export-codex-skills.js` after changing canonical skills in `skills/`
8. (Optional) Run `bash scripts/sync-project-template-to-codex.sh` to sync the baseline into `~/.codex` and generate prompt-based command files
9. (Optional) Install the opt-in global git safety hooks with `bash scripts/install-global-git-hooks.sh`
10. (Optional) Ask Claude or Gemini: `"Read BUILDING-SETUP.md and follow the instructions"` — sets up your build journal and then deletes itself
11. Start working — the harness-specific config and workflow files are already included

> Codex still does not provide true Claude-style hook parity. This template adds the closest practical equivalents: generated prompt files, Codex role configs, shared/global skill sync, and optional global git safety hooks.

### The loop

```
Explore → Plan → Issues → Implement → Review
```

- **Explore** — Free-form thinking in chat. No code, no commands. Clarify the problem.
- **Plan** — Run `/plan`. The planner agent produces a phased plan. Confirm it before moving on.
- **Issues** — Break the plan into atomic, sequenced issues in your tracker (GitHub, Linear, etc.).
- **Implement** — Open a fresh session. Run `/tdd ISSUE-ID`. The agent reads the ticket context, creates a worktree at `.ai/worktrees/{ISSUE-ID}/` on a fresh branch, and works test-first.
- **Review** — Run `/code-review` when done. Fix findings. Open PR.

Run `/handoff` at the end of any session to save state. The next session picks up exactly where you left off. `/checkpoint` for a git commit save state.

### Cross-platform agent generation

Agents are defined once in `.ai/agents/` + `scripts/agent-config.json`. Models are routed from `models.json` by role (plan / execute / review / think / critique / observe / fallback). Run the generators to materialize agents for each platform:

```bash
node scripts/gen-agents.js          # Claude Code + Gemini CLI
node scripts/gen-opencode-assets.js # OpenCode prompts, commands, opencode.json
node scripts/gen-codex-assets.js    # Codex .toml agents + config.toml entries
```

Edit `models.json` to change which model handles a role; one regen propagates to every platform.

### Trace events + pattern mining

Every session writes structured events to `.ai/runs/{ticket}/events.jsonl`:

- `tool_use` (per tool call, PostToolUse hook)
- `user_message` (per prompt, UserPromptSubmit hook)
- `session_end` (Stop hook)
- `compaction` (PreCompact hook, with `parent_session_id` lineage)

Retrospective analysis via `/pattern-mine`:

```bash
/pattern-mine                       mine all sessions
/pattern-mine --since 30d           last 30 days
/pattern-mine --dry-run             cluster summary, no LLM calls
```

Three stages: deterministic clustering (zero LLM tokens) → Sonnet semantic enrichment → Hermes-style constraint gates → per-candidate approval before saving as a skill or agent.

### Validating additions

Before committing new skills or agents:

```bash
node scripts/validate-additions.js              # schema + duplicates + similarity + safety
node scripts/validate-additions.js --eval-gate  # also runs evals/run-evals.js
```

### Harness evals

Deterministic regression tests for harness behavior in `evals/fixtures/`. 15 check types: file-read order, edit constraints, branch naming, diff size, tool dispatch, finding severity, ticket compliance.

```bash
node evals/run-evals.js evals/fixtures/<name>.md
```

New skills and agents from `/pattern-mine` must pass the full suite before being saved.

### Contents

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Authoritative workflow guide for Claude Code |
| `GEMINI.md` | Authoritative workflow guide for Gemini CLI |
| `AGENTS.md` | Shared cross-harness workflow baseline, auto-read by Codex |
| `SHARED-SKILLS.md` | Machine-level shared skill architecture and sync workflow |
| `USER-GUIDE.md` | Explains every component and why it exists |
| `models.json` | Single source of truth for role → model routing across all 4 platforms |
| `.codex/` | Codex config, supplement, multi-agent role definitions (3 originals + 4 promoted from skills) |
| `.opencode/` | OpenCode config (regenerated from agent-config.json + models.json), instructions, commands, prompts |
| `BUILDING-SETUP.md` | Self-installing wizard that generates your build journal |
| `.claude/agents/` | 14 specialist agents (planner, tdd-guide, code-reviewer, architect, security-reviewer, harness-optimizer, eval-harness, skill-stocktake, deep-research, security-scan, more) |
| `.claude/commands/` | 21 slash commands incl. `/plan`, `/tdd`, `/code-review`, `/handoff`, `/harness-audit`, `/model-route`, `/quality-gate`, `/loop-start`, `/loop-status`, `/pattern-mine` |
| `.claude/settings.json` | Hooks: PreToolUse (push reminder, doc warning, compact suggest), PostToolUse (format, typecheck, console.log warn, PR logger, **trace-tool-use**), UserPromptSubmit (**trace-user-prompt**), Stop (session-end, console scan), SessionStart, PreCompact (+ lineage) |
| `.ai/agents/` | Platform-agnostic agent body source — edit here, regenerate for all 4 platforms |
| `.ai/tickets/` | Per-issue context files preserving confirmed plans across sessions |
| `.ai/runs/` | Per-ticket JSONL trace events (gitignored) |
| `.ai/worktrees/` | Per-ticket git worktrees from `/tdd` (gitignored) |
| `evals/` | Deterministic harness regression suite — fixtures + grader |
| `scripts/` | Generators (gen-agents, gen-opencode-assets, gen-codex-assets), trace utilities, pattern miner, ShareGPT exporter, validator, shared-skill sync, optional global git hooks |
| `skills/` | 69 canonical skills with Hermes 4-section template (When to Use / Procedure / Pitfalls / Verification) |
