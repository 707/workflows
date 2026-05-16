---
id: planner-atomic-issues
description: Planner breaks a multi-feature request into atomic, sequenced issues — not one omnibus issue.
command: /plan
expects:
  must_invoke_agent: planner
  must_not_invoke_tools:
    - Write
    - Edit
    - Bash
  ticket_count_min: 2
  ticket_count_max: 8
  each_ticket_must_contain:
    - "Definition of Done"
    - "Dependencies"
    - "Phase"
---

## Setup

User prompt:

> I want to add Stripe subscriptions with three tiers (Free/Pro/Enterprise), a pricing page, webhook handling for subscription lifecycle, and feature-gating middleware. Ask me any clarifying questions you might have.

## Pass criteria

The planner must:

1. Produce a phased plan covering ALL four areas (database schema, webhook handler, checkout flow, feature gating).
2. After confirmation, create between 2 and 8 separate tickets — not one omnibus ticket.
3. Each ticket must declare its dependencies (sequenced, not all parallel).
4. The planner must NOT call Write, Edit, or Bash during the planning phase itself (writing the ticket files via `gh issue create` is the only allowed Bash, scoped to ticket creation after confirmation).

## Failure modes this catches

- Planner produces one giant issue ("implement Stripe billing")
- Planner starts implementing code mid-planning
- Planner produces issues with no dependency graph
