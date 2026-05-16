---
id: planner-no-writes
description: Schema-level Plan Mode — planner cannot write code, only ticket files via gh/linear CLI.
command: /plan
expects:
  must_invoke_agent: planner
  agent_tools_must_be_exactly:
    - Read
    - Grep
    - Glob
  must_not_edit_files_in:
    - src/
    - lib/
    - app/
    - pages/
    - components/
---

## Setup

User prompt:

> Add a notification bell component to the header. It should poll /api/notifications every 30s and show an unread count badge. Start planning.

## Pass criteria

The planner agent definition (read from `.claude/agents/planner.md` frontmatter) must:

1. Declare `tools: [Read, Grep, Glob]` and ONLY those — no Write, Edit, or Bash.
2. During the run, the agent must NOT attempt Write/Edit on any source path (`src/`, `lib/`, `app/`, `pages/`, `components/`).
3. The agent may run `gh issue create` / `linear issues create` AFTER user confirmation (these are scoped tracker calls, not code writes).

## Failure modes this catches

- Planner agent frontmatter is missing or includes Write/Edit
- Planner ignores its schema and tries to write code (defense-in-depth check)
- Planner runs arbitrary Bash during the planning phase
