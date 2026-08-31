# Task Report: Dashboard partial-cache recovery

Date: 2026-08-31
Risk: R2 implementation; R3 production incident delivery

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

## Emergency Follow-up: large-cabinet daily orders

### Production baseline and acceptance

- `FAILED` baseline: the authenticated production screenshot for `2026-08-24` through `2026-08-30` showed no daily table and a seller-specific failure for Масляков А.А.
- Acceptance: primary Analytics order totals for all seven requested dates must load and cache even when the auxiliary Statistics FBO/FBS enrichment is rate-limited; incomplete fulfillment data must never appear as zero or complete; Analytics retries must follow WB rate-limit headers and remain bounded; sales/buyouts must remain unchanged.
- Rollback point: local/deployed predecessor `b6314a6`; production main before this follow-up `6fbcd77cabd93dd8b3d080eee67fcaceddafcc8c`.

### Root cause and changed behavior

- `VERIFIED`: the order-total path successfully obtains totals from Seller Analytics and then separately calls `GET /api/v1/supplier/orders` only to enrich FBO/FBS. The old code promoted an enrichment `returnError` into the same fatal `rateLimitErrors` array as a missing primary total, rejected the complete range, and refused to cache the seller partition.
- `VERIFIED`: WB documents Seller Analytics at 3 requests/minute with a 20-second interval and Statistics orders at 1 request/minute with a 1-minute interval. WB also documents bounded 429 retries using `X-Ratelimit-Retry`.
- `INFERRED`: the screenshot's exact upstream status was an auxiliary Statistics limit rather than an Analytics status because production logs are unavailable through the authorized Vercel connector. The code defect is deterministic for any auxiliary 429/401/network error regardless of exact upstream status.
- Analytics calls now reserve process-wide per-account start slots at 21-second intervals and retry 429/461 at most three attempts using the WB retry header with a bounded fallback.
- Statistics FBO/FBS enrichment performs one attempt and never hammers its 1/min endpoint. Its failure becomes a non-blocking warning; complete primary order totals are cached with `fulfillmentComplete=false`.
- The daily UI shows complete totals, hides FBS/FBO filters/cards/rows when enrichment is incomplete, and displays an explicit warning instead of false zeros.
- The sales/buyouts request branch, calculations, cache variant, and toggle behavior are unchanged.

### Follow-up verification

| Check | Command or evidence | Result |
|---|---|---|
| TDD RED | import of missing retry/classification helpers before implementation | FAILED as expected, exit 1 |
| Focused logic | native Node runner on `wb-cache-performance.test.ts` | PASS, 16/16, exit 0 |
| Focused lint | ESLint on the four changed TS/TSX files | PASS, exit 0 |
| Full unit suite | `npm run test:unit` | PASS, 106/106, exit 0 |
| Production build | `npm run build` | PASS, TypeScript and 20/20 pages, exit 0 |
| Whitespace/static diff | `git diff --check` | PASS, exit 0 |
| Independent verifier | current full diff | PASS; no critical/high findings |
| Security/production reviewer | current full diff | PASS WITH RISKS; no critical/high findings |
| Authenticated production smoke | affected large-cabinet recent-week scenario | pending deployment |

### Follow-up claims ledger

| Claim | Status | Evidence |
|---|---|---|
| Auxiliary FBO/FBS failure no longer blocks or prevents caching primary totals | VERIFIED locally | classification/cache tests and source trace |
| Incomplete FBO/FBS is not presented as zero/complete | VERIFIED locally | `fulfillmentComplete` survives day slicing and both server/client merges; UI branches on the flag |
| Analytics 429 handling is bounded and header-aware | VERIFIED locally | retry-delay boundary tests and source trace |
| Remote contains follow-up commit | UNVERIFIED | pending delivery |
| Production serves follow-up commit | UNVERIFIED | pending deployment SHA check |
| Affected authenticated production scenario works | UNVERIFIED | requires post-deployment smoke without exposing credentials |

Final review residuals: scheduling is process-local, so separate instances rely on bounded upstream 429 handling rather than a shared scheduler; a pathological sequence of slow 45-second upstream responses can exceed the 210-second client timeout. These are medium production risks. The required smoke must use the affected large cabinet, verify seven dates and totals, confirm incomplete FBO/FBS is hidden rather than zeroed, record duration below 210 seconds, and confirm the deployment SHA.
