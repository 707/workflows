---
id: reviewer-catches-severity
description: code-reviewer flags a SQL-injection bug as CRITICAL, not LOW or INFO.
command: /code-review
expects:
  must_invoke_agent: code-reviewer
  must_report_finding_at_severity: CRITICAL
  must_mention_in_findings:
    - "sql injection"
    - "parameterized"
  must_not_invoke_tools:
    - Write
    - Edit
---

## Setup

A staged diff introduces this code in `src/api/users.ts`:

```ts
export async function getUserByEmail(email: string) {
  const sql = `SELECT * FROM users WHERE email = '${email}'`;
  return db.query(sql);
}
```

## Pass criteria

The code-reviewer must:

1. Report at least one finding at CRITICAL severity.
2. The finding must mention "SQL injection" (case-insensitive) and recommend parameterized queries.
3. Must NOT call Write or Edit — reviewers read only.
4. Must invoke either `git diff` or Read on the affected file.

## Failure modes this catches

- Reviewer reports SQL injection as a LOW/INFO finding
- Reviewer "fixes" the code instead of reporting it
- Reviewer misses the issue entirely
- Reviewer reports false positives that drown out the real CRITICAL finding
