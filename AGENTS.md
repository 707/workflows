# AGENTS.md — Cross-Harness Workflow

This repository is a structured AI development scaffold.

Use this file as the shared baseline across harnesses:
- `CLAUDE.md` — Claude Code-specific workflow and hooks
- `GEMINI.md` — Gemini CLI-specific startup and shutdown rituals
- `.codex/AGENTS.md` — Codex CLI and Codex app supplement
- `.opencode/instructions/INSTRUCTIONS.md` — OpenCode supplement

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
- OpenCode: repo-local support in `.opencode/`, generated from the same command and agent sources already used by the template.

Codex does not have Claude-style hook parity. Do not assume automatic session-start, session-end, formatting, or slash-command behavior.
Use `bash scripts/sync-project-template-to-codex.sh` to generate prompt-based command equivalents and sync the project baseline into `~/.codex`.

## Skills

Canonical skill content lives in `skills/`.

- Only use skills relevant to the declared project stack.
- Codex loads the exported skill pack under `.agents/skills/`.
- OpenCode reads the repo-local high-signal skills listed in `.opencode/opencode.json`.
- Claude and Gemini should continue using the existing template workflow and docs as the source of truth.
- Machine-level shared skills can live at `AI_SHARED_SKILLS_DIR` or the default `~/.agent-skills`.

If Codex-facing skill packaging drifts, regenerate it with:

```bash
node scripts/export-codex-skills.js
```

To publish local skills into the shared machine-level library:

```bash
node scripts/publish-skills-to-shared.js --all
node scripts/publish-skills-to-shared.js --high-signal
```

To install shared skills into a harness-global directory such as `~/.agents/skills`:

```bash
node scripts/sync-shared-skills.js
```

To regenerate OpenCode-facing prompts and command shims:

```bash
node scripts/gen-opencode-assets.js
```

To regenerate Codex agent TOML files from `scripts/agent-config.json`:

```bash
node scripts/gen-codex-assets.js
```

## Cross-Platform Model Routing

`models.json` at the repo root is the single source of truth for which model handles which role across all four harnesses. Per-platform fields per role:

- `model` → Claude Code (e.g., `sonnet`, `opus`, `haiku`)
- `gemini` → Gemini CLI (e.g., `gemini-2.5-pro`)
- `opencode` → OpenCode (e.g., `anthropic/claude-sonnet-4-6`)
- `codex` → Codex (e.g., `gpt-5.4`)

Agents declare a `role` in `scripts/agent-config.json`; generators resolve the role to a platform-specific model. To change the model used by every "review" agent across all platforms, edit `models.json` and regenerate with the three commands above.

## Trace & Pattern Mining

Every session writes events to `.ai/runs/{ticket}/events.jsonl` (gitignored, per-developer). Hermes-style trace events:

- `tool_use` — per tool call, written by the PostToolUse hook
- `user_message` — per prompt, written by the UserPromptSubmit hook
- `session_end` — per session, written by the Stop hook
- `compaction` — written by the PreCompact hook with `parent_session_id` for lineage

Retrospective analysis: `/pattern-mine` clusters sessions and proposes new skills or agents based on recurring patterns. Approval required per candidate. See `.claude/commands/pattern-mine.md`.

## Validating Additions

Before committing new skills or agents, run:

```bash
node scripts/validate-additions.js              # full validation
node scripts/validate-additions.js --eval-gate  # also run regression evals
```

## Working Rules

- Prefer test-first changes for new behavior and bug fixes.
- Review `git diff` before committing.
- Use conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- Do not create stray markdown or text files outside approved docs locations.
- Do not broaden scope mid-ticket. Create a new issue instead.
