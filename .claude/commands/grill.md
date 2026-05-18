---
description: Interrogate a plan or design relentlessly, one question at a time, until shared understanding is reached. Use standalone to stress-test an existing plan, or invoked automatically as Phase 0 of /plan.
---

# Grill Command

Invokes the **`grill-me` skill** to interview you relentlessly about a plan or design before any code is written.

## Usage

```
/grill                          — grill the current conversation's plan/intent
/grill "<plan or design>"       — grill a specific plan you paste/describe
```

## What This Command Does

Loads `skills/grill-me/SKILL.md` and follows its protocol:

1. Walks the decision tree one branch at a time
2. Asks **one question at a time** with a recommended answer + trade-off
3. Resolves codebase-answerable questions by reading code, not asking
4. Exits when you could write a one-paragraph plan without hedging

## When to Use

- **Before `/plan`** — if you want to be grilled on an idea before any plan exists. Or just run `/plan` directly; grilling is Phase 0 of the planner.
- **After `/plan`** — when a draft plan exists and you want adversarial questioning before locking it in via `/ticket`.
- **Mid-implementation** — when you hit an unexpected branch and need to pin down the decision before continuing.

## When NOT to Use

- Small, mechanical changes (rename, single-file edit, dep bump). The skill's "skip grilling" clause covers these.
- Bug fixes with a single obvious cause — go straight to TDD.

## Relationship to `/plan`

`/plan` already runs the `grill-me` skill as its **Phase 0**. Use `/grill` only when you want grilling **without** plan production — e.g., to interrogate an existing plan, or to firm up an idea before invoking `/plan`.

## Related

- `skills/grill-me/SKILL.md` — the underlying skill
- `.claude/commands/plan.md` — the planner that invokes grilling automatically
