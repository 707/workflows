#!/usr/bin/env bash
set -euo pipefail

MODE="apply"
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
AGENTS_HOME="${AGENTS_HOME:-$HOME/.agents}"
PROMPTS_DEST="$CODEX_HOME/prompts"
AGENTS_FILE="$CODEX_HOME/AGENTS.md"
CONFIG_FILE="$CODEX_HOME/config.toml"
BACKUP_DIR="$CODEX_HOME/backups/project-template-$(date +%Y%m%d-%H%M%S)"

BEGIN_MARKER="<!-- BEGIN PROJECT-TEMPLATE -->"
END_MARKER="<!-- END PROJECT-TEMPLATE -->"

run_or_echo() {
  if [[ "$MODE" == "dry-run" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

compose_block() {
  printf '%s\n' "$BEGIN_MARKER"
  cat "$ROOT/AGENTS.md"
  printf '\n\n---\n\n'
  printf '# Codex Supplement (From project-template .codex/AGENTS.md)\n\n'
  cat "$ROOT/.codex/AGENTS.md"
  printf '\n%s\n' "$END_MARKER"
}

generate_prompt_file() {
  local src="$1"
  local out="$2"
  local name="$3"
  {
    printf '# project-template Codex Prompt: %s\n\n' "$name"
    printf 'Source: %s\n\n' "$src"
    awk '
      NR == 1 && $0 == "---" { fm = 1; next }
      fm == 1 && $0 == "---" { fm = 0; next }
      fm == 1 { next }
      { print }
    ' "$src"
  } > "$out"
}

replace_section() {
  local tmp
  local block
  tmp="$(mktemp)"
  block="$(mktemp)"
  compose_block > "$block"
  awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" -v block="$block" '
    { gsub(/\r$/, "") }
    $0 == begin { skip = 1; while ((getline line < block) > 0) print line; close(block); next }
    $0 == end { skip = 0; next }
    !skip { print }
  ' "$AGENTS_FILE" > "$tmp"
  cat "$tmp" > "$AGENTS_FILE"
  rm -f "$tmp" "$block"
}

run_or_echo mkdir -p "$BACKUP_DIR" "$CODEX_HOME/agents" "$PROMPTS_DEST" "$AGENTS_HOME/skills"
if [[ -f "$AGENTS_FILE" ]]; then
  run_or_echo cp "$AGENTS_FILE" "$BACKUP_DIR/AGENTS.md"
fi
if [[ -f "$CONFIG_FILE" ]]; then
  run_or_echo cp "$CONFIG_FILE" "$BACKUP_DIR/config.toml"
fi

if [[ "$MODE" == "dry-run" ]]; then
  printf '[dry-run] merge project-template AGENTS into %s\n' "$AGENTS_FILE"
else
  if [[ ! -f "$AGENTS_FILE" ]]; then
    compose_block > "$AGENTS_FILE"
  elif awk -v b="$BEGIN_MARKER" -v e="$END_MARKER" '
        { gsub(/\r$/, "") }
        $0 == b { bc++; if (!fb) fb = NR }
        $0 == e { ec++; if (!fe) fe = NR }
        END { exit !(bc == 1 && ec == 1 && fb < fe) }
      ' "$AGENTS_FILE"; then
    replace_section
  else
    {
      printf '\n\n'
      compose_block
    } >> "$AGENTS_FILE"
  fi
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  run_or_echo cp "$ROOT/.codex/config.toml" "$CONFIG_FILE"
fi

for agent_file in "$ROOT/.codex/agents/"*.toml; do
  [[ -f "$agent_file" ]] || continue
  dest="$CODEX_HOME/agents/$(basename "$agent_file")"
  if [[ ! -e "$dest" ]]; then
    run_or_echo cp "$agent_file" "$dest"
  fi
done

while IFS= read -r -d '' command_file; do
  name="$(basename "$command_file" .md)"
  out="$PROMPTS_DEST/project-template-$name.md"
  if [[ "$MODE" == "dry-run" ]]; then
    printf '[dry-run] generate %s from %s\n' "$out" "$command_file"
  else
    generate_prompt_file "$command_file" "$out" "$name"
  fi
done < <(find "$ROOT/.claude/commands" -maxdepth 1 -type f -name '*.md' -print0 | sort -z)

if [[ "$MODE" == "dry-run" ]]; then
  printf '[dry-run] write startup/handoff/verify prompt helpers into %s\n' "$PROMPTS_DEST"
else
  cat > "$PROMPTS_DEST/project-template-startup-checklist.md" <<'EOF'
# project-template Startup Checklist

1. Read `AGENTS.md`
2. Read `.ai/tickets/active.md` if present
3. Read the active ticket context fully
4. Read the files listed under `Files to Read Before Starting`
5. State the exact next action before changing code
EOF

  cat > "$PROMPTS_DEST/project-template-handoff-checklist.md" <<'EOF'
# project-template Handoff Checklist

1. Update the active ticket context
2. Record completed work and in-progress work
3. Add a precise `Continue from:` instruction
4. Review `git diff`
5. Commit or explicitly note why the session is ending without a commit
EOF

  cat > "$PROMPTS_DEST/project-template-verify-and-review.md" <<'EOF'
# project-template Verify and Review

1. Run the relevant tests
2. Run build, lint, and typecheck as appropriate
3. Review `git diff`
4. Look for correctness, security, regression, and missing-test risks
5. Summarize findings before pushing or opening a PR
EOF
fi

if [[ -d "${AI_SHARED_SKILLS_DIR:-$HOME/.shared-agent-skills}" ]]; then
  if [[ "$MODE" == "dry-run" ]]; then
    node "$ROOT/scripts/sync-shared-skills.js" --dry-run --mode link --target "$AGENTS_HOME/skills"
  else
    node "$ROOT/scripts/sync-shared-skills.js" --mode link --target "$AGENTS_HOME/skills"
  fi
fi

printf '[project-template-sync] Completed in %s mode\n' "$MODE"
