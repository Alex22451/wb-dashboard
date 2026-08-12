import assert from 'node:assert/strict'
import test from 'node:test'
import type { FbsBotSnapshot } from './fbs-bot-contract.ts'
import {
  createFbsBotStore,
  FbsBotFutureSnapshotError,
  FbsBotStaleSnapshotError,
  FbsBotStoreError,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-store.ts'

function makeSnapshot(generatedAt = '2026-08-12T10:00:00.000Z'): FbsBotSnapshot {
  return {
    contractVersion: 1,
    sellerId: 'zubakhina',
    generatedAt,
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
}

test('load rejects missing Redis configuration without issuing a command', async () => {
  let commandCalled = false
  const store = createFbsBotStore({
    hasConfig: () => false,
    command: async () => {
      commandCalled = true
      return null
    },
  })

  await assert.rejects(store.load(), (error: unknown) => (
    error instanceof FbsBotStoreError && error.code === 'unconfigured'
  ))
  assert.equal(commandCalled, false)
})

test('load returns null only when GET misses and Redis answers PING', async () => {
  const calls: string[] = []
  const store = createFbsBotStore({
    hasConfig: () => true,
    command: async (command) => {
      calls.push(String(command[0]))
      return command[0] === 'PING' ? 'PONG' : null
    },
  })

  assert.equal(await store.load(), null)
  assert.deepEqual(calls, ['GET', 'PING'])
})

test('load distinguishes an unreachable Redis from a missing key', async () => {
  const store = createFbsBotStore({ hasConfig: () => true, command: async () => null })
  await assert.rejects(store.load(), (error: unknown) => (
    error instanceof FbsBotStoreError && error.code === 'unavailable'
  ))
})

test('load surfaces invalid JSON and invalid stored schemas as corruption', async () => {
  for (const stored of ['{', JSON.stringify({ ...makeSnapshot(), wbToken: 'forbidden' })]) {
    const store = createFbsBotStore({ hasConfig: () => true, command: async () => stored })
    await assert.rejects(store.load(), (error: unknown) => (
      error instanceof FbsBotStoreError && error.code === 'corrupt'
    ))
  }
})

test('save canonicalizes generatedAt before the atomic write', async () => {
  let written: FbsBotSnapshot | null = null
  const store = createFbsBotStore({
    hasConfig: () => true,
    now: () => new Date('2026-08-12T10:00:00.000Z'),
    command: async (command) => {
      assert.equal(command[0], 'EVAL')
      written = JSON.parse(String(command[4]))
      return 1
    },
  })

  const saved = await store.save(makeSnapshot('2026-08-12T12:30:00.000+03:00'))
  assert.equal(saved.generatedAt, '2026-08-12T09:30:00.000Z')
  assert.equal(written?.generatedAt, '2026-08-12T09:30:00.000Z')
})

test('save rejects snapshots more than five minutes in the future without Redis access', async () => {
  let commandCalled = false
  const store = createFbsBotStore({
    hasConfig: () => true,
    now: () => new Date('2026-08-12T10:00:00.000Z'),
    command: async () => {
      commandCalled = true
      return 1
    },
  })

  await assert.rejects(
    store.save(makeSnapshot('2026-08-12T10:05:00.001Z')),
    FbsBotFutureSnapshotError,
  )
  assert.equal(commandCalled, false)
})

test('save maps stale, corrupt, unavailable, and unexpected EVAL results to typed errors', async () => {
  const cases: Array<[unknown, typeof FbsBotStaleSnapshotError | typeof FbsBotStoreError, string]> = [
    [0, FbsBotStaleSnapshotError, 'stale'],
    [-1, FbsBotStoreError, 'corrupt'],
    [null, FbsBotStoreError, 'unavailable'],
    ['OK', FbsBotStoreError, 'unexpected_result'],
  ]

  for (const [result, ErrorType, code] of cases) {
    const store = createFbsBotStore({
      hasConfig: () => true,
      now: () => new Date('2026-08-12T12:00:00.000Z'),
      command: async () => result,
    })
    await assert.rejects(store.save(makeSnapshot()), (error: unknown) => (
      error instanceof ErrorType && 'code' in error && error.code === code
    ))
  }
})

test('concurrent out-of-order saves retain only the strictly newest snapshot', async () => {
  let stored: string | null = null
  const command = async (parts: unknown[]) => {
    assert.equal(parts[0], 'EVAL')
    const candidateRaw = String(parts[4])
    const candidate = JSON.parse(candidateRaw) as FbsBotSnapshot
    if (candidate.generatedAt.includes('T10:00:00.000Z')) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    if (stored) {
      const current = JSON.parse(stored) as FbsBotSnapshot
      if (current.generatedAt >= candidate.generatedAt) return 0
    }
    stored = candidateRaw
    return 1
  }
  const store = createFbsBotStore({
    hasConfig: () => true,
    now: () => new Date('2026-08-12T12:00:00.000Z'),
    command,
  })

  const results = await Promise.allSettled([
    store.save(makeSnapshot('2026-08-12T10:00:00.000Z')),
    store.save(makeSnapshot('2026-08-12T11:00:00.000Z')),
  ])

  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].status, 'fulfilled')
  assert.equal((JSON.parse(stored!) as FbsBotSnapshot).generatedAt, '2026-08-12T11:00:00.000Z')
  await assert.rejects(
    store.save(makeSnapshot('2026-08-12T11:00:00.000Z')),
    FbsBotStaleSnapshotError,
  )
})
