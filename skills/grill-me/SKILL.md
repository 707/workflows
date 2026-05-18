---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me". Also invoked as Phase 0 of the planner agent before any implementation plan is drafted.
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Stop conditions

Exit grilling and report "ready to plan" when **all** of these hold:

- You could write a one-paragraph plan summary without hedging words ("probably", "maybe", "depends on").
- You know what to build, where it goes in the codebase, and what it must NOT do.
- You have an explicit answer for every decision that would change the plan's shape if reversed.

If the task is small and unambiguous (rename, single-file edit, dependency bump), skip grilling and go straight to the plan. State the assumption you're making so the user can correct it.

## Question shape

Each question should:

1. Name the decision (not just "what do you think?").
2. Offer your **recommended answer** with one-sentence reasoning.
3. Surface the trade-off you'd accept by going the other way.

Bad: "How do you want to handle auth?"
Good: "Auth on the new endpoint: my recommendation is session-cookie + CSRF token, since the rest of the app uses that pattern. The alternative is a bearer token, which would let you call this from a CLI later but adds a token-refresh flow. Stick with session-cookie?"

## Order of attack

Grill in this order — high-leverage decisions first, so later branches collapse:

1. **Scope boundary**: what's in, what's explicitly out
2. **Data model / contract**: schemas, types, API shapes
3. **Failure modes**: what happens when X breaks
4. **Integration points**: who calls this, what does it call
5. **Migration / rollout**: how it ships without breaking prod

Surface answers you can find by reading code (existing patterns, current schemas, existing handlers) by reading code — do not ask the user.

---

*Vendored from [mattpocock/skills/skills/productivity/grill-me](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md). Local additions: stop conditions, question shape, order-of-attack guidance.*
