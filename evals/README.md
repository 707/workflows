# Harness Evals

Regression suite for the **harness itself** — not for the project it scaffolds. Every change to `.claude/`, `.ai/agents/`, `scripts/hooks/`, `models.json`, or commands must keep these passing.

## Why this exists

Per the Meta-Harness paper (arXiv 2603.28052) and SWE-bench Pro analysis, scaffold quality alone moves the same model 22 points. Without an eval suite the harness is unfalsifiable — every "improvement" is vibes.

These fixtures are intentionally small and deterministic. They check harness *behavior*, not model intelligence:
- Did the planner produce atomic, sequenced issues?
- Did `/tdd` load the ticket context before editing?
- Did `code-reviewer` flag the right severity?
- Did `build-error-resolver` keep the diff minimal?
- Did the planner avoid touching code (schema-level Plan Mode)?

## Layout

```
evals/
├── README.md              # this file
├── run-evals.js           # CLI runner — see "Running"
└── fixtures/
    ├── *.md               # one fixture per behavior; frontmatter declares grader
```

## Fixture format

```markdown
---
id: failing-test-repair
description: Agent fixes a failing test with a minimal diff
command: /tdd GH-42
expects:
  must_invoke_agent: tdd-guide
  must_read_files:
    - .ai/tickets/GH-42/context.md
  must_not_edit_files:
    - package.json
    - src/auth/schema.ts
  diff_max_lines: 120
  must_run_command_matching: ^npm test
---

## Setup

[How to prepare the working directory before the agent runs — fixtures
can be self-describing or reference a `fixtures/repos/` snapshot.]

## Pass criteria

[Plain prose explaining what success looks like, for the human reviewer.]
```

## Running

```bash
node evals/run-evals.js                    # run all fixtures, print pass/fail
node evals/run-evals.js --fixture <id>     # run one fixture
node evals/run-evals.js --baseline          # snapshot current results as baseline
node evals/run-evals.js --compare <ref>     # diff current results against a tagged baseline
```

Current implementation is **deterministic static checks only** — it parses the fixture frontmatter and asserts against a transcript file passed in via `--transcript <path>`. The intended workflow is:

1. Run a Claude/Gemini session against the fixture's setup
2. Save the transcript to `evals/runs/<run-id>/transcript.jsonl`
3. `node evals/run-evals.js --transcript evals/runs/<run-id>/transcript.jsonl`

LLM-as-judge graders are deliberately not included yet — every grader in this directory is a regex, file-existence check, or diff-size check. Add LLM grading only when deterministic checks demonstrably can't express the criterion.

## What this is NOT

- Not a benchmark of model intelligence — use SWE-bench / TerminalBench for that
- Not a substitute for `/code-review` or `/verify` on application code
- Not a continuous integration target yet — run manually before merging harness PRs

## Roadmap

Once the fixture count is >15 and baselines are stable, wire this into:
- A pre-commit hook on `.claude/`, `.ai/agents/`, `models.json`
- An `/harness-evolve` command that proposes a config diff, runs the suite, opens a PR if pass@k improves (Meta-Harness pattern)
