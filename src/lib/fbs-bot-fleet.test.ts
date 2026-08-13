import assert from 'node:assert/strict'
import test from 'node:test'
import type { FbsBotSnapshot } from './fbs-bot-contract.ts'
import {
  buildFbsBotFleetRenderState,
  buildFbsBotFleetView,
  selectFbsBotFleetStatus,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-fleet.ts'

const now = Date.parse('2026-08-12T12:00:00.000Z')

const zubakhinaSnapshot: FbsBotSnapshot = {
  contractVersion: 1,
  sellerId: 'zubakhina',
  sellerDisplayName: 'Зубахина',
  generatedAt: '2026-08-12T11:55:00.000Z',
  phase: 'idle',
  lastRunAt: '2026-08-12T11:54:00.000Z',
  lastSuccessfulRunAt: '2026-08-12T11:54:00.000Z',
  nextDeliveryWindowAt: '2026-08-12T14:00:00.000Z',
  mappingVersion: 'a'.repeat(64),
  mappingCacheUpdatedAt: '2026-08-12T11:45:00.000Z',
  counts: { new: 2, assigned: 8, ignored: 1, blocked: 3 },
  openSupplies: [{
    supplyId: 'same-wb-id',
    name: 'Zubakhina open',
    groupKey: 'group-z',
    orderCount: 3,
    nextDeliveryWindowAt: '2026-08-12T14:00:00.000Z',
    status: 'open',
  }],
  deliveredSupplies: [{
    supplyId: 'delivered-z',
    name: 'Zubakhina delivered',
    orderCount: 4,
    deliveredAt: '2026-08-12T10:00:00.000Z',
  }],
  errors: [{
    code: 'ZUBAKHINA_RECENT',
    reason: 'Recent non-blocking error',
    occurredAt: '2026-08-12T11:50:00.000Z',
    blocking: false,
    supplyId: 'same-wb-id',
  }],
}

const andreySnapshot: FbsBotSnapshot = {
  ...zubakhinaSnapshot,
  sellerId: 'zubakhin-andrey',
  sellerDisplayName: 'Зубахин Андрей',
  generatedAt: '2026-08-12T11:56:00.000Z',
  lastRunAt: '2026-08-12T11:53:00.000Z',
  lastSuccessfulRunAt: '2026-08-12T11:53:00.000Z',
  nextDeliveryWindowAt: '2026-08-12T16:00:00.000Z',
  mappingVersion: 'b'.repeat(64),
  counts: { new: 5, assigned: 3, ignored: 1, blocked: 0 },
  openSupplies: [{
    supplyId: 'same-wb-id',
    name: 'Andrey open',
    groupKey: 'group-a',
    orderCount: 2,
    nextDeliveryWindowAt: '2026-08-12T16:00:00.000Z',
    status: 'delivery_due',
  }],
  deliveredSupplies: [{
    supplyId: 'delivered-a',
    name: 'Andrey delivered',
    orderCount: 1,
    deliveredAt: '2026-08-12T11:00:00.000Z',
  }],
  errors: [{
    code: 'ANDREY_OLDER',
    reason: 'Older non-blocking error',
    occurredAt: '2026-08-12T11:40:00.000Z',
    blocking: false,
    orderId: 42,
  }],
}

test('aggregates fleet counters and attributes every flattened operational item', () => {
  const view = buildFbsBotFleetView([zubakhinaSnapshot, andreySnapshot], now)

  assert.deepEqual(view.counts, { new: 7, assigned: 11, ignored: 2, blocked: 3 })
  assert.equal(view.openSupplies[0]?.sellerDisplayName, 'Зубахина')
  assert.equal(view.openSupplies[1]?.sellerDisplayName, 'Зубахин Андрей')
  assert.equal(view.deliveredSupplies[0]?.sellerId, 'zubakhin-andrey')
  assert.equal(view.deliveredSupplies[1]?.sellerDisplayName, 'Зубахина')
  assert.equal(view.errors[0]?.sellerId, 'zubakhina')
  assert.equal(view.errors[1]?.sellerId, 'zubakhin-andrey')
})

test('keeps a health row for a missing cabinet without inventing snapshot data', () => {
  const view = buildFbsBotFleetView([zubakhinaSnapshot], now)

  assert.equal(view.status, 'остановлен')
  assert.deepEqual(view.accounts, [
    {
      sellerId: 'zubakhina',
      sellerDisplayName: 'Зубахина',
      status: 'работает',
      lastSuccessfulRunAt: '2026-08-12T11:54:00.000Z',
      generatedAt: '2026-08-12T11:55:00.000Z',
    },
    {
      sellerId: 'zubakhin-andrey',
      sellerDisplayName: 'Зубахин Андрей',
      status: 'остановлен',
      lastSuccessfulRunAt: null,
      generatedAt: null,
    },
  ])
})

test('reports a stale cabinet while preserving the healthy cabinet row', () => {
  const staleAndrey = {
    ...andreySnapshot,
    generatedAt: '2026-08-12T11:29:59.999Z',
  }
  const view = buildFbsBotFleetView([staleAndrey, zubakhinaSnapshot], now)

  assert.equal(view.status, 'задержка')
  assert.deepEqual(view.accounts.map(account => [account.sellerId, account.status]), [
    ['zubakhina', 'работает'],
    ['zubakhin-andrey', 'задержка'],
  ])
})

test('retains identical WB supply IDs and sorts independently of snapshot order', () => {
  const forward = buildFbsBotFleetView([zubakhinaSnapshot, andreySnapshot], now)
  const reverse = buildFbsBotFleetView([andreySnapshot, zubakhinaSnapshot], now)

  assert.equal(forward.openSupplies.length, 2)
  assert.deepEqual(
    forward.openSupplies.map(supply => `${supply.sellerId}:${supply.supplyId}`),
    ['zubakhina:same-wb-id', 'zubakhin-andrey:same-wb-id'],
  )
  assert.deepEqual(reverse, forward)
})

test('uses operational severity for overall status without collapsing account health', () => {
  const loadingSnapshot = { ...andreySnapshot, phase: 'loading' as const }
  const staleSnapshot = { ...andreySnapshot, generatedAt: '2026-08-12T11:00:00.000Z' }
  const errorSnapshot = {
    ...andreySnapshot,
    phase: 'error' as const,
    errors: [{
      code: 'BLOCKED',
      reason: 'Blocking failure',
      occurredAt: '2026-08-12T11:58:00.000Z',
      blocking: true,
    }],
  }

  assert.equal(buildFbsBotFleetView([zubakhinaSnapshot, loadingSnapshot], now).status, 'загрузка данных')
  assert.equal(buildFbsBotFleetView([zubakhinaSnapshot, staleSnapshot], now).status, 'задержка')

  const errorView = buildFbsBotFleetView([zubakhinaSnapshot, errorSnapshot], now)
  assert.equal(errorView.status, 'ошибка')
  assert.deepEqual(errorView.accounts.map(account => account.status), ['работает', 'ошибка'])
})

test('uses seller and item identity as deterministic tie-breakers', () => {
  const tiedZubakhina = {
    ...zubakhinaSnapshot,
    openSupplies: [
      { ...zubakhinaSnapshot.openSupplies[0]!, supplyId: 'supply-b' },
      { ...zubakhinaSnapshot.openSupplies[0]!, supplyId: 'supply-a' },
    ],
    errors: [
      { ...zubakhinaSnapshot.errors[0]!, code: 'ERROR_B' },
      { ...zubakhinaSnapshot.errors[0]!, code: 'ERROR_A' },
    ],
  }
  const tiedAndrey = {
    ...andreySnapshot,
    openSupplies: [{
      ...andreySnapshot.openSupplies[0]!,
      nextDeliveryWindowAt: zubakhinaSnapshot.openSupplies[0]!.nextDeliveryWindowAt,
      supplyId: 'supply-a',
    }],
    errors: [{
      ...andreySnapshot.errors[0]!,
      occurredAt: zubakhinaSnapshot.errors[0]!.occurredAt,
      code: 'ERROR_A',
    }],
  }

  const view = buildFbsBotFleetView([tiedAndrey, tiedZubakhina], now)

  assert.deepEqual(view.openSupplies.map(supply => `${supply.sellerId}:${supply.supplyId}`), [
    'zubakhin-andrey:supply-a',
    'zubakhina:supply-a',
    'zubakhina:supply-b',
  ])
  assert.deepEqual(view.errors.map(error => `${error.sellerId}:${error.code}`), [
    'zubakhin-andrey:ERROR_A',
    'zubakhina:ERROR_A',
    'zubakhina:ERROR_B',
  ])
})

test('retained snapshot ages from healthy to stale after a failed refresh', () => {
  const heartbeatAt = '2026-08-12T11:31:00.000Z'
  const retainedSnapshots: readonly FbsBotSnapshot[] = [{
    ...zubakhinaSnapshot,
    generatedAt: heartbeatAt,
  }, {
    ...andreySnapshot,
    generatedAt: heartbeatAt,
  }]

  const beforeFailure = buildFbsBotFleetRenderState(
    retainedSnapshots,
    Date.parse('2026-08-12T11:59:59.999Z'),
    false,
  )
  const afterFailure = buildFbsBotFleetRenderState(
    retainedSnapshots,
    Date.parse('2026-08-12T12:01:00.001Z'),
    false,
  )

  assert.deepEqual(beforeFailure.fleetView?.accounts.map(account => account.status), ['работает', 'работает'])
  assert.deepEqual(afterFailure.fleetView?.accounts.map(account => account.status), ['задержка', 'задержка'])
  assert.equal(afterFailure.status, 'задержка')
  assert.deepEqual(
    afterFailure.fleetView?.accounts.map(account => account.sellerId),
    beforeFailure.fleetView?.accounts.map(account => account.sellerId),
  )
})

test('refresh loading yields only to higher-priority fleet health', () => {
  const cases = [
    ['ошибка', 'ошибка'],
    ['остановлен', 'остановлен'],
    ['задержка', 'задержка'],
    ['загрузка данных', 'загрузка данных'],
    ['работает', 'загрузка данных'],
  ] as const

  for (const [fleetStatus, expected] of cases) {
    assert.equal(selectFbsBotFleetStatus(fleetStatus, true), expected)
  }
  assert.equal(selectFbsBotFleetStatus(null, true), 'загрузка данных')
  assert.equal(selectFbsBotFleetStatus(null, false), 'остановлен')
})
