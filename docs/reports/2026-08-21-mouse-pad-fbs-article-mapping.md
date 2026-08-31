# Task Report: Mouse Pad FBS Article Mapping

Date: 2026-08-21
Risk: R2

## Objective And Acceptance

- Objective: add a safe FBS fallback that classifies an otherwise unknown WB
  subject as `коврики для мыши` when its article contains the separate,
  case-insensitive `_коврик_` token.
- Acceptance criteria: `ДевочкаАниме_коврик_20178_ЗА` produces the canonical
  mouse-pad product type; upper-case token spelling also works; partial words do
  not trigger the fallback; blacklist, `Коврики пляжные`, `Коврики для намаза`,
  and other known subject mappings retain priority.
- Authorized scope: shared FBS classification logic, focused unit tests, mapping
  semantics version, and this report. No push or deployment.
- Assumptions: the fallback applies only to FBS classification and only when no
  full known subject mapping exists; underscores on both sides are part of the
  required article convention.

## Roles

- Orchestrator: root Codex agent.
- Implementer: `dashboard_mousepad_mapping` in isolated worktree
  `.worktrees/mouse-pad-fbs-mapping`.
- Independent verifier: pending root-orchestrated R2 verification.
- Security/database reviewer: not required for R2; no auth, secret, database, or
  storage scope.

## Changes

- Behavior: an unknown subject with `/_коврик_/i` in its article is eligible as
  `коврики для мыши`; short/empty subjects still fail closed.
- Precedence: blacklist is evaluated first; known subject mapping is evaluated
  before the new article fallback.
- Mapping identity: advanced `FBS_CLASSIFICATION_SEMANTICS_VERSION` to
  `article-mouse-pad-v3`, producing mapping hash
  `621b118ece6eabea682b3997438f6ea005b600cc68c385ca399e037c3c784b4f`.
- Files: `src/lib/wb-mapping.ts`, `src/lib/wb-mapping.test.ts`, and this report.
- Data or schema impact: none. No database, Redis, API key, auth, dependency, or
  external API changes.

## Verification

| Check | Command or scenario | Exit/result |
|---|---|---|
| Baseline focused suite | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test src/lib/wb-mapping.test.ts` | Exit 0; 18 passed before test changes |
| Baseline reproduction | Direct `classifyFbsProduct` call for `ДевочкаАниме_коврик_20178_ЗА` with an unknown subject | Exit 0; observed `{ "kind": "blocked_unknown_category" }` |
| TDD RED | Focused mapping test after adding acceptance tests, before production changes | Expected exit 1; 19 passed, 2 failed only for missing fallback and old semantics version |
| Focused logic GREEN | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test src/lib/wb-mapping.test.ts` | Exit 0; 21 passed, 0 failed |
| Full unit regression | `npm run test:unit` | Exit 0; 75 passed, 0 failed |
| TypeScript | `../../node_modules/.bin/tsc --noEmit` | Exit 0 |
| Relevant lint | `../../node_modules/.bin/eslint src/lib/wb-mapping.ts src/lib/wb-mapping.test.ts` | Exit 0 |
| Diff hygiene | `git diff --check` | Exit 0 |
| Affected scenario | Direct call for unknown subject + `ДевочкаАниме_коврик_20178_ЗА` | Exit 0; eligible `коврики для мыши`, display `Коврики для мыши` |
| Priority controls | Focused tests for `Коврики пляжные`, `Коврики для намаза`, `Постеры`, and blacklisted `Картины`, all with `_коврик_` articles | Passed in focused and full unit suites |
| Production smoke | Not run; deployment is outside the authorized task scope | UNVERIFIED |

Verifier verdict: PENDING independent R2 verification.

## Claims Ledger

| Claim | Status | Evidence |
|---|---|---|
| Exact and case-insensitive `_коврик_` articles receive the mouse-pad fallback | VERIFIED | Focused tests and direct affected-scenario command |
| Partial article words do not trigger the fallback | VERIFIED | Focused boundary controls |
| Blacklist and known subjects retain priority | VERIFIED | Four focused priority controls plus full mapping regression |
| Tests and relevant static checks pass | VERIFIED | Commands and zero exit statuses above |
| Independent verifier passed | UNVERIFIED | Root-orchestrated R2 verdict pending |
| Remote contains commit | UNVERIFIED | Push was explicitly excluded |
| Production serves commit | UNVERIFIED | Deployment was explicitly excluded |

## Delivery

- Branch/PR: local branch `fix/mouse-pad-fbs-mapping`; no PR or push.
- Commit SHA: task commit containing this report; exact immutable SHA is recorded
  in the implementer handoff because a commit cannot self-reference its own SHA.
- CI run: not run; local deterministic checks are recorded above.
- Deployment ID: none.
- Rollback point: `6890ecadb9b658ad8c53436c296dc9901f9e3313`.

## Limitations And Blockers

- Known limitation: the fallback intentionally requires literal underscores
  immediately around `коврик`; hyphenated, spaced, plural, or embedded forms stay
  blocked for unknown subjects.
- Unverified areas: independent verifier verdict, remote CI, and production.
- Blockers requiring user input: none for the local implementation; integration
  remains gated on independent R2 verification.
