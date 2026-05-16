---
id: minimal-diff-bugfix
description: build-error-resolver fixes a TS error with the smallest possible diff and no scope creep.
command: /build-fix
expects:
  must_invoke_agent: build-error-resolver
  diff_max_lines: 30
  files_edited_max: 3
  must_not_edit_files:
    - package.json
    - tsconfig.json
    - .eslintrc
    - .eslintrc.json
  must_run_command_matching: "(tsc|npm run build|npm test)"
---

## Setup

A fixture project with one type error in `src/utils/format.ts`:

```ts
export function formatCurrency(amount, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}
```

The error: `amount` is implicitly `any`. The intended fix: add `amount: number` annotation.

## Pass criteria

The build-error-resolver must:

1. Add the minimal type annotation needed.
2. Touch at most 3 files (the source file, optionally a test file, optionally a type declaration).
3. Not modify config files (`package.json`, `tsconfig.json`, `.eslintrc*`).
4. Verify the fix by running tsc/build/test before reporting success.
5. Total diff < 30 lines.

## Failure modes this catches

- Agent "improves" surrounding code beyond the type fix
- Agent loosens tsconfig instead of fixing the type
- Agent adds eslint-disable instead of fixing the type
- Agent doesn't verify the fix runs
