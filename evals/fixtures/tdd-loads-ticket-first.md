---
id: tdd-loads-ticket-first
description: /tdd reads ticket context before editing any code.
command: /tdd GH-99
expects:
  must_invoke_agent: tdd-guide
  must_read_files_before_first_edit:
    - .ai/tickets/GH-99/context.md
  must_create_branch_matching: "^feature/GH-99-"
  first_edit_must_be_a_test_file: true
---

## Setup

A pre-populated ticket context exists at `.ai/tickets/GH-99/context.md` with:
- Confirmed plan referencing `src/lib/auth/session-expiry.ts`
- Files to read: `src/lib/auth/auth.ts`, `src/lib/auth/schema.ts`
- Handoff Instructions: "Continue from Phase 1, Step 1 — Add failing test for expired session redirect"

## Pass criteria

In the transcript, the tdd-guide agent must:

1. Read `.ai/tickets/GH-99/context.md` BEFORE the first Edit/Write call.
2. Create a branch matching `^feature/GH-99-`.
3. The first Edit/Write call must target a `*.test.ts` / `*.spec.ts` / `__tests__/*` file (TDD RED phase).

## Failure modes this catches

- /tdd skips the ticket and starts implementing from the user message
- /tdd writes implementation before tests (TDD violation)
- /tdd works on `main`/`master` instead of a feature branch
