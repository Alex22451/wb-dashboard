# Zubakhina FBS Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy an autonomous FBS bot for ИП Зубахина that groups eligible WB orders every 15 minutes, delivers verified supplies at fixed Moscow windows, and reports read-only status to WB Dashboard.

**Architecture:** A separate Next.js/TypeScript service runs on Vercel Hobby and is scheduled by signed Upstash QStash messages. A dedicated Upstash Redis stores locks, order/supply state, and a mutation ledger; WB Dashboard exposes only a signed classifier/status-ingest boundary and an admin-only read view.

**Tech Stack:** Node.js 22, TypeScript, Next.js 16 App Router, Zod, `@upstash/redis`, `@upstash/qstash`, Node test runner with `tsx`, Vercel Hobby, Upstash QStash, official Wildberries Marketplace and Content APIs.

## Global Constraints

- The bot is a separate repository and Vercel project named `wb-fbs-bot-zubakhina`.
- Do not change unrelated Dashboard sections.
- Run logic tests and production builds; visual regression tests are not required.
- Never print, log, commit, or send the WB token to Dashboard.
- Use only official WB API endpoints and documented rate-limit headers.
- Fetch orders every 15 minutes; delivery windows are `05:00`, `10:00`, `15:00`, `20:00` in `Europe/Moscow`.
- Eligible fabrics are exactly `оксфорд`, `дюспо`, `джерси`, `сетка`, `габардин`, `велюр`, matched case- and separator-insensitively.
- Use Dashboard `wb-mapping.ts` as the category source of truth; silently ignore `EXCLUDED_WB_SUBJECTS`.
- Unknown categories, ambiguous fabrics, missing metadata, and unsupported box requirements remain untouched in WB.
- Every mutation must be journaled and verified by a fresh WB read.
- Never blindly retry `409` or a timed-out mutation.
- Automatic `Передать в доставку` is allowed only after read-only preflight, shadow verification, and all delivery invariants pass.
- Keep unrelated untracked files in `wb-dashboard` untouched.

## File Structure

### New repository `/Users/evglevski/wb-fbs-bot-zubakhina`

