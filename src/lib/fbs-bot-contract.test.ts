import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveFbsBotStatus,
  FbsBotFleetStatusResponseSchema,
  FbsBotSnapshotIngressSchema,
  FbsBotSnapshotSchema,
  FbsClassifyRequestSchema,
  FbsClassifyResponseSchema,
  type FbsBotSnapshot,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-contract.ts'
import {
  DASHBOARD_TABS_PREFERENCES_VERSION,
  normalizeDashboardTabPreferences,
  OPTIONAL_DASHBOARD_TAB_IDS,
  updateDashboardTabPreferences,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './dashboard-tab-preferences.ts'
import {
  FbsBotStatusClientError,
  toSafeFbsBotStatusErrorMessage,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-status-client.ts'

const classifyItem = {
  requestId: 'order-123',
  nmId: 123,
  subject: 'Гобелены',
  article: 'Гобелен_ДЮСПО',
  brand: '',
}

const snapshot: FbsBotSnapshot = {
  contractVersion: 1,
  sellerId: 'zubakhina',
  sellerDisplayName: 'Зубахина',
  generatedAt: '2026-08-12T12:00:00.000Z',
  phase: 'idle',
  lastRunAt: '2026-08-12T11:45:00.000Z',
  lastSuccessfulRunAt: '2026-08-12T11:45:10.000Z',
  nextDeliveryWindowAt: '2026-08-12T12:00:00.000Z',
  mappingVersion: null,
  mappingCacheUpdatedAt: null,
  counts: { new: 1, assigned: 2, ignored: 3, blocked: 4 },
  openSupplies: [{
    supplyId: 'WB-GI-1',
    name: '[AUTO] Гобелены ДЮСПО Курск 12.08 15:00',
    groupKey: 'group-1',
    orderCount: 2,
    nextDeliveryWindowAt: '2026-08-12T12:00:00.000Z',
    status: 'open',
  }],
  deliveredSupplies: [{
    supplyId: 'WB-GI-0',
    name: '[AUTO] Гобелены ДЮСПО Курск 12.08 10:00',
    orderCount: 1,
    deliveredAt: '2026-08-12T07:00:00.000Z',
  }],
  errors: [{
    code: 'MISSING_METADATA',
    reason: 'Карточка товара не содержит предмет',
    occurredAt: '2026-08-12T11:30:00.000Z',
    blocking: true,
    orderId: 456,
  }],
}

test('classification request accepts one to 100 sanitized items', () => {
  assert.equal(FbsClassifyRequestSchema.parse({ contractVersion: 1, items: [classifyItem] }).items.length, 1)
  assert.equal(FbsClassifyRequestSchema.parse({
    contractVersion: 1,
    items: Array.from({ length: 100 }, (_, index) => ({ ...classifyItem, requestId: `order-${index}` })),
  }).items.length, 100)
})

test('classification request rejects empty, oversized, and extra input', () => {
  assert.equal(FbsClassifyRequestSchema.safeParse({ contractVersion: 1, items: [] }).success, false)
  assert.equal(FbsClassifyRequestSchema.safeParse({
    contractVersion: 1,
    items: Array.from({ length: 101 }, (_, index) => ({ ...classifyItem, requestId: `order-${index}` })),
  }).success, false)
  assert.equal(FbsClassifyRequestSchema.safeParse({
    contractVersion: 1,
    items: [{ ...classifyItem, wbToken: 'must-not-cross-boundary' }],
  }).success, false)
})

test('classification response accepts every category outcome and rejects extra fields', () => {
  const response = {
    contractVersion: 1,
    mappingVersion: 'a'.repeat(64),
    items: [
      { requestId: '1', nmId: 1, classification: { kind: 'eligible', productType: 'гобелен', productDisplayName: 'Гобелены' } },
      { requestId: '2', nmId: 2, classification: { kind: 'ignored_blacklist' } },
      { requestId: '3', nmId: 3, classification: { kind: 'blocked_unknown_category' } },
      { requestId: '4', nmId: 4, classification: { kind: 'blocked_unknown_size' } },
    ],
  }
  assert.equal(FbsClassifyResponseSchema.parse(response).items.length, 4)
  assert.equal(FbsClassifyResponseSchema.safeParse({ ...response, wbToken: 'forbidden' }).success, false)
})

test('snapshot schema accepts both exact seller identity pairs', () => {
  assert.deepEqual(FbsBotSnapshotSchema.parse(snapshot), snapshot)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    sellerId: 'zubakhin-andrey',
    sellerDisplayName: 'Зубахин Андрей',
  }).success, true)
})

