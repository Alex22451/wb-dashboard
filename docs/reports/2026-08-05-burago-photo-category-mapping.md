# Task Report: Burago Photo Category Mapping

Date: 2026-08-05
Risk: R3

## Objective And Acceptance

- Objective: include Burago orders from the WB subjects `Аксессуары для фотосессий`,
  `Постеры`, and `Фотофон` in reports and warm the corrected order data.
- Acceptance criteria: accessories, posters, and photo backgrounds remain three
  distinct report categories; stale server and browser caches cannot hide the
  correction; production serves the intended commit; and seven complete daily
  order caches are warmed without WB rate-limit errors.
- Authorized scope: WB category mapping, report cache versions, focused logic
  tests, deployment, and cache warmup.
- Correction: the first release incorrectly assumed that all three WB subjects
  should be combined as `фотофоны`. User production feedback showed that the
  requested categories must remain separate.

## Roles

- Orchestrator and implementer: root Codex agent.
- Read-only explorer: `burago_mapping_explorer`.
- Independent verifier: `orchestra_reverify`.
- Security and release reviewer: `orchestra_security_final`.

## Changes

- Behavior: `Аксессуары для фотосессий` and its singular alias map to
  `аксессуары для фотосессии`; `Постеры` maps to `постеры`; `Фотофон` and
  `Фотофоны` retain the existing `фотофоны` category.
- Files: `src/lib/wb-mapping.ts`, `src/app/api/wb-compare/route.ts`,
  `src/app/api/wb-data/route.ts`, `src/app/page.tsx`, and
  `src/lib/wb-mapping.test.ts`.
- Cache impact: advanced Redis daily orders, daily sales, and report versions;
  advanced browser daily and report versions. Existing cache entries remain
  intact but are no longer read by the corrected code.
- Data or schema impact: no database schema, stored records, API keys, auth,
  permissions, or WB request contracts changed.

## Verification

| Check | Command or scenario | Exit/result |
|---|---|---|
| Baseline reproduction | Focused separation tests before the correction | 2 tests failed because accessories and posters both returned `фотофоны` |
| Focused logic | `npm run test:unit` | 14 passed, 0 failed |
| Static checks | `npx tsc --noEmit`; `npm run lint`; `git diff --check` | All exited 0 |
| Regression build | `npm run build` | Next.js production build passed |
| Source control | Local SHA compared with `git ls-remote origin refs/heads/main` | Both were `b5cfe2b64c9d9680d60409a87fe0584bf77c44de` |
| Production deployment | GitHub deployment and deployment status for the exact SHA | Deployment `5759763982`, status `success` |
| Warmup | Seven sequential production warm requests, one date at a time with 61-second spacing | `2026-07-29` through `2026-08-04`; HTTP 200, Redis OK, zero rate-limit errors for every date |
| Affected data | Full two-page WB Funnel control for Burago over the warmed period, mapped with the release mapping function | 4 orders map to `аксессуары для фотосессии`; 1 maps to `фотофоны`; distinct mapped types: 2 |
| Poster history | Full four-page WB Funnel control for the latest 30 completed days | No poster orders returned; the separate `постеры` mapping is covered by focused tests |

Verifier verdict: PASS

Security review verdict: PASS; no credential, authorization, database, or secret
handling changes and no findings at any severity.

## Claims Ledger

| Claim | Status | Evidence |
|---|---|---|
| Requested subjects remain separate categories | VERIFIED | Focused tests, independent three-key control, and paginated WB Funnel control |
| Tests and build passed | VERIFIED | Unit, TypeScript, lint, diff, and production build commands above |
| Remote contains the code commit | VERIFIED | Local and remote SHA equality |
| Production served the code commit | VERIFIED | Deployment `5759763982` is tied to the intended SHA and has status `success` |
| Seven days of order data are warm | VERIFIED | Seven sequential production warm responses with no rate-limit errors |

## Delivery

- Branch/PR: direct `main` delivery under the user's established deployment scheme.
- Commit SHA: `b5cfe2b64c9d9680d60409a87fe0584bf77c44de`.
- CI run: local focused gates; Vercel Git deployment status verified through GitHub.
- Deployment ID: `5759763982`.
- Rollback point: `780ee29f425acbdd7fe11242a83c7343f8fc02b6`.

## Limitations And Blockers

- `Постеры` had no orders in the verified seven-day or 30-day Funnel data. Its
  separate mapping is verified by automated tests but cannot be evidenced with a
  non-zero live order in those periods. The report does not fabricate a row with
  orders that WB did not return.
- The warmup covers daily order reports for the last seven completed Moscow days.
  Older dates will populate the new cache version on demand or through scheduled
  warmup.
- WB states that Funnel data updates hourly and a small portion can appear within
  several days, so later upstream corrections can legitimately change counts.
- Blockers requiring user input: none.
