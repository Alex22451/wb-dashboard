# Task Report: Dashboard cache latency and seat-cover FBS mapping

Date: 2026-08-24
Risk: R3

## Objective And Acceptance

- Objective: restore fast WB Dashboard loading without incomplete data and add the production WB category `Чехлы на сиденья` as a separate FBS supply category.
- Acceptance criteria: remove the deterministic 3–5 minute wait path; keep live WB requests inside documented limits; require complete data for normal dashboard loads; preserve exact per-day totals when slicing range responses; classify live seat-cover cards as `накидки на сиденье`; pass independent verification and production smoke checks.
- Authorized scope: WB Dashboard cache/data-loading flow, shared WB/FBS mapping, focused tests, report, and production deployment.
- Assumptions: existing WB, Redis, authentication, and bot credentials remain unchanged; the FBS bot continues to consume the Dashboard classification contract.

## Roles

- Orchestrator and implementer: root Codex agent.
- Independent verifier: separate read-only verifier agent; corrected version verdict `PASS`.
- Security/database reviewer: separate read-only production-risk agent; corrected version verdict `PASS WITH RISKS` with no blocking code finding.

## Changes

- Behavior: the daily warm job refreshes one seven-day range per seller. The range is reconstructed through the supported daily product endpoint with its documented 21-second pacing; the prior fixed 61-second order/sales/monthly/production/ad chain is gone.
- Behavior: a dashboard load asks Redis for one complete range and slices the response into browser day caches. A genuinely cold range of at most seven days may be restored live; longer periods require a complete Redis cache and return an explicit incomplete-data error instead of entering a multi-minute unsupported history loop.
- Behavior: `complete=1` bypasses a partial Redis early return, so partial seller data is not presented as complete or retried indefinitely by the browser.
- Security: cron authentication now fails closed, uses a trusted environment origin instead of forwarded headers, keeps WB keys out of URLs, has a 240-second budget and a Redis single-flight lock, and no longer prunes historical Redis keys.
- Behavior: WB subject `Чехлы на сиденья` maps to `накидки на сиденье`; the shared FBS classifier returns the separate supply category `Накидки на сиденье`.
- Files: `src/app/api/cache/warm-wb/route.ts`, `src/app/api/wb-data/route.ts`, `src/app/page.tsx`, `src/lib/wb-cache-performance.ts`, focused tests, `src/lib/wb-mapping.ts`, `package.json`.
- Data or schema impact: no database schema, Redis key format, stored payload version, credential, or destructive operation changed.

## Verification

| Check | Command or scenario | Exit/result |
|---|---|---|
| Baseline reproduction | deterministic calculation from current 3 forced order days, bridge pause, 3 sales days; default 7-day client path | cron sleep floor `305000 ms`; client sleep floor `122000 ms` |
| Focused cache and mapping logic | native Node runner on `src/lib/wb-cache-performance.test.ts` and `src/lib/wb-mapping.test.ts` | PASS, 28/28 |
| Unit regression | `npm run test:unit` | PASS, 90/90, exit 0 |
| Static checks | focused ESLint; `npx --no-install tsc --noEmit`; `git diff --check` | PASS, exit 0 |
| Production build | `npm run build` | PASS, exit 0 |
| Production evidence | deployment timing, authenticated cache response, live classifier, and bot cycle | pending |

Verifier verdict: `PASS`. Production/security verdict: `PASS WITH RISKS`; residual risks are a self-expiring lock after an exceptional exit and the documented cache-only behavior for cold periods longer than seven days.

## Claims Ledger

| Claim | Status | Evidence |
|---|---|---|
| Root cause identified | VERIFIED | production source has a 305-second warm-job sleep floor and a 122-second default browser sleep floor |
| Complete seven-day and cache-only longer-range behavior works locally | VERIFIED | focused cache tests and full unit/static/build checks |
| Seat-cover category is classified separately locally | VERIFIED | exact production subject/article control test |
| Remote contains commit | UNVERIFIED | pending delivery |
| Production serves commit and is faster | UNVERIFIED | pending deployment smoke |
| Bot creates or reuses a separate seat-cover supply | UNVERIFIED | pending production bot cycle |

## Delivery

- Branch/PR: `fix/dashboard-cache-latency-seat-cover`; local delivery is used because this VPS/Vercel project is currently operated without GitHub PR delivery.
- Commit SHA: pending.
- CI run: local deterministic gates listed above.
- Deployment ID: pending.
- Rollback point: `84fe83345f0b9f52a819c0a038e752109888ef38` and production deployment `dpl_HQX6a9DS3mTUZMUrMQWHj8wBTc1X`.

## Limitations And Blockers

- Known limitations: a genuinely cold seven-day range still needs roughly two minutes because WB permits only three product-funnel requests per minute. Periods longer than seven days load quickly only when their Redis cache is complete; missing historical days are reported rather than fabricated.
- Unverified areas: production cache completeness and Vercel cron duration until deployment and smoke checks.
- Production configuration blocker: Vercel currently has no `CRON_SECRET` variable. Adding a new production secret is an R4 environment change and requires the owner's exact confirmation before deployment.
