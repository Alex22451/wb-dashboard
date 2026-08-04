# WB Dashboard: Project Rules

This file is the persistent operating agreement for work in this repository.
Read it before analyzing or changing the project. The user's newest explicit
instruction for a task may refine these rules.

## 0. Orchestra Pilot

- Use the global `orchestrate-project-work` skill for substantial changes.
- The root agent owns decisions, integration, release, and final claims.
- Classify every implementation task as `R0` through `R4` before editing.
- R2 changes require an independent verifier that did not implement the change.
- R3 changes also require a security/database/production risk review and a real
  post-deployment smoke check tied to the intended commit.
- R4 actions always require the user's exact confirmation. In this repository,
  R4 includes destructive data or Redis operations, API-key access or mutation,
  permission changes, billing, disabling safeguards, force-push, and changes to
  orchestration governance in `AGENTS.md`, `.codex/**`, `.github/workflows/**`,
  `.github/codex/**`, or `.github/CODEOWNERS`.
- Prefer read-only parallel exploration. Use one writer per file or isolated
  worktrees with disjoint ownership.
- A subagent conclusion is not evidence. The root agent must inspect raw diffs,
  command results, API completeness, remote SHA, and deployment status itself.
- Material final claims use `VERIFIED`, `OBSERVED`, `INFERRED`, `UNVERIFIED`, or
  `FAILED`. Do not say "done" while a required claim is unverified.

## 1. Permission And Scope

- Do not change any project section without explicit permission from the user.
- Permission for a concrete task covers all files reasonably required to finish
  that task, including shared utilities, types, focused tests, and configuration.
- Do not use a task as permission for unrelated refactoring or feature work.
- A critical bug may be fixed without prior permission. A bug is critical when it
  causes credential exposure, authorization bypass, data loss or corruption,
  production outage, or demonstrably false business or financial results.
- Keep an unsolicited critical fix as small as possible and clearly report it.
- If a non-critical problem is found outside the permitted scope, report it but
  do not change it.

## 2. Data Correctness

- The primary objective is truthful, reproducible data, not merely matching the
  current site, workbook, cache, or an accidental historical value.
- Treat a user-provided expected example as the acceptance reference for the
  task. Determine and document why it is correct instead of hard-coding output.
- For WB data, prefer official WB API semantics and current official WB API
  documentation over guesses or legacy implementation behavior.
- Validate field units, percentages, signs, time ranges, fulfillment model,
  warehouse, and aggregation level before using WB values in calculations.
- Never hide a discrepancy. Where calculations are presented, expose the data
  source, relevant formula, and reason for any meaningful difference.
- Do not fabricate missing values, silently replace them with zero, or present
  incomplete data as final.
- Before deployment, verify changed calculation logic against several real
  control examples, including normal values and important edge cases.

## 3. WB API

- Never read for display, print, log, rotate, replace, delete, or otherwise modify
  WB API keys unless the user gives explicit permission for key work.
- Secrets must not enter commits, reports, fixtures, screenshots, command output,
  client-side bundles, or error messages.
- Follow the official rate limit and retry requirements for the specific WB API
  endpoint. Use the documented delay and `Retry-After` when supplied.
- Retries must be bounded and must not create a realistic rate-limit or duplicate
  mutation risk. Use backoff and jitter only when compatible with WB documentation.
- Cache WB responses when it reduces API load without making displayed data
  misleading. Cache identity and lifetime must match the endpoint and query.
- When required WB data is incomplete, retry safely and show only a loading state
  until a complete result is available. Do not show stale data as a fallback.
- Avoid prolonged loading through correct batching, caching, request deduplication,
  and endpoint-specific retry handling.
- The interface does not need to show the last successful WB refresh time unless
  a future task explicitly requires it.

## 4. Calculations And Tests

- Add or run focused automated tests for changed business logic.
- Do not add visual regression or design test suites unless explicitly requested.
- Type checking, linting, and a production build are validation steps rather than
  design tests; run the ones relevant to the changed code and deployment risk.
- Test formulas with multiple real reference examples and boundary cases. Include
  missing data, zero values, invalid ratios, loss-making rows, and API failures
  when relevant.
- Do not change tests merely to approve incorrect behavior. Correct the underlying
  implementation or explicitly revise the accepted business rule.

## 5. Database And Stored Data

- Database schemas, Redis structures, and stored-data formats may be changed when
  required by an authorized task, provided the change will not break existing data.
- Prefer backward-compatible reads and controlled migrations for format changes.
- A backup is not mandatory for every database change, but the migration and
  rollback behavior must still be understood before deployment.
- Deleting records, tables, Redis keys, stored datasets, or performing destructive
  bulk updates always requires separate explicit confirmation.
- Never use production data mutation as an experiment.

## 6. Interface

- Preserve the established project design and interaction patterns unless the
  user authorizes a redesign.
- Check changed interfaces on desktop and mobile sizes. This does not require an
  automated design test suite.
- Make source, formula, loading, error, and incomplete-data states unambiguous.
- Do not make cosmetic changes outside the authorized section.

## 7. Code And Dependencies

- Existing code inside the authorized scope may be simplified or removed when it
  is obsolete and the removal is verified not to break supported behavior.
- New npm dependencies are allowed when they are justified, maintained, and a
  better choice than existing project or platform capabilities.
- Keep unrelated working-tree changes intact. Work with them when necessary and
  never discard or overwrite user changes merely to obtain a clean Git state.
- Use the language most suitable for the artifact: preserve the existing UI
  language, use clear code conventions, and write user-facing reports clearly.

## 8. Git And Deployment

- After the user authorizes a task, commits, pushes, and deployments may be made
  without requesting additional approval.
- R0-R1 may use direct `main` delivery when the diff is narrow and reversible.
- R2-R3 should use a branch and pull request, required CI, independent review,
  and automatic merge after all gates pass. The root agent may merge and deploy
  without another routine approval.
- Before risky work, identify a known good commit that can serve as the rollback
  point. Normal Git history is sufficient for routine changes; use a branch or tag
  when the risk warrants a stronger marker.
- Commit only intended task files. Do not include unrelated reports or local files.
- Vercel does not need to be checked after every push. Check it when requested or
  for every R3 production change. Verify the deployment belongs to the intended
  commit and run the affected production scenario, not only an HTTP health check.
- If a production deployment fails, diagnose, fix, and redeploy. Do not default to
  rollback unless the failure causes an outage, data risk, or cannot be fixed safely.

## 9. Reporting

- After a completed implementation task, provide a short report containing the
  objective, acceptance criteria, risk tier, assigned roles, changed behavior,
  important files, exact verification commands, verifier verdict, commit, and
  deployment status when applicable.
- Store durable reports under `docs/`. Use a clear dated filename and avoid
  duplicating a report when an existing task report can be updated.
- Reports must describe known limitations and unresolved discrepancies.
- Reports for R2-R4 include a compact claims ledger mapping material claims to
  evidence and status. Use `docs/reports/TEMPLATE.md` as the starting structure.
- Never include API keys, credentials, access tokens, or other secrets in reports.
