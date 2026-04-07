# Shared Skills

This template supports a machine-level shared skill source that is independent of any single harness.

## Canonical Shared Directory

Use one directory on your machine as the canonical shared skill source:

```bash
export AI_SHARED_SKILLS_DIR="$HOME/.shared-agent-skills"
```

Each skill should live in:

```text
$AI_SHARED_SKILLS_DIR/<skill-name>/
  SKILL.md
  agents/
    openai.yaml        # optional
```

Because these are just files on disk, they are readable even without any harness setup. Claude Code, Codex, Gemini, Hermes, or a plain shell script can all read from the same shared directory.

## Precedence

When `project-template` exports Codex skills, it resolves skills in this order:

1. Project-local `skills/`
2. Shared `AI_SHARED_SKILLS_DIR`

Project-local skills win when names collide.

## Scripts

Publish local skills into the shared directory:

```bash
node scripts/publish-skills-to-shared.js tdd-workflow security-review
node scripts/publish-skills-to-shared.js --all
```

Sync shared skills into a harness-global directory such as `~/.agents/skills`:

```bash
node scripts/sync-shared-skills.js
node scripts/sync-shared-skills.js --mode copy
```

Refresh the project-local Codex skill export using project-local skills plus shared fallback:

```bash
node scripts/export-codex-skills.js
```

Sync this template into a Codex home directory and generate prompt-based command equivalents:

```bash
bash scripts/sync-project-template-to-codex.sh
```

## Practical Model

- `skills/` is repo-local and project-specific.
- `AI_SHARED_SKILLS_DIR` is your reusable machine-level library.
- `~/.agents/skills` is a convenient harness-global install target for tools that auto-load skills from there.

That gives you three layers:

1. Project-local skills
2. Shared machine-level skills
3. Harness-global installed skills

You can use the shared directory directly even when no harness is running.
