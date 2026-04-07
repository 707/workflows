# OpenCode Instructions

Use `AGENTS.md` as the shared workflow baseline.

This OpenCode surface keeps the existing project-template operating model:

1. Explore before planning when the task is still fuzzy.
2. Confirm the plan before writing code.
3. Treat `.ai/tickets/active.md` and the active ticket context as authoritative.
4. Implement one issue at a time with tests first.
5. Review `git diff` and run verification before commit or push.

## OpenCode-Specific Notes

- OpenCode commands in `.opencode/commands/` mirror the template's Claude commands.
- OpenCode agent prompts in `.opencode/prompts/agents/` are generated from `.ai/agents/`.
- This template does not depend on OpenCode-only plugins or tools.
- Prefer the same high-signal workflow skills used elsewhere in the template:
  - `tdd-workflow`
  - `security-review`
  - `coding-standards`
  - `backend-patterns`
  - `frontend-patterns`
  - `e2e-testing`
  - `verification-loop`
  - `api-design`
  - `strategic-compact`
  - `eval-harness`
  - `documentation-lookup`
  - `mcp-server-patterns`
  - `deep-research`

OpenCode support here is repo-local and additive. It should never be the reason the Claude, Gemini, or Codex workflows drift.
