# Codex Supplement for `project-template`

This file extends the root `AGENTS.md` with Codex-specific guidance.

## Startup Sequence

At the start of every Codex session:

1. Read the root `AGENTS.md`.
2. Read `.ai/tickets/active.md` if it exists.
3. If an active ticket is set, read `.ai/tickets/{ID}/context.md` fully.
4. Read the files listed in `Files to Read Before Starting`.
5. State the exact next action before making changes.

If no active ticket is set, ask for the issue ID or confirm that the task is intentionally outside the ticket workflow.

## Operating Model in Codex

Codex support in this template is instruction-driven:

- Planning happens in chat, not through slash-command parity.
- Ticket context files remain the handoff source of truth.
- Skills are auto-loaded from `.agents/skills/`.
- Optional Codex sub-agents are configured in `.codex/agents/`.
- `bash scripts/sync-project-template-to-codex.sh` can sync the project baseline into `~/.codex`, generate prompt files from `.claude/commands/`, and install shared skills into `~/.agents/skills`.

Codex does not provide the same hook model as Claude Code. Do not claim that session summaries, format hooks, or review reminders happen automatically unless the current Codex feature set actually supports them.

## Recommended Workflow

1. Explore if the task is still fuzzy.
2. Write or refine a concrete implementation plan.
3. Confirm the active issue and load its ticket context.
4. Implement one ticket at a time with tests first.
5. Run the relevant verification commands.
6. Review `git diff` before committing.
7. Update the ticket context before ending the session.

## Skills Available to Codex

The exported Codex skill set now mirrors the current ECC-style packaged surface where local or shared canonical sources exist. It includes:

- `api-design`
- `article-writing`
- `backend-patterns`
- `brand-voice`
- `bun-runtime`
- `claude-api`
- `coding-standards`
- `content-engine`
- `crosspost`
- `deep-research`
- `dmux-workflows`
- `documentation-lookup`
- `e2e-testing`
- `eval-harness`
- `everything-claude-code`
- `exa-search`
- `fal-ai-media`
- `frontend-patterns`
- `frontend-slides`
- `investor-materials`
- `investor-outreach`
- `market-research`
- `mcp-server-patterns`
- `nextjs-turbopack`
- `security-review`
- `strategic-compact`
- `tdd-workflow`
- `verification-loop`
- `video-editing`
- `x-api`

Canonical content still lives in `skills/` with optional fallback to `AI_SHARED_SKILLS_DIR`; `.agents/skills/` is the Codex-facing packaging layer.

## Optional Multi-Agent Roles

This template includes optional Codex roles under `.codex/agents/`:

- `explorer` — read-only evidence gathering
- `reviewer` — correctness, security, and missing-test review
- `docs-researcher` — documentation and release-note verification

Use them only when delegation materially improves the task.

## Codex-Specific Guardrails

1. Treat the ticket context as authoritative once the plan is confirmed.
2. Do not skip tests because hooks are absent.
3. Keep MCP usage lean and task-specific.
4. Prefer repo-local guidance over generic habits.
5. Document any Codex-specific limitation in the handoff notes when it affects the workflow.
