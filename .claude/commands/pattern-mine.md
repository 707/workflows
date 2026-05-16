---
name: pattern-mine
description: Retrospective trace miner that finds recurring patterns across sessions and proposes them as skills or agents. Three-stage pipeline (deterministic clustering → Sonnet enrichment → Hermes constraint gates) with per-candidate approval.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /pattern-mine — Retrospective Skill & Agent Discovery

Mines `.ai/runs/**/events.jsonl` for recurring patterns, classifies each as a **skill candidate** or **agent candidate** using the rubric from `skills/INDEX.md`, then proposes drafts for user approval. Never auto-saves.

## Usage

```
/pattern-mine                            mine all sessions
/pattern-mine --since 30d                last 30 days only
/pattern-mine --min-occurrences 5        raise recurrence threshold
/pattern-mine --kind skill               only skill candidates
/pattern-mine --kind agent               only agent candidates
/pattern-mine --dry-run                  cluster summary, zero LLM tokens
```

## Pipeline

### Stage 1 — Deterministic clustering (zero LLM tokens)

Run `scripts/pattern-miner.js`. It will:
- Read `.ai/runs/{ticket}/events.jsonl` across all tickets.
- Group events into sessions; build per-session feature vectors (intent TF-IDF, directories, files, tools).
- Cluster sessions by directory overlap + intent similarity (cosine > 0.35) + file/tool overlap.
- Classify each cluster as `skill`, `agent`, or `noise` using the rubric:
  - Long (10+ avg tool calls) + mostly reads → **agent** (dispatch-and-return audit)
  - Long (15+ avg tool calls) → **agent** (context-isolation worthwhile)
  - Short (<8 avg) + writes → **skill** (applied inline)
- Apply Hermes constraint gates: min occurrences, no name collision with existing skills/agents.
- Output JSON to `.ai/runs/pattern-mine-{ts}.json`.

```bash
node scripts/pattern-miner.js --since 30d
```

### Stage 2 — Sonnet enrichment (you do this)

Read the JSON candidates. For each candidate cluster (skip blocked + noise):

1. Read 1–2 representative session transcripts at the `transcript_path` referenced in events.
2. Read the ticket context files for the involved tickets.
3. Produce a draft using the **Hermes 4-section skill template** OR the agent template:

**For skill candidates:**
```yaml
---
name: <kebab-case-name>
description: <≤500 chars, decision-oriented>
stack: <web | python | go | java | swift | cpp | database | general>
origin: pattern-mine
---

## When to Use
[trigger conditions]

## Procedure
[steps]

## Pitfalls
[failure modes]

## Verification
[success signals]
```

**For agent candidates:**
```yaml
---
name: <kebab-case-name>
description: <≤500 chars>
tools: ["Read", "Grep", "Glob", ...]      # default read-only unless writes justified
model: sonnet                              # or opus if role=think/critique
role: <plan|execute|review|think|critique|observe>
---

## Mission
[one paragraph]

## Workflow
[numbered steps]

## Output Shape
[concrete shape]

## Constraints
[what it must not do — schema-level safety]
```

### Stage 3 — Constraint gates + approval (per candidate)

Before saving any candidate:

1. **Size check** — skill ≤ 15KB, description ≤ 500 chars (Hermes).
2. **Duplicate check** — `node scripts/validate-additions.js --quiet` exit 0.
3. **Eval gate** — `node scripts/validate-additions.js --eval-gate` exit 0 (existing fixtures still pass).
4. **User approval** — show the draft, get explicit yes/no per candidate. **Never batch-approve.**

If all gates pass and user approves:
- **Skill** → write `skills/{name}/SKILL.md`, then run `node scripts/update-skills-index.js`.
- **Agent** → write `.ai/agents/{name}.md` (body) + add an entry to `scripts/agent-config.json` (claude + gemini + opencode + codex blocks where applicable), then run `node scripts/gen-agents.js && node scripts/gen-opencode-assets.js && node scripts/gen-codex-assets.js`.

## Cost & Rate Limits

- Stage 1: zero LLM tokens (deterministic).
- Stage 2: 1 Sonnet call per candidate, ~15K tokens input + ~2K output ≈ $0.05–$0.10 per candidate. Typical run: 5–10 candidates, $0.25–$1.
- Stage 3: zero (deterministic validators).
- **Total per run**: well under $1. No rate-limit risk.
- Use `--dry-run` first if you want to inspect clusters without spending anything.

## Output

A summary of:
- Sessions analyzed
- Clusters found
- Candidates classified (skill / agent / noise)
- For each accepted candidate: file path, validator result, regeneration command run
- Next steps

## Anti-patterns

- Approving all candidates in a batch — defeats the purpose of the approval gate.
- Promoting a pattern that already has a skill/agent — Stage 3 should catch this; if it doesn't, reject manually.
- Saving an "agent" candidate with broad write tools by default — start read-only, expand only when needed.
- Running on a project with <5 sessions of trace data — not enough signal.
