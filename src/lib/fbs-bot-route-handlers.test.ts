import assert from 'node:assert/strict'
import test from 'node:test'
import type { FbsBotSnapshot } from './fbs-bot-contract.ts'
import {
  handleFbsBotStatusGet,
  handleFbsClassifyPost,
  handleFbsStatusPost,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-route-handlers.ts'
import {
  FbsBotFutureSnapshotError,
  FbsBotStaleSnapshotError,
  FbsBotStoreError,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-store.ts'

const snapshot: FbsBotSnapshot = {
  contractVersion: 1,
  sellerId: 'zubakhina',
  generatedAt: '2026-08-12T10:00:00.000Z',
  phase: 'idle',
  lastRunAt: null,
  lastSuccessfulRunAt: null,
  nextDeliveryWindowAt: '2026-08-12T12:00:00.000Z',
  mappingVersion: null,
  mappingCacheUpdatedAt: null,
  counts: { new: 0, assigned: 0, ignored: 0, blocked: 0 },
  openSupplies: [],
  deliveredSupplies: [],
  errors: [],
}

function request(body: unknown, secret = 'correct', headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/internal/fbs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fbs-bot-secret': secret,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function assertStatus(response: Response, status: number) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get('cache-control'), 'no-store')
}

const classifyRequest = {
  contractVersion: 1,
  items: [{ requestId: 'one', nmId: 1, subject: 'Пледы', article: 'Плед', brand: '' }],
}

test('classification handler returns distinct auth, JSON, size, and server statuses with no-store', async () => {
  const dependencies = {
    expectedSecret: 'correct',
    getMappingVersion: () => 'a'.repeat(64),
    classify: () => ({ kind: 'blocked_unknown_category' } as const),
  }
  await assertStatus(await handleFbsClassifyPost(request(classifyRequest, 'wrong'), dependencies), 401)
  await assertStatus(await handleFbsClassifyPost(request('{'), dependencies), 400)
  await assertStatus(await handleFbsClassifyPost(
    request(classifyRequest, 'correct', { 'content-length': String(300 * 1024) }),
    dependencies,
  ), 413)

  const response = await handleFbsClassifyPost(request(classifyRequest), {
    ...dependencies,
    getMappingVersion: () => { throw new Error('sensitive failure detail') },
  })
  await assertStatus(response, 500)
  assert.deepEqual(await response.json(), { error: 'Internal server error' })
})

test('classification handler returns a validated ordered response with no-store', async () => {
  const response = await handleFbsClassifyPost(request(classifyRequest), {
    expectedSecret: 'correct',
    getMappingVersion: () => 'a'.repeat(64),
    classify: () => ({ kind: 'eligible', productType: 'плед', productDisplayName: 'Плед' }),
  })

  await assertStatus(response, 200)
  const body = await response.json()
  assert.equal(body.items[0].requestId, 'one')
  assert.equal(body.items[0].classification.productType, 'плед')
})

test('status ingest maps stale, future, and storage errors without leaking details', async () => {
  const cases: Array<[Error, number, string]> = [
    [new FbsBotStaleSnapshotError(), 409, 'Stale status snapshot'],
    [new FbsBotFutureSnapshotError(), 400, 'Invalid status snapshot'],
    [new FbsBotStoreError('unavailable'), 503, 'Status storage is unavailable'],
  ]

  for (const [error, status, message] of cases) {
    const response = await handleFbsStatusPost(request(snapshot), {
      expectedSecret: 'correct',
      saveSnapshot: async () => { throw error },
    })
    await assertStatus(response, status)
    assert.deepEqual(await response.json(), { error: message })
  }
})

test('status ingest validates auth and snapshot before storage', async () => {
  let saveCalled = false
  const dependencies = {
    expectedSecret: 'correct',
    saveSnapshot: async () => {
      saveCalled = true
      return snapshot
    },
  }
  await assertStatus(await handleFbsStatusPost(request(snapshot, 'wrong'), dependencies), 401)
  await assertStatus(await handleFbsStatusPost(request({ ...snapshot, wbToken: 'forbidden' }), dependencies), 400)
  assert.equal(saveCalled, false)
})

test('status ingest acknowledges a stored sanitized snapshot with no-store', async () => {
  const response = await handleFbsStatusPost(request(snapshot), {
    expectedSecret: 'correct',
    saveSnapshot: async () => snapshot,
  })
  await assertStatus(response, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('public status handler enforces anonymous and non-admin boundaries', async () => {
  const anonymous = await handleFbsBotStatusGet({
    getCurrentUser: async () => null,
    loadSnapshot: async () => snapshot,
  })
  await assertStatus(anonymous, 401)

  const nonAdmin = await handleFbsBotStatusGet({
    getCurrentUser: async () => ({ role: 'user' }),
    loadSnapshot: async () => snapshot,
  })
  await assertStatus(nonAdmin, 403)

  const admin = await handleFbsBotStatusGet({
    getCurrentUser: async () => ({ role: 'admin' }),
    loadSnapshot: async () => snapshot,
  })
  await assertStatus(admin, 200)
  assert.deepEqual(await admin.json(), { snapshot })
})

test('public status handler sanitizes authentication and storage failures', async () => {
  const authFailure = await handleFbsBotStatusGet({
    getCurrentUser: async () => { throw new Error('database connection detail') },
    loadSnapshot: async () => snapshot,
  })
  await assertStatus(authFailure, 500)
  assert.deepEqual(await authFailure.json(), { error: 'Internal server error' })

  const storageFailure = await handleFbsBotStatusGet({
    getCurrentUser: async () => ({ role: 'admin' }),
    loadSnapshot: async () => { throw new FbsBotStoreError('corrupt') },
  })
  await assertStatus(storageFailure, 503)
  assert.deepEqual(await storageFailure.json(), { error: 'Status storage is unavailable' })
})
