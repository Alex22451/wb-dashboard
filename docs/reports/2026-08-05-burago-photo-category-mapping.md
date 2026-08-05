# Task Report: Burago Photo Category Mapping

Date: 2026-08-05
Risk: R3

## Objective And Acceptance

- Objective: include Burago orders from the WB subjects `Аксессуары для фотосессий`,
  `Постеры`, and `Фотофон` in reports and warm the corrected order data.
- Acceptance criteria: all requested subject variants map to the existing
  `фотофоны` product type, stale server and browser caches cannot hide the
  correction, production serves the intended commit, and seven complete daily
  order caches are warmed without WB rate-limit errors.
- Authorized scope: WB category mapping, report cache versions, focused logic
  tests, deployment, and cache warmup.
- Assumptions: `Фотофоны` is the accounting product type for these WB subjects.
  The repository and control data contain no separate product types for posters
  or photo-session accessories.

## Roles

- Orchestrator and implementer: root Codex agent.
- Read-only explorer: `burago_mapping_explorer`.
- Independent verifier: `orchestra_reverify`.
- Security and release reviewer: `orchestra_security_final`.

## Changes

- Behavior: the WB subjects `Аксессуары для фотосессий`, the singular alias
  `Аксессуары для фотосессии`, `Постеры`, and `Фотофон` map to `фотофоны`.
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
| Baseline reproduction | Focused mapping tests before implementation | 2 mapping tests failed because the new subjects returned `null` |
| Focused logic | `npm run test:unit` | 14 passed, 0 failed |
| Static checks | `npx tsc --noEmit`; `npm run lint`; `git diff --check` | All exited 0 |
| Regression build | `npm run build` | Next.js production build passed |
| Source control | Local SHA compared with `git ls-remote origin refs/heads/main` | Both were `33e63024d0165ce4591f3ae6be3f63f01cf0f3fe` |
| Production deployment | GitHub deployment and deployment status for the exact SHA | Deployment `5756648325`, status `success` |
| Warmup | Seven sequential production warm requests, one date at a time with 61-second spacing | `2026-07-29` through `2026-08-04`; HTTP 200, Redis OK, zero rate-limit errors for every date |
| Affected data | Full paginated WB Funnel API control for Burago over the warmed period, mapped with the production mapping function | 4 accessory orders plus 1 photo-background order; all 5 map to `фотофоны` |

Verifier verdict: PASS

Security review verdict: PASS; no credential, authorization, database, or secret
handling changes and no findings at any severity.

## Claims Ledger

| Claim | Status | Evidence |
|---|---|---|
| Requested subjects map to `фотофоны` | VERIFIED | Focused tests and the full two-page WB Funnel control response |
| Tests and build passed | VERIFIED | Unit, TypeScript, lint, diff, and production build commands above |
| Remote contains the code commit | VERIFIED | Local and remote SHA equality |
| Production served the code commit | VERIFIED | Deployment `5756648325` is tied to the intended SHA and has status `success` |
| Seven days of order data are warm | VERIFIED | Seven sequential production warm responses with no rate-limit errors |

## Delivery

- Branch/PR: direct `main` delivery under the user's established deployment scheme.
- Commit SHA: `33e63024d0165ce4591f3ae6be3f63f01cf0f3fe`.
- CI run: local focused gates; Vercel Git deployment status verified through GitHub.
- Deployment ID: `5756648325`.
- Rollback point: `6082102aefc26963719d921dd2a11da9222e6163`.

## Limitations And Blockers

- `Постеры` had no orders in the verified seven-day Funnel data. Its mapping is
  verified by automated tests but cannot be evidenced with a non-zero live order
  in this period.
- The warmup covers daily order reports for the last seven completed Moscow days.
  Older dates will populate the new cache version on demand or through scheduled
  warmup.
- WB states that Funnel data updates hourly and a small portion can appear within
  several days, so later upstream corrections can legitimately change counts.
- Blockers requiring user input: none.
