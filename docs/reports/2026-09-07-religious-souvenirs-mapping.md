# Task Report: Religious souvenirs category mapping

Date: 2026-09-07
Risk: R3 (shared bot classification, production delivery)

## Objective And Acceptance

- Map WB subject `Сувениры религиозные` to canonical type `эзотерика`, display `Эзотерика`.
- No additional article-marker or brand requirements for this category.
- Preserve blacklists, existing overrides, fabric validation and seller isolation.
- Scope: shared Dashboard mapping and focused regression tests; no bot, shelf website or Yandex Disk changes.

## Roles

- Orchestrator and implementer: root.
- Independent verifier: auth_verify — PASS.
- Security/production reviewer: auth_security — PASS WITH GATES (production checks below).

## Changes

- `src/lib/wb-mapping.ts`: one subject-to-type table entry; mapping version changes automatically.
- `src/lib/wb-mapping.test.ts`: category-wide eligibility and unknown/blacklist controls.
- No schema changes, migrations, Redis mutations or cache deletions performed.

## Verification

| Check | Command or scenario | Exit/result |
|---|---|---|
| Baseline | Existing mapping tests | 25 passed, exit 0 |
| Red | Added mapping tests before implementation | 2 expected failures, exit 1 |
| Focused logic | `node --experimental-strip-types --test src/lib/wb-mapping.test.ts` | 27 passed, exit 0 |
| Regression | `npm run test:unit` | 131 passed, exit 0 |
| Production build | `npm run build` | exit 0; initial sandbox port restriction resolved with approved execution |
| Whitespace | `git diff --check` | exit 0 |
| Independent controls | Case/whitespace, empty article/brand, blacklist, unknown subject, version/API contract | PASS |
| Production smoke | Authenticated synthetic category, unknown and blacklist inputs | Pending delivery |

## Claims Ledger

| Claim | Status | Evidence |
|---|---|---|
| Required mapping works locally | VERIFIED | Focused tests and reviewed one-line production diff |
| Regressions pass | VERIFIED | 131 tests; production build exit 0 |
| Remote contains change | UNVERIFIED | Pending push |
| Production serves intended commit | UNVERIFIED | Pending deployment metadata and authenticated smoke |

## Delivery

- Branch: `feat/religious-souvenirs`; PR and deployment evidence to be recorded after publication.
- Rollback point: `5e7526ffec8d897ea16577453c92d869e250f51e`.
- Before production promotion: pause fleet timer and drain an active cycle; restore original timer state after stable API verification.
- Rollback also requires draining; existing WB supplies are not undone by a code rollback.

## Limitations And Blockers

- Existing fabric validation still applies in the bot. Category eligibility alone does not make an article without recognizable fabric assemblable.
- Shared historical analytics caches may retain previous categorization until refresh/expiry (up to existing 180-day retention). No cache reset or namespace change is in scope.
- Yandex Disk preparation/copying is not implemented by this change.
- Live affected-order grouping and unresolved journals remain production verification gates; do not claim end-to-end assembly without observing them.
