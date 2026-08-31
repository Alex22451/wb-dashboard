# Task Report: Dashboard partial-cache recovery

Date: 2026-08-31
Risk: R2

## Objective And Acceptance

- Objective: restore prompt WB analytics loading when the daily Redis range is only partially populated.
- Acceptance criteria: a partial seven-day cache must not trigger a live reload of all seven days; every date incomplete for any selected seller must be recovered; incomplete data must not be presented as complete; API failures must leave the loading state and produce a visible error; focused, unit, static, build, independent verification, and production smoke gates must pass.
- Authorized scope: dashboard daily-cache read/recovery flow, its focused tests, this report, and delivery.
- Assumptions: the production symptom occurs on the deployed range-loading path; no WB API key, account password, Redis value, database record, schema, or production configuration is changed.

## Roles

- Orchestrator: root Codex agent.
- Implementer: root Codex agent.
- Independent verifier: separate read-only verifier; two review rounds returned `FAIL`, both sets of findings were corrected, final verdict `PASS`.
- Security/database reviewer: not required for R2; no auth, secret, schema, migration, or stored-data format change.

## Changes

- Behavior: the dashboard performs a cache-only range probe, retains cached days internally, and live-recovers only dates missing for at least one selected seller.
- Behavior: live recovery remains sequential and observes the existing 21-second WB analytics interval between non-cached date requests.
- Behavior: failed day recovery produces an explicit dashboard error instead of silently ending with an empty result.
- Behavior: network, malformed-JSON, and upstream WB failures become a fixed, visible error; raw upstream `detail`, `title`, `message`, or exception text is never rendered.
- API contract: `section=daily&cacheOnly=1` never initiates a live WB range load, including internal `refresh=1`, and reports both missing dates and missing entrepreneur IDs across all selected seller/date partitions.
- Recovery contract: the live request targets only missing entrepreneur IDs for a date; the client then performs a complete cache-only read for the original selection and displays the date only when that aggregate is complete.
- Files: `src/app/page.tsx`, `src/app/api/wb-data/route.ts`, cache/error helpers and tests, `package.json`.
- Data or schema impact: none. Redis keys, TTLs, payload formats, credentials, database schema, and stored records are unchanged.

## Verification

| Check | Command or scenario | Exit/result |
|---|---|---|
| Baseline reproduction | production client asset and source trace: `complete=1` rejects a partial range and `fetchFunnelProductOrdersByDate` imposes six 21-second waits for seven dates | VERIFIED: deterministic minimum 126000 ms when one partition is missing |
| TDD RED | focused cache test before helper support for incomplete seller/date partitions | FAILED as expected: expected `2026-08-27`, received no missing dates |
| Focused logic | native Node runner on cache recovery and dashboard error tests | PASS, 10/10, exit 0 |
| Static checks | focused ESLint; `npx --no-install tsc --noEmit`; `git diff --check` | PASS, exit 0 |
| Regression checks | `npm run test:unit` | PASS, 97/97, exit 0 |
| Production build | `npm run build` | PASS, exit 0; TypeScript and 20/20 page generation complete |
| Affected rendered scenario | Playwright/System Chrome with controlled partial-cache and raw-error responses | PASS, 2/2, exit 0; one live request only for missing seller `12`, one final full cache read, safe visible error, no raw test secret or console errors |
| Production smoke | authenticated dashboard load and request trace | pending delivery |

Verifier verdict: final `PASS`; no blocking findings. The two earlier `FAIL` rounds identified seller-level overfetch and raw-error rendering, both corrected before the final gate.

## Claims Ledger

| Claim | Status | Evidence |
|---|---|---|
| Root cause in deployed loading path identified | VERIFIED | production client asset contains the range request; source trace proves partial cache falls through to a full seven-day live reload |
| Current production cache is partial | INFERRED | symptom matches the deterministic path; authenticated cache stats/logs are unavailable without accessing credentials |
| Partial-cache recovery logic works | VERIFIED | RED/GREEN focused tests, 10/10 focused checks; independent source-trace verifier `PASS` |
| Required rendered behavior works | VERIFIED locally | controlled Playwright scenario: one range probe, seller `12`-only live recovery, one complete cache-only aggregate read, visible sanitized failure, no relevant console errors |
| Raw upstream error details are not rendered | VERIFIED | server fixed-error paths, client normalization test, controlled raw-secret browser scenario, verifier `PASS` |
| Remote contains commit | UNVERIFIED | pending delivery |
| Production serves commit | UNVERIFIED | pending deployment and smoke check |

## Delivery

- Branch/PR: `fix/dashboard-cache-latency-seat-cover` reused for the follow-up fix; commit and deployment pending.
- Commit SHA: pending.
- CI run: local deterministic gates above.
- Deployment ID: pending.
- Rollback point: the production deployment currently serving the pre-fix client asset; exact deployment ID must be captured before promotion.

## Limitations And Blockers

- Known limitations: a genuinely cold seven-day cache still requires bounded sequential WB recovery; this fix removes redundant requests but cannot bypass WB's documented request interval.
- Unverified areas: current production cache partition state, rendered authenticated interaction, remote SHA, deployment identity, and production behavior until delivery.
- Blockers requiring user input: none for local implementation and verification.
