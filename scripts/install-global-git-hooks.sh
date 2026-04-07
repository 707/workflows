#!/usr/bin/env bash
set -euo pipefail

MODE="apply"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --force) FORCE=1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$ROOT/scripts/git-hooks"
INSTALL_DIR="${PROJECT_TEMPLATE_GIT_HOOKS_DIR:-$HOME/.config/project-template-git-hooks}"

run_or_echo() {
  if [[ "$MODE" == "dry-run" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

existing_hooks_path="$(git config --global --get core.hooksPath || true)"
if [[ -n "$existing_hooks_path" && "$existing_hooks_path" != "$INSTALL_DIR" && "$FORCE" -ne 1 ]]; then
  cat >&2 <<EOF
Refusing to overwrite existing global core.hooksPath:
  $existing_hooks_path

Re-run with --force to replace it, or set PROJECT_TEMPLATE_GIT_HOOKS_DIR first.
EOF
  exit 1
fi

run_or_echo mkdir -p "$INSTALL_DIR"
run_or_echo cp "$SOURCE_DIR/pre-commit" "$INSTALL_DIR/pre-commit"
run_or_echo cp "$SOURCE_DIR/pre-push" "$INSTALL_DIR/pre-push"
run_or_echo chmod +x "$INSTALL_DIR/pre-commit" "$INSTALL_DIR/pre-push"
run_or_echo git config --global core.hooksPath "$INSTALL_DIR"

cat <<EOF
[project-template git hooks] Installed hooks into:
  $INSTALL_DIR

Bypass temporarily:
  PROJECT_TEMPLATE_SKIP_GIT_HOOKS=1 git ...

Disable for one repository:
  touch .project-template-hooks-disable

Rollback:
  git config --global --unset core.hooksPath
EOF
