import assert from 'node:assert/strict'
import test from 'node:test'
import type { FbsBotSnapshot } from './fbs-bot-contract.ts'
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
import { FBS_BOT_SELLER_DISPLAY_NAMES, FBS_BOT_SELLER_IDS } from './fbs-bot-sellers.ts'
import {
  createFbsBotStore,
  FBS_BOT_SNAPSHOT_KEY,
  FbsBotFutureSnapshotError,
  FbsBotStaleSnapshotError,
  FbsBotStoreError,
  snapshotKey,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-store.ts'

function makeSnapshot(
  generatedAt = '2026-08-12T10:00:00.000Z',
  sellerId: FbsBotSnapshot['sellerId'] = 'zubakhina',
): FbsBotSnapshot {
  const snapshotFields = {
    contractVersion: 1 as const,
    generatedAt,
    phase: 'idle' as const,
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

  return {
    ...snapshotFields,
    sellerId,
    sellerDisplayName: FBS_BOT_SELLER_DISPLAY_NAMES[sellerId],
  } as FbsBotSnapshot
}

test('snapshot keys preserve the legacy cabinet key and isolate the new cabinet', () => {
  assert.equal(snapshotKey('zubakhina'), 'dashboard:fbs-bot:v1:latest')
  assert.equal(FBS_BOT_SNAPSHOT_KEY, 'dashboard:fbs-bot:v1:latest')
  assert.equal(snapshotKey('zubakhin-andrey'), 'dashboard:fbs-bot:v1:zubakhin-andrey:latest')
})

test('loadAll rejects missing Redis configuration without issuing a command', async () => {
  let commandCalled = false
  const store = createFbsBotStore({
    hasConfig: () => false,
    command: async () => {
      commandCalled = true
      return null
    },
  })

  await assert.rejects(store.loadAll(), (error: unknown) => (
    error instanceof FbsBotStoreError && error.code === 'unconfigured'
  ))
  assert.equal(commandCalled, false)
})

test('loadAll reads all seller keys in registry order and omits missing snapshots', async () => {
  const calls: unknown[][] = []
  const andreySnapshot = makeSnapshot('2026-08-12T10:00:00.000Z', 'zubakhin-andrey')
  const store = createFbsBotStore({
    hasConfig: () => true,
    command: async (command) => {
      calls.push(command)
      assert.equal(command[0], 'EVAL')
      assert.equal(typeof command[1], 'string')
      assert.equal(command[2], 1)
      assert.equal(command.length, 4)
      return command[3] === snapshotKey('zubakhin-andrey') ? JSON.stringify(andreySnapshot) : 0
    },
  })

  assert.deepEqual(await store.loadAll(), [andreySnapshot])
  assert.deepEqual(calls.map(command => command[3]), FBS_BOT_SELLER_IDS.map(snapshotKey))
})

test('loadAll maps null and unexpected Redis response types to unavailable', async () => {
  for (const result of [null, 42, ['unexpected']]) {
    const store = createFbsBotStore({ hasConfig: () => true, command: async () => result })
    await assert.rejects(store.loadAll(), (error: unknown) => (
      error instanceof FbsBotStoreError && error.code === 'unavailable'
    ))
  }
})

test('loadAll returns every valid snapshot in registry order', async () => {
  const snapshots = FBS_BOT_SELLER_IDS.map((sellerId, index) =>
    makeSnapshot(`2026-08-12T1${index}:00:00.000Z`, sellerId))
  const store = createFbsBotStore({
    hasConfig: () => true,
    command: async (command) => {
      assert.equal(command[0], 'EVAL')
      const snapshot = snapshots.find(item => snapshotKey(item.sellerId) === command[3])
      return JSON.stringify(snapshot)
    },
  })

  assert.deepEqual(await store.loadAll(), snapshots)
})

test('loadAll migrates only the exact pre-display-name Zubakhina snapshot', async () => {
  const zubakhinaSnapshot = makeSnapshot()
  const legacySnapshot = { ...zubakhinaSnapshot } as Record<string, unknown>
  delete legacySnapshot.sellerDisplayName
  const store = createFbsBotStore({
    hasConfig: () => true,
    command: async command => command[3] === snapshotKey('zubakhina')
      ? JSON.stringify(legacySnapshot)
      : 0,
  })

  assert.deepEqual(await store.loadAll(), [zubakhinaSnapshot])

  const andreySnapshot = makeSnapshot('2026-08-12T11:00:00.000Z', 'zubakhin-andrey')
  const incompleteAndreySnapshot = { ...andreySnapshot } as Record<string, unknown>
  delete incompleteAndreySnapshot.sellerDisplayName
  const corruptStore = createFbsBotStore({
    hasConfig: () => true,
    command: async command => command[3] === snapshotKey('zubakhin-andrey')
      ? JSON.stringify(incompleteAndreySnapshot)
      : 0,
  })

  await assert.rejects(corruptStore.loadAll(), (error: unknown) => (
    error instanceof FbsBotStoreError && error.code === 'corrupt'
  ))
})

test('loadAll surfaces corruption from either seller key', async () => {
  for (const stored of [
    '__FBS_SNAPSHOT_MISSING__',
    '{',
    JSON.stringify({ ...makeSnapshot(), wbToken: 'forbidden' }),
  ]) {
    const store = createFbsBotStore({
      hasConfig: () => true,
      command: async command => command[3] === snapshotKey('zubakhin-andrey') ? stored : 0,
    })
    await assert.rejects(store.loadAll(), (error: unknown) => (
      error instanceof FbsBotStoreError && error.code === 'corrupt'
    ))
  }
})

test('save canonicalizes generatedAt before the atomic write', async () => {
  let writtenGeneratedAt: string | undefined
  const store = createFbsBotStore({
    hasConfig: () => true,
    now: () => new Date('2026-08-12T10:00:00.000Z'),
    command: async (command) => {
      assert.equal(command[0], 'EVAL')
      writtenGeneratedAt = (JSON.parse(String(command[4])) as FbsBotSnapshot).generatedAt
      assert.equal(command[3], snapshotKey('zubakhina'))
      assert.equal(command[5], 'zubakhina')
      return 1
    },
  })

  const saved = await store.save(makeSnapshot('2026-08-12T12:30:00.000+03:00'))
  assert.equal(saved.generatedAt, '2026-08-12T09:30:00.000Z')
  assert.equal(writtenGeneratedAt, '2026-08-12T09:30:00.000Z')
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

test('save validates seller identity before selecting a Redis key', async () => {
  let commandCalled = false
  const store = createFbsBotStore({
    hasConfig: () => true,
    command: async () => {
      commandCalled = true
      return 1
    },
  })

  await assert.rejects(store.save({
    ...makeSnapshot(),
    sellerId: 'zubakhin-andrey',
    sellerDisplayName: 'Зубахина',
  }))
  assert.equal(commandCalled, false)
})

test('save writes only the key derived from the validated seller', async () => {
  const calls: unknown[][] = []
  const store = createFbsBotStore({
    hasConfig: () => true,
    now: () => new Date('2026-08-12T12:00:00.000Z'),
    command: async command => {
      calls.push(command)
      return 1
    },
  })

  await store.save(makeSnapshot('2026-08-12T10:00:00.000Z'))
  await store.save(makeSnapshot('2026-08-12T11:00:00.000Z', 'zubakhin-andrey'))

  assert.deepEqual(calls.map(command => [command[3], command[5]]), [
    ['dashboard:fbs-bot:v1:latest', 'zubakhina'],
    ['dashboard:fbs-bot:v1:zubakhin-andrey:latest', 'zubakhin-andrey'],
  ])
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

test('out-of-order protection is isolated per seller', async () => {
  const stored = new Map<string, string>()
  const command = async (parts: unknown[]) => {
    assert.equal(parts[0], 'EVAL')
    const key = String(parts[3])
    const candidateRaw = String(parts[4])
    const candidate = JSON.parse(candidateRaw) as FbsBotSnapshot
    if (candidate.generatedAt.includes('T10:00:00.000Z')) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    const currentRaw = stored.get(key)
    if (currentRaw) {
      const current = JSON.parse(currentRaw) as FbsBotSnapshot
      if (current.generatedAt >= candidate.generatedAt) return 0
    }
    stored.set(key, candidateRaw)
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
    store.save(makeSnapshot('2026-08-12T11:30:00.000Z', 'zubakhin-andrey')),
  ])

  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].status, 'fulfilled')
  assert.equal(results[2].status, 'fulfilled')
  assert.equal(
    (JSON.parse(stored.get(snapshotKey('zubakhina'))!) as FbsBotSnapshot).generatedAt,
    '2026-08-12T11:00:00.000Z',
  )
  assert.equal(
    (JSON.parse(stored.get(snapshotKey('zubakhin-andrey'))!) as FbsBotSnapshot).generatedAt,
    '2026-08-12T11:30:00.000Z',
  )
  await assert.rejects(
    store.save(makeSnapshot('2026-08-12T11:00:00.000Z')),
    FbsBotStaleSnapshotError,
  )
  await assert.doesNotReject(
    store.save(makeSnapshot('2026-08-12T11:15:00.000Z')),
  )
})