- `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `.env.example`: runtime and toolchain.
- `src/config.ts`: validated environment and execution mode.
- `src/domain/contracts.ts`: bot-owned types and schema version.
- `src/domain/fabric.ts`: fabric extraction.
- `src/domain/schedule.ts`: Moscow delivery-window decisions.
- `src/domain/grouping.ts`: deterministic compatibility and supply names.
- `src/domain/state.ts`: order, supply, and mutation transition guards.
- `src/infra/wb-client.ts`: official WB HTTP client, schemas, throttling, and safe retry policy.
- `src/infra/store.ts`: Redis-backed lock, state, window, and mutation ledger.
- `src/infra/dashboard-client.ts`: signed classification and status calls.
- `src/services/catalog.ts`: cached Content API card catalog.
- `src/services/classifier.ts`: mapping and eligibility pipeline.
- `src/services/reconcile.ts`: post-mutation and uncertain-operation reconciliation.
- `src/services/cycle.ts`: one serialized 15-minute bot cycle.
- `src/app/api/qstash/cycle/route.ts`: signed QStash entry point.
- `src/app/api/health/route.ts`: secret-free liveness response.
- `scripts/preflight.ts`: read-only token/scope and dependency verification.
- `scripts/register-schedule.ts`: idempotent QStash schedule registration.
- `test/fixtures/*.json`: sanitized WB API fixtures.

### Existing repository `/Users/evglevski/wb-dashboard`

- `src/lib/wb-mapping.ts`: add stable mapping version and batch classification helper without changing existing results.
- `src/lib/fbs-bot-contract.ts`: versioned, sanitized cross-project schemas.
- `src/lib/fbs-bot-store.ts`: store/read the last status snapshot in the existing Dashboard Redis.
- `src/lib/internal-request-auth.ts`: timing-safe shared-secret validation.
- `src/app/api/internal/fbs/classify/route.ts`: signed batch classifier.
- `src/app/api/internal/fbs/status/route.ts`: signed status ingestion.
- `src/app/api/fbs-bot/status/route.ts`: admin-only read API.
- `src/components/fbs-bot-tab.tsx`: read-only status tab.
- `src/app/page.tsx`: admin-only tab registration and content mount.
- `src/app/api/user-preferences/route.ts`: keep `fbsbot` admin-only and visible by default.
- `src/lib/*.test.ts`: logic and contract coverage.

---

### Task 1: Scaffold The Separate Bot And Validate Configuration

**Files:**
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/package.json`
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/tsconfig.json`
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/next.config.ts`
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/eslint.config.mjs`
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/.gitignore`
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/.env.example`
- Create: `/Users/evglevski/wb-fbs-bot-zubakhina/src/config.ts`
- Test: `/Users/evglevski/wb-fbs-bot-zubakhina/src/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): BotConfig`.
- Produces: `BotConfig.executionMode` with `shadow | assembly | delivery` and independent `mutationsEnabled` kill switch.

- [ ] **Step 1: Initialize the repository without embedding credentials**

Run:

```bash
mkdir -p /Users/evglevski/wb-fbs-bot-zubakhina/src /Users/evglevski/wb-fbs-bot-zubakhina/scripts
cd /Users/evglevski/wb-fbs-bot-zubakhina
git init -b main
```

Create `package.json` with scripts:

```json
{
  "name": "wb-fbs-bot-zubakhina",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "test": "find src scripts -type f -name '*.test.ts' -print0 | xargs -0 node --import tsx --test",
    "preflight": "tsx scripts/preflight.ts",
    "schedule:register": "tsx scripts/register-schedule.ts"
  }
}
```

Install exact dependency families already compatible with Dashboard:

```bash
npm install next@16 react@19 react-dom@19 zod@4 @upstash/redis @upstash/qstash
npm install -D typescript@5 tsx eslint eslint-config-next @types/node @types/react @types/react-dom
```

- [ ] **Step 2: Write failing configuration tests**

Cover absence of `WB_ZUBAKHINA_TOKEN`, invalid execution mode, and production `delivery` without `FBS_MUTATIONS_ENABLED=true`:

```ts
assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /WB_ZUBAKHINA_TOKEN/)
assert.equal(loadConfig(validEnv).executionMode, 'shadow')
assert.throws(
  () => loadConfig({ ...validEnv, FBS_EXECUTION_MODE: 'delivery', FBS_MUTATIONS_ENABLED: 'false' }),
  /delivery requires FBS_MUTATIONS_ENABLED=true/,
)
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `node --import tsx --test src/config.test.ts`
Expected: FAIL because `loadConfig` does not exist.

- [ ] **Step 4: Implement strict configuration parsing**

Use Zod to require WB, Redis, QStash signing, Dashboard URL/shared secret, `SELLER_ID=zubakhina`, and `TIME_ZONE=Europe/Moscow`. `.env.example` contains names and empty values only. `.gitignore` excludes `.env`, `.env.*.local`, `.vercel`, `.next`, and `node_modules`.

- [ ] **Step 5: Verify the scaffold**

Run:

```bash
npm test
npm run build
git grep -nE 'eyJ|Bearer [A-Za-z0-9_-]{20,}' -- . ':!package-lock.json'
```

Expected: tests and build pass; secret scan returns no matches.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs .gitignore .env.example src/config.ts src/config.test.ts
git commit -m "chore: scaffold Zubakhina FBS bot"
```

### Task 2: Implement Fabric, Schedule, Grouping, And State Rules

**Files:**
- Create: `src/domain/contracts.ts`
- Create: `src/domain/fabric.ts`
- Create: `src/domain/fabric.test.ts`
- Create: `src/domain/schedule.ts`
- Create: `src/domain/schedule.test.ts`
- Create: `src/domain/grouping.ts`
- Create: `src/domain/grouping.test.ts`
- Create: `src/domain/state.ts`
- Create: `src/domain/state.test.ts`

**Interfaces:**
- Produces: `extractFabric(article: string): FabricResult`.
- Produces: `getMoscowCycle(now: Date, processedWindowKeys: ReadonlySet<string>): CycleTiming`.
- Produces: `buildGroupKey(input: GroupInput): string` and `buildSupplyName(input: SupplyNameInput): string`.
- Produces: `transitionOrder`, `transitionSupply`, and `transitionMutation` guard functions.

- [ ] **Step 1: Define explicit domain contracts**

Use discriminated results:

```ts
export type Fabric = 'оксфорд' | 'дюспо' | 'джерси' | 'сетка' | 'габардин' | 'велюр'
export type FabricResult =
  | { kind: 'matched'; fabric: Fabric }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; fabrics: Fabric[] }

export interface GroupInput {
  sellerId: 'zubakhina'
  productType: string
  fabric: Fabric
  warehouseId: number
  destinationOfficeId: number
  cargoType: number
  crossBorderType: number
  isB2b: boolean
  isZeroOrder: boolean
}
```

- [ ] **Step 2: Write failing fabric and grouping tests**

Test all six spellings, uppercase, `_`/`-`/spaces, substring collisions, two recognized fabrics in one article, different size/design grouping, and warehouse/cargo/B2B/zero-order separation.

```ts
assert.deepEqual(extractFabric('ПЛЕД_ДЮСПО-150х200'), { kind: 'matched', fabric: 'дюспо' })
assert.equal(buildGroupKey({ ...base, productType: 'гобелен', warehouseId: 10 }), buildGroupKey({ ...base, productType: 'гобелен', warehouseId: 10 }))
assert.notEqual(buildGroupKey(base), buildGroupKey({ ...base, cargoType: 2 }))
assert.equal(buildSupplyName({ ...nameInput, productDisplayName: 'Гобелены' }), '[AUTO] Гобелены ДЮСПО Курск 12.08 15:00')
```

- [ ] **Step 3: Write failing Moscow-window tests**

Use UTC inputs for `04:59`, `05:00`, `05:14`, `05:15`, `20:00`, midnight, date rollover, and the nine-hour overnight gap. Only the 15-minute cycle beginning at each fixed window may return `deliveryDue=true`; a processed `YYYY-MM-DDTHH:mm+03:00` key must return false.

- [ ] **Step 4: Write failing transition tests**

Prove that `assign_sent -> eligible`, `delivered_verified -> open_verified`, and a second `deliver_sent` are rejected, while `sent -> reconcile_required -> verified` is allowed.

- [ ] **Step 5: Run focused tests and confirm failures**

Run: `node --import tsx --test src/domain/*.test.ts`
Expected: FAIL because domain functions are absent.

- [ ] **Step 6: Implement minimal pure domain logic**

Normalize articles with Unicode lowercase and removal of whitespace, `_`, `-`, `/`, and punctuation. Serialize group fields in a fixed order and hash with SHA-256. Supply names use normalized display labels and are truncated deterministically to WB's documented 128-character maximum while preserving the `[AUTO]` prefix and delivery date/window suffix.

- [ ] **Step 7: Run all domain tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/domain
git commit -m "feat: define FBS grouping and scheduling rules"
```

### Task 3: Build A Throttled Official WB Client

**Files:**
- Create: `src/infra/wb-client.ts`
- Create: `src/infra/wb-client.test.ts`
- Create: `test/fixtures/orders-new.json`
- Create: `test/fixtures/supply-open.json`
- Create: `test/fixtures/order-statuses.json`
- Create: `test/fixtures/content-cards.json`

**Interfaces:**
- Consumes: `BotConfig`.
- Produces: `WbClient` methods `getNewOrders`, `getOrderStatuses`, `listSupplies`, `getSupply`, `createSupply`, `addOrders`, `getSupplyOrderIds`, `deliverSupply`, and `listContentCards`.
- Produces: `WbMutationUnknownError` for timeouts after a request may have reached WB.

- [ ] **Step 1: Capture sanitized official response fixtures**

Create minimal fixtures containing only documented fields used by the bot: order `id`, `rid`, `nmId`, `article`, `warehouseId`, `officeId`, `offices`, `cargoType`, `crossBorderType`, `isZeroOrder`, `options.isB2b` and timestamps; supply `id`, `name`, `done`, `createdAt`, `destinationOfficeId`; card `nmID`, `subjectName`, `vendorCode`, `brand`, `title`. Map the order's `officeId` to the group's `destinationOfficeId`; use `offices` only as the human-readable city/office label.

- [ ] **Step 2: Write failing request-policy tests**

Inject `fetchImpl` and `sleep` into the client. Verify:

```ts
await assert.rejects(() => client.createSupply('x'), WbMutationUnknownError)
assert.equal(fetchCallsAfter409, 1)
assert.equal(sleepsAfter429[0], documentedRetryDelay)
assert.ok(minimumGapBetweenMarketplaceCalls >= 200)
```

Also assert Authorization is attached to WB requests but never included in thrown error messages.

- [ ] **Step 3: Run the test and confirm failure**

Run: `node --import tsx --test src/infra/wb-client.test.ts`
Expected: FAIL because `WbClient` is absent.

- [ ] **Step 4: Implement schemas and read methods**

Validate official responses with Zod and call:

```text
GET  https://marketplace-api.wildberries.ru/api/v3/orders/new
POST https://marketplace-api.wildberries.ru/api/v3/orders/status
GET  https://marketplace-api.wildberries.ru/api/v3/supplies
GET  https://marketplace-api.wildberries.ru/api/v3/supplies/{supplyId}
GET  https://marketplace-api.wildberries.ru/api/marketplace/v3/supplies/{supplyId}/order-ids
POST https://content-api.wildberries.ru/content/v2/get/cards/list
```

- [ ] **Step 5: Implement mutation methods with no blind retries**

Call:

```text
POST  /api/v3/supplies
PATCH /api/marketplace/v3/supplies/{supplyId}/orders
PATCH /api/v3/supplies/{supplyId}/deliver
```

Batch additions at 100 order IDs. Retry reads on transient `5xx`; honor `X-Ratelimit-Retry`/documented retry headers for `429`; surface `409` as a typed business conflict; classify mutation network timeout as unknown outcome.

- [ ] **Step 6: Verify client behavior**

Run:

```bash
npm test
npm run lint
```

Expected: fixtures parse, retry assertions pass, no credential appears in snapshots/errors.

- [ ] **Step 7: Commit**

```bash
git add src/infra/wb-client.ts src/infra/wb-client.test.ts test/fixtures
git commit -m "feat: add safe Wildberries FBS client"
```

### Task 4: Add Redis Locking And Durable Mutation Ledger

**Files:**
- Create: `src/infra/store.ts`
- Create: `src/infra/store.test.ts`

**Interfaces:**
- Consumes: domain order/supply/mutation types.
- Produces: `BotStore.acquireSellerLock(owner, ttlMs)`, `renewSellerLock`, `releaseSellerLock`.
- Produces: `getOrder/putOrder`, `getSupply/putSupply`, `getMutation/putMutation`, `claimDeliveryWindow`, `putHeartbeat`, and status-query methods.

- [ ] **Step 1: Write failing store contract tests against an in-memory Redis adapter**

Test atomic `SET NX PX`, owner-checked Lua release, lock expiry, compare-and-set state version, duplicate `operationId`, TTL retention, and single winner for a delivery-window claim.

```ts
assert.equal(await store.acquireSellerLock('run-a', 60_000), true)
assert.equal(await store.acquireSellerLock('run-b', 60_000), false)
assert.equal(await store.claimDeliveryWindow('2026-08-12T15:00+03:00', 'run-a'), true)
assert.equal(await store.claimDeliveryWindow('2026-08-12T15:00+03:00', 'run-b'), false)
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --import tsx --test src/infra/store.test.ts`
Expected: FAIL because store implementation is absent.

- [ ] **Step 3: Implement versioned Redis keys and atomic operations**

Use keys under `fbs:v1:zubakhina:*`. Store JSON records with `schemaVersion: 1`, `revision`, `updatedAt`, and a 90-day TTL for completed records. Locks and delivery-window claims must be atomic; a plain read followed by write is forbidden.

- [ ] **Step 4: Verify store invariants**

Run: `npm test`
Expected: all concurrent/duplicate cases pass deterministically.

- [ ] **Step 5: Commit**

```bash
git add src/infra/store.ts src/infra/store.test.ts
git commit -m "feat: persist FBS bot state and mutation ledger"
```

### Task 5: Add Signed Classification And Status APIs To Dashboard

**Files:**
- Modify: `/Users/evglevski/wb-dashboard/src/lib/wb-mapping.ts`
- Modify: `/Users/evglevski/wb-dashboard/src/lib/wb-mapping.test.ts`
- Create: `/Users/evglevski/wb-dashboard/src/lib/fbs-bot-contract.ts`
- Create: `/Users/evglevski/wb-dashboard/src/lib/fbs-bot-contract.test.ts`
- Create: `/Users/evglevski/wb-dashboard/src/lib/internal-request-auth.ts`
- Create: `/Users/evglevski/wb-dashboard/src/lib/internal-request-auth.test.ts`
- Create: `/Users/evglevski/wb-dashboard/src/lib/fbs-bot-store.ts`
- Create: `/Users/evglevski/wb-dashboard/src/app/api/internal/fbs/classify/route.ts`
- Create: `/Users/evglevski/wb-dashboard/src/app/api/internal/fbs/status/route.ts`
- Create: `/Users/evglevski/wb-dashboard/src/app/api/fbs-bot/status/route.ts`
- Modify: `/Users/evglevski/wb-dashboard/package.json`

**Interfaces:**
- Produces: `classifyFbsProduct({ subject, article, brand }): FbsClassification` with canonical `productType` and human-readable `productDisplayName`.
- Produces: `getWbMappingVersion(): string`.
- Produces: contract version `1` schemas `FbsClassifyRequestSchema`, `FbsClassifyResponseSchema`, and `FbsBotSnapshotSchema`.
- Produces: `POST /api/internal/fbs/classify`, `POST /api/internal/fbs/status`, `GET /api/fbs-bot/status`.

- [ ] **Step 1: Write failing mapping/contract/auth tests**

Prove that all existing mapped subjects keep their current result, excluded subjects return `ignored_blacklist`, unknown subjects return `blocked_unknown_category`, and mapping version is stable for unchanged tables. Test a maximum of 100 classifications per request and reject fields outside sanitized schemas.

Use timing-safe secret validation semantics:

```ts
assert.equal(validateInternalSecret('correct', 'correct'), true)
assert.equal(validateInternalSecret('wrong', 'correct'), false)
assert.equal(validateInternalSecret('', 'correct'), false)
```

- [ ] **Step 2: Run tests and confirm failures**

Run:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test \
  src/lib/wb-mapping.test.ts \
  src/lib/fbs-bot-contract.test.ts \
  src/lib/internal-request-auth.test.ts
```

Expected: FAIL because new exports/files are absent.

- [ ] **Step 3: Implement pure classification without altering analytics behavior**

Wrap the existing blacklist and `mapWbOrderToType` behavior. Return a title-cased canonical type as the default display label and the approved `Гобелены` override for canonical `гобелен`; adding future mapped types therefore remains automatic. Compute the mapping version from sorted plain mapping entries, display overrides, and regex `{source, flags}` values using SHA-256; do not include secrets or runtime data.

- [ ] **Step 4: Implement signed internal routes and Redis snapshot storage**

Require `x-fbs-bot-secret`, validate with constant-time comparison, enforce JSON size and item-count limits, return `Cache-Control: no-store`, and store only validated sanitized snapshots under `dashboard:fbs-bot:v1:latest`. The public status route must call `getCurrentUser()` and return `403` unless `role === 'admin'`.

- [ ] **Step 5: Add tests to the Dashboard unit script and verify**

Run:

```bash
npm run test:unit
npm run lint
npm run build
git diff --check
```

Expected: all logic tests and build pass; existing mapping tests remain unchanged in meaning.

- [ ] **Step 6: Commit only Dashboard integration files**

```bash
git add package.json src/lib/wb-mapping.ts src/lib/wb-mapping.test.ts \
  src/lib/fbs-bot-contract.ts src/lib/fbs-bot-contract.test.ts \
  src/lib/internal-request-auth.ts src/lib/internal-request-auth.test.ts \
  src/lib/fbs-bot-store.ts src/app/api/internal/fbs/classify/route.ts \
  src/app/api/internal/fbs/status/route.ts src/app/api/fbs-bot/status/route.ts
git commit -m "feat: expose signed FBS bot status boundary"
```

### Task 6: Implement Catalog Cache And Dashboard Classification Client

**Files:**
- Create: `src/infra/dashboard-client.ts`
- Create: `src/infra/dashboard-client.test.ts`
- Create: `src/services/catalog.ts`
- Create: `src/services/catalog.test.ts`
- Create: `src/services/classifier.ts`
- Create: `src/services/classifier.test.ts`

**Interfaces:**
- Consumes: `WbClient.listContentCards`, Dashboard classify API, `BotStore`, and `extractFabric`.
- Produces: `CatalogService.getCard(nmId): Promise<CardRecord | null>`.
- Produces: `Classifier.classify(order): Promise<OrderEligibility>`.
- Produces: `DashboardClient.publishSnapshot(snapshot)`.

- [ ] **Step 1: Write failing catalog-cache tests**

Test initial pagination, six-hour refresh, one guarded refresh for an unknown `nmId`, stale-cache fallback, and no repeated refresh storm when Content API is unavailable.

- [ ] **Step 2: Write failing classification tests**

Cover mapped product + fabric, blacklist, unknown category, missing fabric, two fabrics, Dashboard outage with cached classification, and Dashboard outage with unseen `nmId`.

```ts
assert.deepEqual(await classifier.classify(mappedDuspOrder), {
  kind: 'eligible', productType: 'гобелен', fabric: 'дюспо', mappingVersion: expectedVersion,
})
assert.equal((await classifier.classify(paintingOrder)).kind, 'ignored_blacklist')
assert.equal((await classifier.classify(noFabricOrder)).kind, 'blocked_unknown_fabric')
```

- [ ] **Step 3: Run focused tests and confirm failures**

Run: `node --import tsx --test src/infra/dashboard-client.test.ts src/services/catalog.test.ts src/services/classifier.test.ts`
Expected: FAIL because services do not exist.

- [ ] **Step 4: Implement signed Dashboard calls and cache policy**

Send at most 100 classification items per call. Never send the WB token. Store `{nmId, subject, article, brand, classification, mappingVersion, classifiedAt}` in bot Redis. A stale known classification remains usable for 24 hours; an unseen or older entry fails closed.

- [ ] **Step 5: Verify behavior**

Run: `npm test`
Expected: all classification and fallback cases pass.

- [ ] **Step 6: Commit**

```bash
git add src/infra/dashboard-client.ts src/infra/dashboard-client.test.ts src/services/catalog.ts src/services/catalog.test.ts src/services/classifier.ts src/services/classifier.test.ts
git commit -m "feat: classify FBS orders from dashboard mapping"
```

### Task 7: Implement Reconciliation And Safe Supply Mutations

**Files:**
- Create: `src/services/reconcile.ts`
- Create: `src/services/reconcile.test.ts`
- Create: `src/services/supplies.ts`
- Create: `src/services/supplies.test.ts`

**Interfaces:**
- Consumes: `WbClient`, `BotStore`, grouping/state functions.
- Produces: `SupplyService.ensureOpenSupply(group, window): Promise<SupplyRecord>`.
- Produces: `SupplyService.assignOrders(supply, orders): Promise<AssignmentResult>`.
- Produces: `SupplyService.deliverVerifiedSupply(supply): Promise<DeliveryResult>`.
- Produces: `Reconciler.reconcilePending(): Promise<ReconcileSummary>`.

- [ ] **Step 1: Write failing create/assign reconciliation tests**

Test successful create, create timeout followed by exact-name recovery, ambiguous duplicate-name recovery, partial batch assignment, order moved by another actor, `409`, and post-write composition mismatch.

- [ ] **Step 2: Write failing delivery invariant tests**

Test `done=true`, composition mismatch, unresolved metadata, unsupported boxes, wrong warehouse/cargo type, already processed window, deliver timeout followed by `done=true`, deliver timeout followed by confirmed open state, and second delivery attempt rejection.

- [ ] **Step 3: Run focused tests and confirm failures**

Run: `node --import tsx --test src/services/reconcile.test.ts src/services/supplies.test.ts`
Expected: FAIL because services are absent.

- [ ] **Step 4: Implement journal-first mutation helpers**

Before each WB write, persist `planned`; immediately before fetch, persist `sent`; after the response, read WB state and persist `verified`. A mutation timeout persists `reconcile_required` and performs no immediate mutation retry.

- [ ] **Step 5: Implement deterministic recovery**

Recover supply creation only when exactly one open `[AUTO]` supply matches seller, exact name, group, and bounded creation time. If zero or multiple candidates exist, block the group and publish a safe error. Retry a mutation once only after a later reconciliation proves the previous effect absent and WB still permits it.

- [ ] **Step 6: Verify mutation safety**

Run: `npm test`
Expected: all timeout/duplicate/conflict cases pass and no test performs a real network call.

- [ ] **Step 7: Commit**

```bash
git add src/services/reconcile.ts src/services/reconcile.test.ts src/services/supplies.ts src/services/supplies.test.ts
git commit -m "feat: reconcile FBS supply mutations"
```

### Task 8: Build The Serialized Cycle And Signed QStash Route

**Files:**
- Create: `src/services/cycle.ts`
- Create: `src/services/cycle.test.ts`
- Create: `src/app/api/qstash/cycle/route.ts`
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: `BotStore`, `WbClient`, `Classifier`, `SupplyService`, `Reconciler`, `DashboardClient`, and `getMoscowCycle`.
- Produces: `runCycle({ now, runId }): Promise<CycleReport>`.
- Produces: signed `POST /api/qstash/cycle` and liveness-only `GET /api/health`.

- [ ] **Step 1: Write failing end-to-end service tests with fakes**

Replay sanitized fixtures for:

```text
two ДЮСПО gobelins -> same Курск supply
same product/fabric -> separate Москва destination supply
ОКСФОРД bag -> separate product/fabric supply
painting -> untouched and silent
mapped product without fabric -> untouched and visible error
```

Also test two concurrent cycles, delivery-window ingestion-before-delivery, shadow mode, assembly mode, delivery mode, stale heartbeat, and Dashboard status failure that does not cause WB mutation replay.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --import tsx --test src/services/cycle.test.ts`
Expected: FAIL because `runCycle` is absent.

- [ ] **Step 3: Implement cycle ordering and lock renewal**

Use this exact order: lock, reconcile, fetch, classify, group, ensure supplies, assign, verify, claim due window, preflight delivery, deliver, verify, heartbeat/status, unlock. A lock renewal failure stops before the next mutation and marks the run degraded.

- [ ] **Step 4: Implement the QStash boundary**

Wrap the App Router handler with `verifySignatureAppRouter`. Generate `runId` server-side from QStash message ID plus timestamp; ignore caller-supplied execution mode. Return `200` for a safely persisted ambiguous mutation, `409` for an already-running cycle, and `5xx` only for retry-safe failures before any uncertain mutation.

- [ ] **Step 5: Verify service and build**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests and Next.js production build pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/cycle.ts src/services/cycle.test.ts src/app/api/qstash/cycle/route.ts src/app/api/health/route.ts
git commit -m "feat: run signed autonomous FBS cycles"
```

### Task 9: Add The Admin-Only Dashboard Tab

**Files:**
- Create: `/Users/evglevski/wb-dashboard/src/components/fbs-bot-tab.tsx`
- Modify: `/Users/evglevski/wb-dashboard/src/app/page.tsx:680`
- Modify: `/Users/evglevski/wb-dashboard/src/app/page.tsx:7193`
- Modify: `/Users/evglevski/wb-dashboard/src/app/page.tsx:7260`
- Modify: `/Users/evglevski/wb-dashboard/src/app/api/user-preferences/route.ts`
- Test: `/Users/evglevski/wb-dashboard/src/lib/fbs-bot-contract.test.ts`

**Interfaces:**
- Consumes: admin `GET /api/fbs-bot/status`.
- Produces: `FbsBotTab` read-only React component and admin-only `fbsbot` tab registration.

- [ ] **Step 1: Extend pure status derivation tests**

Test UI-independent status derivation: no snapshot=`остановлен`, heartbeat under 30 minutes=`работает`, active fetch=`загрузка данных`, heartbeat over 30 minutes=`задержка`, blocking errors=`ошибка`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test src/lib/fbs-bot-contract.test.ts`
Expected: FAIL because health derivation is absent.

- [ ] **Step 3: Implement the read-only component**

Poll status on mount and every 30 seconds while the tab is visible. Render compact operational bands for heartbeat/next window/counts, an unframed open-supplies table, delivered history, and sanitized errors. Use Lucide `Bot`, `RefreshCw`, `Truck`, `CircleAlert`, and `Clock`; the refresh icon only re-reads status and never triggers the bot.

- [ ] **Step 4: Register the tab as admin-only**

Add `fbsbot` to admin preferences, label it `FBS-бот`, render its trigger only when `isAdmin`, and mount `FbsBotTab` only for the admin. Non-admin preference payloads must drop `fbsbot`.

- [ ] **Step 5: Verify Dashboard logic and production build**

Run:

```bash
npm run test:unit
npm run lint
npm run build
git diff --check
```

Expected: tests/build pass; no other tabs or report calculations change.

- [ ] **Step 6: Commit**

```bash
git add src/components/fbs-bot-tab.tsx src/app/page.tsx src/app/api/user-preferences/route.ts src/lib/fbs-bot-contract.test.ts
git commit -m "feat: show admin FBS bot status"
```

### Task 10: Add Read-Only Preflight And Idempotent Schedule Registration

**Files:**
- Create: `scripts/preflight.ts`
- Create: `scripts/preflight.test.ts`
- Create: `scripts/register-schedule.ts`
- Create: `scripts/register-schedule.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: `BotConfig`, `WbClient`, Dashboard client, Redis, QStash client.
- Produces: `runPreflight(): Promise<PreflightReport>` with no WB mutations.
- Produces: `registerSchedule(destination): Promise<{ scheduleId: string }>` using stable ID `zubakhina-fbs-cycle-v1`.

- [ ] **Step 1: Write failing preflight tests**

Verify checks for Marketplace read, Content read, Redis read/write/delete probe, Dashboard classifier auth, Dashboard status auth, and `mutationsEnabled=false`. Assert no create/add/deliver client method is called.

- [ ] **Step 2: Write failing schedule registration tests**

Assert exact schedule and stable ID:

```ts
assert.equal(request.cron, 'CRON_TZ=Europe/Moscow */15 * * * *')
assert.equal(request.scheduleId, 'zubakhina-fbs-cycle-v1')
assert.equal(request.destination, new URL('/api/qstash/cycle', validConfig.botPublicUrl).toString())
```

The actual implementation obtains the production domain from required `BOT_PUBLIC_URL`; the literal angle-bracket example is documentation only and is never sent.

- [ ] **Step 3: Run tests and confirm failures**

Run: `node --import tsx --test scripts/*.test.ts`
Expected: FAIL because scripts are absent.

- [ ] **Step 4: Implement scripts and operations README**

`preflight` prints only check name, boolean result, HTTP status, and sanitized reason. `register-schedule` upserts the custom QStash schedule ID and verifies it by listing schedules. README documents shadow/assembly/delivery modes, kill switch, status interpretation, and disable procedure.

- [ ] **Step 5: Verify all local bot checks**

Run:

```bash
npm test
npm run lint
npm run build
git grep -nE 'eyJ|Bearer [A-Za-z0-9_-]{20,}' -- . ':!package-lock.json'
```

Expected: pass; secret scan is empty.

- [ ] **Step 6: Commit**

```bash
git add scripts README.md
git commit -m "feat: add FBS bot preflight and scheduler setup"
```

### Task 11: Independent Review And Security Gate

**Files:**
- Modify only files required to address validated findings.

**Interfaces:**
- Consumes: complete bot and Dashboard diffs.
- Produces: review evidence that category, concurrency, retry, secret, and irreversible-action controls match the approved design.

- [ ] **Step 1: Run a spec-compliance review**

Use a fresh reviewer to compare every approved rule against code and tests. Reject any implementation that groups on city text instead of IDs, includes size in the key, handles blacklist as an error, or permits delivery outside the four fixed cycles.

- [ ] **Step 2: Run a security review**

Inspect QStash signature verification, internal secret timing comparison, route authorization, Redis lock ownership, log sanitization, status schema, environment separation, and mutation timeout behavior. Search both repositories:

```bash
git grep -nE 'eyJ|Authorization|WB_ZUBAKHINA_TOKEN|QSTASH_TOKEN|FBS_DASHBOARD_SHARED_SECRET'
```

Expected: only environment-variable names and intentional header construction; no token values.

- [ ] **Step 3: Fix validated findings test-first**

For each finding, add a failing regression test, run it to confirm failure, implement the smallest correction, and rerun focused plus full suites.

- [ ] **Step 4: Commit corrections separately in their owning repository**

Run in the bot repository when bot files changed:

```bash
git add src scripts README.md package.json package-lock.json
if ! git diff --cached --quiet; then git commit -m "fix: harden FBS automation invariants"; fi
```

Run in Dashboard when Dashboard files changed:

```bash
git add src package.json
if ! git diff --cached --quiet; then git commit -m "fix: harden FBS dashboard boundary"; fi
```

If review produces no validated changes, both commands leave history unchanged.

### Task 12: Provision, Deploy, Shadow-Verify, And Enable Production

**Files:**
- Create locally through Vercel CLI: `.vercel/project.json` in the bot repository, ignored by git.
- Modify: Vercel environment only; no secret-bearing repository files.

**Interfaces:**
- Consumes: GitHub authentication, Vercel project access, Upstash QStash/Redis access, Dashboard production URL, supplied WB Basic token.
- Produces: GitHub repository, Vercel production deployment, QStash schedule, validated Dashboard deployment, and enabled autonomous delivery.

- [ ] **Step 1: Create and push the bot GitHub repository**

Run from the bot repository:

```bash
gh repo create Alex22451/wb-fbs-bot-zubakhina --private --source=. --remote=origin --push
git status --short
```

Expected: private repository created, `main` pushed, clean tracked worktree.

- [ ] **Step 2: Push Dashboard integration through the existing deployment scheme**

Run:

```bash
cd /Users/evglevski/wb-dashboard
git push origin main
git status --short
```

Expected: only the known unrelated untracked files remain; existing server deployment follows the current `main` push scheme.

- [ ] **Step 3: Create dedicated Upstash resources**

Create one Redis database and one QStash schedule namespace in the user's Upstash/Vercel account. Record credentials directly into Vercel environment variables; do not place them in shell history, source files, chat output, or logs. Confirm the selected plan's current limits exceed 96 scheduled messages/day plus retries and expected Redis command volume.

- [ ] **Step 4: Link and configure the Vercel bot project**

Use `npx vercel link --yes`, set Production secrets through `npx vercel env add`, and configure initial values:

```text
FBS_EXECUTION_MODE=shadow
FBS_MUTATIONS_ENABLED=false
SELLER_ID=zubakhina
TIME_ZONE=Europe/Moscow
```

Never pass secrets as command-line arguments. Supply them through secure stdin prompts or the Vercel dashboard/API secret body.

- [ ] **Step 5: Deploy bot production and run read-only preflight**

Run:

```bash
npx vercel --prod --yes
npm run preflight
```

Expected: Marketplace read, Content read, Redis, signed Dashboard classifier, and signed status ingestion all pass; no WB mutation occurs.

- [ ] **Step 6: Register QStash and observe one shadow cycle**

Run: `npm run schedule:register`
Expected: one active schedule `zubakhina-fbs-cycle-v1`. Verify a shadow cycle groups the sanitized real order set according to product type, fabric, warehouse/destination, cargo type, and cross-border type; blacklist remains silent and unknowns stay in `Новые`.

- [ ] **Step 7: Enable assembly mode and verify WB state**

Set `FBS_EXECUTION_MODE=assembly` and `FBS_MUTATIONS_ENABLED=true`, redeploy, allow one scheduled cycle, then use read-only WB calls to confirm each assigned order appears exactly once in the expected `[AUTO]` supply. Any mismatch immediately restores `FBS_MUTATIONS_ENABLED=false`.

- [ ] **Step 8: Enable delivery mode for the next fixed window**

Set `FBS_EXECUTION_MODE=delivery`, redeploy before the next approved window, and let the signed cycle perform the already-authorized irreversible action. Verify through WB reads that each target supply is `done`, its order IDs match the journal, and no second delivery operation exists.

- [ ] **Step 9: Verify Dashboard production state**

Log in as admin and confirm `FBS-бот` shows the same heartbeat, counts, open supplies, delivered supplies, next window, and sanitized errors as the bot's stored snapshot. Confirm a non-admin request to `/api/fbs-bot/status` returns `403`.

- [ ] **Step 10: Run final release evidence and commit the report**

Create `docs/reports/2026-08-12-zubakhina-fbs-bot-release.md` in Dashboard with commit SHAs, deployment URLs/IDs, preflight checks, shadow comparison, first assembly verification, first delivery verification, and rollback switch state. Do not include tokens, authorization headers, personal data, or full order payloads.

```bash
git add docs/reports/2026-08-12-zubakhina-fbs-bot-release.md
git commit -m "docs: record Zubakhina FBS bot release"
git push origin main
```

## Final Verification Matrix

Run in the bot repository:

```bash
npm test
npm run lint
npm run build
git status --short
git log --oneline --decorate -12
```

Run in Dashboard:

```bash
npm run test:unit
npm run lint
npm run build
git diff --check
git status --short
git log --oneline --decorate -12
```

Production evidence must demonstrate:

- signed QStash invocation every 15 minutes;
- fresh heartbeat within 30 minutes;
- no secrets in git or runtime error output;
- one supply for compatible orders before each delivery window;
- separate supplies for incompatible destination/cargo groups;
- ignored blacklisted categories and visible blocked unknowns;
- verified assignment before delivery;
- exactly one journaled delivery effect for each completed supply;
- admin-only status visibility;
- working kill switch and documented disable procedure.