test('snapshot schema rejects mismatched labels and unknown sellers', () => {
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    sellerId: 'zubakhin-andrey',
    sellerDisplayName: 'Зубахина',
  }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    sellerId: 'zubakhina',
    sellerDisplayName: 'Зубахин Андрей',
  }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    sellerId: 'unknown-seller',
    sellerDisplayName: 'Неизвестный продавец',
  }).success, false)
})

test('snapshot ingress normalizes only the exact pre-display-name Zubakhina payload', () => {
  const legacySnapshot = { ...snapshot } as Record<string, unknown>
  delete legacySnapshot.sellerDisplayName

  assert.deepEqual(FbsBotSnapshotIngressSchema.parse(legacySnapshot), snapshot)
  assert.equal(FbsBotSnapshotIngressSchema.safeParse({
    ...legacySnapshot,
    wbToken: 'forbidden',
  }).success, false)
  assert.equal(FbsBotSnapshotIngressSchema.safeParse({
    ...snapshot,
    sellerDisplayName: 'Зубахин Андрей',
  }).success, false)
  assert.equal(FbsBotSnapshotIngressSchema.safeParse({
    ...legacySnapshot,
    sellerId: 'zubakhin-andrey',
  }).success, false)
})

test('snapshot schema rejects PII, credentials, and unknown nested fields', () => {
  assert.equal(FbsBotSnapshotSchema.safeParse({ ...snapshot, wbToken: 'forbidden' }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    errors: [{ ...snapshot.errors[0], rawResponse: { supplierName: 'private' } }],
  }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    openSupplies: [{ ...snapshot.openSupplies[0], orders: [{ id: 1 }] }],
  }).success, false)
})

test('snapshot schema enforces collection and string bounds', () => {
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    errors: Array.from({ length: 201 }, () => snapshot.errors[0]),
  }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    errors: [{ ...snapshot.errors[0], reason: 'x'.repeat(501) }],
  }).success, false)
})

test('fleet status response accepts missing sellers and one snapshot per known seller', () => {
  const andreySnapshot = {
    ...snapshot,
    sellerId: 'zubakhin-andrey',
    sellerDisplayName: 'Зубахин Андрей',
  }

  assert.deepEqual(FbsBotFleetStatusResponseSchema.parse({ snapshots: [] }), { snapshots: [] })
  assert.deepEqual(FbsBotFleetStatusResponseSchema.parse({ snapshots: [snapshot] }), { snapshots: [snapshot] })
  assert.deepEqual(
    FbsBotFleetStatusResponseSchema.parse({ snapshots: [snapshot, andreySnapshot] }),
    { snapshots: [snapshot, andreySnapshot] },
  )
  assert.equal(FbsBotFleetStatusResponseSchema.safeParse({
    snapshots: [snapshot, snapshot],
  }).success, false)
})

test('fleet status response rejects secrets and unknown fields at every level', () => {
  assert.equal(FbsBotFleetStatusResponseSchema.safeParse({
    snapshots: [{ ...snapshot, wbToken: 'forbidden' }],
  }).success, false)
  assert.equal(FbsBotFleetStatusResponseSchema.safeParse({
    snapshots: [{
      ...snapshot,
      openSupplies: [{ ...snapshot.openSupplies[0], rawWbResponse: { private: true } }],
    }],
  }).success, false)
  assert.equal(FbsBotFleetStatusResponseSchema.safeParse({
    snapshots: [snapshot],
    redisKey: 'must-not-cross-boundary',
  }).success, false)
})

