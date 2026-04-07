# AGENTS.md — Cross-Harness Workflow

This repository is a structured AI development scaffold.

Use this file as the shared baseline across harnesses:
- `CLAUDE.md` — Claude Code-specific workflow and hooks
- `GEMINI.md` — Gemini CLI-specific startup and shutdown rituals
- `.codex/AGENTS.md` — Codex CLI and Codex app supplement

## Core Principles

1. Comprehensible code over clever code.
2. One issue, one focused PR.
3. Plan before implementation.
4. Fresh context for implementation work.
5. Minimum complexity for the requested outcome.

Before changing code, read the relevant issue, inspect the affected files, and understand the existing patterns.

## Development Loop

Follow this sequence for every meaningful change:

1. Explore when the problem is still fuzzy. Do not write code during exploration.
2. Plan the implementation and confirm the scope before coding.
3. Break the plan into atomic issues.
4. Implement in a fresh session with tests first.
5. Review the change before pushing or opening a PR.

## Ticket Context System

The authoritative handoff state lives in `.ai/tickets/`.

- `.ai/tickets/active.md` points to the current active ticket for the local developer.
- `.ai/tickets/GH-{N}/context.md` stores the confirmed plan, current state, files to read, and handoff instructions.

When a ticket is active:
1. Read `.ai/tickets/active.md`.
2. Read the active ticket context file fully before coding.
3. Treat the `Confirmed Plan` section as authoritative.
4. Resume from `Current State` and `Handoff Instructions`, not from memory.

If there is no active ticket, ask for the issue ID or clarify the task before proceeding with implementation.

## Harness Notes

- Claude Code: primary harness, with hooks and slash-command workflow documented in `CLAUDE.md`.
- Gemini CLI: follows the same workflow, but relies on explicit startup and shutdown rituals in `GEMINI.md`.
- Codex CLI / app: instruction-driven workflow using this file plus `.codex/AGENTS.md` and `.codex/config.toml`.

Codex does not have Claude-style hook parity. Do not assume automatic session-start, session-end, formatting, or slash-command behavior.
Use `bash scripts/sync-project-template-to-codex.sh` to generate prompt-based command equivalents and sync the project baseline into `~/.codex`.

## Skills

Canonical skill content lives in `skills/`.

- Only use skills relevant to the declared project stack.
- Codex loads the exported skill pack under `.agents/skills/`.
- Claude and Gemini should continue using the existing template workflow and docs as the source of truth.
- Machine-level shared skills can live at `AI_SHARED_SKILLS_DIR` or the default `~/.shared-agent-skills`.

If Codex-facing skill packaging drifts, regenerate it with:

```bash
node scripts/export-codex-skills.js
```

To publish local skills into the shared machine-level library:

```bash
node scripts/publish-skills-to-shared.js --all
```

To install shared skills into a harness-global directory such as `~/.agents/skills`:

```bash
node scripts/sync-shared-skills.js
```

## Working Rules

- Prefer test-first changes for new behavior and bug fixes.
- Review `git diff` before committing.
- Use conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- Do not create stray markdown or text files outside approved docs locations.
- Do not broaden scope mid-ticket. Create a new issue instead.
