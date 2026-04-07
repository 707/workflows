# Project Template

A structured agent development scaffold for Claude Code, Gemini CLI, and Codex.

## What is this?

Specialist agents, slash commands, automatic quality hooks, Codex-facing skills, and a ticket context system to keep implementation focused and sessions resumable. Copy it into any new project and start with the harness you actually use.

---

### Setup

1. Copy this folder into your project
2. Open `CLAUDE.md` and fill in the PROJECT SETUP block at the top: project name, tech stack, issue tracker URL
3. If you use Gemini CLI, review `GEMINI.md`
4. If you use Codex CLI or the Codex macOS app, review `AGENTS.md` and `.codex/AGENTS.md`
5. If you want reusable machine-level skills, set `AI_SHARED_SKILLS_DIR` and read `SHARED-SKILLS.md`
6. Run `node scripts/export-codex-skills.js` after changing canonical skills in `skills/`
7. (Optional) Run `bash scripts/sync-project-template-to-codex.sh` to sync the baseline into `~/.codex` and generate prompt-based command files
8. (Optional) Ask Claude or Gemini: `"Read BUILDING-SETUP.md and follow the instructions"` — sets up your build journal and then deletes itself
9. Start working — the harness-specific config and workflow files are already included

> Codex still does not provide true Claude-style hook parity. This template now adds the closest practical equivalents: generated prompt files, Codex role configs, and shared/global skill sync.



### The loop

```
Explore → Plan → Issues → Implement → Review
```

- **Explore** — Free-form thinking in chat. No code, no commands. Clarify the problem.
- **Plan** — Run `/plan`. The planner agent produces a phased plan. Confirm it before moving on.
- **Issues** — Break the plan into atomic, sequenced issues in your tracker (GitHub, Linear, etc.).
- **Implement** — Open a fresh session. Run `/tdd ISSUE-ID`. The agent reads the ticket context, creates a branch, and works test-first.
- **Review** — Run `/code-review` when done. Fix findings. Open PR.

Run `/handoff` at the end of any session to save state. The next session picks up exactly where you left off. `/checkpoint` for a git commit save state.

### (Optional) Agent generation

Agents are defined once in `.ai/agents/`. Run `node scripts/gen-agents.js` to regenerate both `.claude/agents/` and `.gemini/agents/` from that single source. Edit agent instructions in `.ai/agents/` only.

Codex-facing skills are exported from `skills/` into `.agents/skills/` with:

```bash
node scripts/export-codex-skills.js
```

Machine-level shared skills are supported through `AI_SHARED_SKILLS_DIR` and the helper scripts documented in `SHARED-SKILLS.md`.

### Contents

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Authoritative workflow guide for Claude Code |
| `GEMINI.md` | Authoritative workflow guide for Gemini CLI |
| `AGENTS.md` | Shared cross-harness workflow baseline, auto-read by Codex |
| `SHARED-SKILLS.md` | Machine-level shared skill architecture and sync workflow |
| `.codex/` | Codex config, supplement, and optional multi-agent role definitions |
| `BUILDING-SETUP.md` | Self-installing wizard that generates your build journal |
| `USER-GUIDE.md` | Explains every component and why it exists |
| `.claude/agents/` | 10 specialist agents (planner, tdd-guide, code-reviewer, architect, security-reviewer, and more) |
| `.claude/commands/` | 15+ slash commands (`/plan`, `/tdd`, `/code-review`, `/handoff`, etc.) |
| `.claude/settings.json` | 10 automatic hooks (format, typecheck, console.log warnings, session save/load) |
| `.ai/agents/` | Platform-agnostic agent source — edit here, regenerate for Claude and Gemini |
| `.agents/skills/` | Codex-facing export built from local skills plus shared fallback |
| `.ai/tickets/` | Per-issue context files that preserve confirmed plans across sessions |
| `scripts/` | Agent generation, Codex export/sync, shared-skill publish/sync, hook implementations |
| `skills/` | 78+ canonical skills, including the full current Codex export surface |
