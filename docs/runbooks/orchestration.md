# Verified Multi-Agent Workflow

This is the operating runbook for the `wb-dashboard` orchestra pilot.

## Task Routing

| Tier | Examples | Required roles | Release gate |
|---|---|---|---|
| R0 | Read-only audit | Orchestrator | Evidence-backed report |
| R1 | Docs, narrow reversible code | Implementer or root | Focused checks and root review |
| R2 | Calculations, UI behavior, API mapping, cache | Implementer + verifier | Quality CI + affected scenario |
| R3 | Production, auth, infrastructure, data migration | Implementer + verifier + security_db | R2 gates + deploy SHA + smoke test |
| R4 | Destructive data, secrets, permissions, billing | R3 roles + user | Exact confirmation before action |

## Execution

1. Read `AGENTS.md` and write acceptance criteria before editing.
2. Record the current branch, dirty files, rollback commit, and failing baseline.
3. Use read-only exploration for unfamiliar systems. Do not expose API keys.
4. Assign one writer per file. Use a worktree for independent parallel writers.
5. Write focused logic tests from real examples and edge cases.
6. Run local gates before creating the PR:

```bash
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
```

7. Give the verifier the original requirement, acceptance criteria, and diff,
   without the implementer's conclusion. A `FAIL` returns to implementation.
8. Open a PR for R2-R3. Complete the claims ledger and allow automatic merge only
   after required checks pass. A Codex verdict other than exact `PASS`, malformed
   review output, or a missing review must fail closed.
9. For R3, verify Vercel deployment success belongs to the merged SHA and run the
   affected production scenario. An HTTP 200 alone is insufficient.
10. Save the final report under `docs/reports/`.

## WB Data Evidence

Claims that WB data is loaded or correct require:

- official endpoint and field semantics;
- requested and actual Moscow date range;
- all intended entrepreneur targets;
- category and fulfillment mapping;
- cache key/version and invalidation behavior;
- retries and documented delay behavior;
- counts or control rows from the raw response;
- explicit rate-limit, missing-target, and partial-result status.

Do not describe a warmup as complete when any intended cabinet failed. Report the
successful cabinets and failed cabinets separately.

## Autonomous Operation

- Local Codex may implement, review, push, merge, deploy, and fix CI for R0-R3.
- GitHub `Quality gates` becomes active after this workflow is committed and a
  real GitHub Actions run completes successfully.
- `Independent Codex review` remains skipped until the repository variable
  `CODEX_REVIEW_ENABLED=true` and secret `OPENAI_API_KEY` are configured.
- Do not report cloud review as active until a real PR receives a verifier verdict.
- When blocked, preserve the branch and evidence, then wait for the user in Codex.
- Governance files listed as R4 in `AGENTS.md` require the user's exact approval;
  `CODEOWNERS` provides an additional GitHub-side review boundary once branch
  protection is configured to require code-owner review.

## Emergency Rollback

Rollback is authorized without waiting only for an active outage, security
incident, or data-loss risk. Record the trigger, reverted SHA/deployment, health
evidence, and follow-up fix. R4 data restoration, secret rotation, and other R4
actions still require the exact confirmation required by `AGENTS.md`.