test('status derivation follows operational precedence and the heartbeat boundary', () => {
  const now = Date.parse('2026-08-12T12:30:00.000Z')

  assert.equal(deriveFbsBotStatus(undefined, now, true), 'загрузка данных')
  assert.equal(deriveFbsBotStatus(undefined, now, false), 'остановлен')
  assert.equal(deriveFbsBotStatus(null, now), 'остановлен')
  assert.equal(deriveFbsBotStatus({ ...snapshot, phase: 'stopped' }, now), 'остановлен')
  assert.equal(deriveFbsBotStatus({ ...snapshot, phase: 'error' }, now), 'ошибка')
  assert.equal(deriveFbsBotStatus({
    ...snapshot,
    errors: [{ ...snapshot.errors[0], blocking: true }],
  }, now), 'ошибка')
  assert.equal(deriveFbsBotStatus({
    ...snapshot,
    generatedAt: '2026-08-12T11:59:59.999Z',
    phase: 'loading',
    errors: [],
  }, now), 'задержка')
  assert.equal(deriveFbsBotStatus({
    ...snapshot,
    generatedAt: '2026-08-12T12:00:00.000Z',
    phase: 'loading',
    errors: [],
  }, now), 'загрузка данных')
  assert.equal(deriveFbsBotStatus({
    ...snapshot,
    generatedAt: '2026-08-12T12:00:00.000Z',
    phase: 'idle',
    errors: [],
  }, now, true), 'загрузка данных')
  assert.equal(deriveFbsBotStatus({
    ...snapshot,
    generatedAt: '2026-08-12T12:00:00.001Z',
    phase: 'idle',
    errors: [],
  }, now), 'работает')
})

test('legacy admin preferences receive the FBS bot tab once', () => {
  assert.deepEqual(normalizeDashboardTabPreferences({
    visibleTabs: ['daily'],
  }, true), {
    visibleTabs: ['daily', 'unit', 'fbsbot'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  })
})

test('legacy browser tab arrays retain customization during migration', () => {
  assert.deepEqual(normalizeDashboardTabPreferences(['daily'], true), {
    visibleTabs: ['daily', 'unit', 'fbsbot'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  })
})

test('legacy non-admin browser arrays retain choices and drop admin tabs', () => {
  assert.deepEqual(normalizeDashboardTabPreferences(['daily', 'unit', 'compare', 'fbsbot'], false), {
    visibleTabs: ['daily'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  })
})

test('current admin preferences preserve an FBS bot opt-out', () => {
  assert.deepEqual(normalizeDashboardTabPreferences({
    visibleTabs: ['daily'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  }, true), {
    visibleTabs: ['daily', 'unit'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  })
})

test('non-admin preferences strip every admin-only tab', () => {
  assert.deepEqual(normalizeDashboardTabPreferences({
    visibleTabs: ['daily', 'unit', 'compare', 'fbsbot'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  }, false), {
    visibleTabs: ['daily'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  })
})

test('non-admin tab updates normalize the full current list before persistence', () => {
  assert.deepEqual(updateDashboardTabPreferences(
    OPTIONAL_DASHBOARD_TAB_IDS,
    'daily',
    true,
    false,
  ), {
    visibleTabs: ['daily', 'production', 'supply', 'monthly', 'ads', 'growth'],
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  })
})

test('client status errors expose only fixed localized messages', () => {
  assert.equal(
    toSafeFbsBotStatusErrorMessage(new FbsBotStatusClientError('forbidden')),
    'Недостаточно прав для просмотра статуса FBS-бота.',
  )
  assert.equal(
    toSafeFbsBotStatusErrorMessage(new FbsBotStatusClientError('invalid_response')),
    'Сервер вернул некорректный статус FBS-бота.',
  )
  assert.equal(
    toSafeFbsBotStatusErrorMessage(new SyntaxError('Unexpected token: sensitive response body')),
    'Не удалось обновить статус FBS-бота.',
  )
})
