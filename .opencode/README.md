# OpenCode Support

This template includes a lightweight OpenCode surface that mirrors the existing project-template workflow instead of introducing a separate operating model.

## What Is Included

- `.opencode/opencode.json` for repo-local OpenCode configuration
- `.opencode/instructions/INSTRUCTIONS.md` for OpenCode-specific workflow notes
- `.opencode/commands/` generated from `.claude/commands/`
- `.opencode/prompts/agents/` generated from `.ai/agents/`

## Regeneration

If you edit `.ai/agents/` or `.claude/commands/`, regenerate the OpenCode-facing assets with:

```bash
node scripts/gen-opencode-assets.js
```

## Scope

This is intentionally narrower than ECC:

- it keeps the ticket-context workflow
- it reuses the existing canonical commands and agents
- it does not bundle OpenCode plugins or native tools
- it does not change Claude, Gemini, or Codex behavior
