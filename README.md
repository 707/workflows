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
5. Run `node scripts/export-codex-skills.js` after changing canonical skills in `skills/`
6. (Optional) Ask Claude or Gemini: `"Read BUILDING-SETUP.md and follow the instructions"` — sets up your build journal and then deletes itself
7. Start working — the harness-specific config and workflow files are already included

> Codex support is instruction-driven. It does not provide Claude-style hook or slash-command parity.



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

### Contents

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Authoritative workflow guide for Claude Code |
| `GEMINI.md` | Authoritative workflow guide for Gemini CLI |
| `AGENTS.md` | Shared cross-harness workflow baseline, auto-read by Codex |
| `.codex/` | Codex config, supplement, and optional multi-agent role definitions |
| `BUILDING-SETUP.md` | Self-installing wizard that generates your build journal |
| `USER-GUIDE.md` | Explains every component and why it exists |
| `.claude/agents/` | 10 specialist agents (planner, tdd-guide, code-reviewer, architect, security-reviewer, and more) |
| `.claude/commands/` | 15+ slash commands (`/plan`, `/tdd`, `/code-review`, `/handoff`, etc.) |
| `.claude/settings.json` | 10 automatic hooks (format, typecheck, console.log warnings, session save/load) |
| `.ai/agents/` | Platform-agnostic agent source — edit here, regenerate for Claude and Gemini |
| `.agents/skills/` | Curated Codex-facing export of the core workflow skills |
| `.ai/tickets/` | Per-issue context files that preserve confirmed plans across sessions |
| `scripts/` | `gen-agents.js`, `export-codex-skills.js`, hook implementations |
| `skills/` | 65+ reference files organized by tech stack (opt-in by declaring stack in setup) |
