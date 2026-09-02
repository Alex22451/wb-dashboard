import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canLiveLoadDailyRange,
  buildDailyRangeRecoverySelection,
  buildDailyRecoveryPlan,
  getCacheableDailyTargetIds,
  getDailyFunnelLoadStrategy,
  getFunnelRequestDelayMs,
  getFunnelOrderMetrics,
  getMissingDailyTargetIdsByDate,
  getMissingDailyDates,
  splitDailyLoadIssues,
  getWbRateLimitRetryDelayMs,
  shouldRetryWbRateLimitInRequest,
  shouldContinueDailyRecovery,
  shouldContinueDailyFunnelLoad,
  shouldLiveLoadDailyRange,
  shouldRefreshDailyCache,
  shouldServeDailyCache,
  sliceDailyPayloadByDate,
  WB_FUNNEL_REQUEST_INTERVAL_MS,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './wb-cache-performance.ts'
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
import * as cachePerformance from './wb-cache-performance.ts'

test('loads a week as bounded single-day product snapshots instead of product history chunks', () => {
  const historyWindow = { from: '2026-08-24', to: '2026-08-31' }
  assert.equal(getDailyFunnelLoadStrategy(['2026-08-30'], 7, historyWindow), 'single-day')
  assert.equal(getDailyFunnelLoadStrategy([
    '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
    '2026-08-28', '2026-08-29', '2026-08-30',
  ], 7, historyWindow), 'daily')
  assert.equal(getDailyFunnelLoadStrategy([
    '2026-08-10', '2026-08-11', '2026-08-12',
  ], 7, historyWindow), 'daily')
  assert.equal(getDailyFunnelLoadStrategy(
    Array.from({ length: 8 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`),
    7,
    historyWindow,
  ), 'unsupported')
})

test('uses each history day order sum instead of repeating the range revenue', () => {
  assert.deepEqual(getFunnelOrderMetrics({ orderCount: 2, orderSum: 240 }), {
    count: 2,
    orderSum: 240,
    unitRevenue: 120,
  })
  assert.deepEqual(getFunnelOrderMetrics({ orderCount: 0, orderSum: 700 }), {
    count: 0,
    orderSum: 700,
    unitRevenue: 0,
  })
})

test('paces funnel requests at or above the documented twenty-second interval', () => {
  assert.ok(WB_FUNNEL_REQUEST_INTERVAL_MS >= 20_000)
})

test('paces the first history request after the preceding products request', () => {
  assert.equal(getFunnelRequestDelayMs(1_000, 1_000), WB_FUNNEL_REQUEST_INTERVAL_MS)
  assert.equal(getFunnelRequestDelayMs(1_000, 11_000), WB_FUNNEL_REQUEST_INTERVAL_MS - 10_000)
  assert.equal(getFunnelRequestDelayMs(1_000, 1_000 + WB_FUNNEL_REQUEST_INTERVAL_MS), 0)
  assert.equal(getFunnelRequestDelayMs(2_000, 1_000), WB_FUNNEL_REQUEST_INTERVAL_MS + 1_000)
  assert.equal(getFunnelRequestDelayMs(undefined, 1_000), 0)
})

test('honors WB rate-limit retry headers with a bounded fallback', () => {
  assert.equal(getWbRateLimitRetryDelayMs('2', 0), 2_250)
  assert.equal(getWbRateLimitRetryDelayMs(null, 0), WB_FUNNEL_REQUEST_INTERVAL_MS)
  assert.equal(getWbRateLimitRetryDelayMs(null, 1), WB_FUNNEL_REQUEST_INTERVAL_MS * 2)
  assert.equal(getWbRateLimitRetryDelayMs('856', 0), 856_250)
  assert.equal(getWbRateLimitRetryDelayMs('99999', 0), 30 * 60_000)
})

test('does not wait through a long WB cooldown inside one serverless request', () => {
  assert.equal(shouldRetryWbRateLimitInRequest(59_000), true)
  assert.equal(shouldRetryWbRateLimitInRequest(856_250), false)
})

test('stops daily recovery after the first failed WB day', () => {
  assert.equal(shouldContinueDailyRecovery({ requestOk: true, errorCount: 0, hasDaily: true }), true)
  assert.equal(shouldContinueDailyRecovery({ requestOk: true, errorCount: 1, hasDaily: false }), false)
  assert.equal(shouldContinueDailyRecovery({ requestOk: false, errorCount: 0, hasDaily: false }), false)
  assert.equal(shouldContinueDailyRecovery({
    requestOk: true,
    errorCount: 0,
    warningCount: 1,
    hasDaily: true,
    fulfillmentComplete: false,
  }), false)
})

test('stops a multi-day server load after the first WB funnel error', () => {
  assert.equal(shouldContinueDailyFunnelLoad(undefined), true)
  assert.equal(shouldContinueDailyFunnelLoad('WB Analytics API limited the request'), false)
})

test('keeps successful seller cache partitions when another seller fails', () => {
  assert.deepEqual(getCacheableDailyTargetIds([
    { entrepreneurId: 11 },
    { entrepreneurId: 12, error: 'rate limited' },
    { entrepreneurId: 13, returnError: 'fulfillment unavailable' },
  ]), [11])

  assert.deepEqual(getCacheableDailyTargetIds([
    { entrepreneurId: 11 },
    { entrepreneurId: 12, error: 'primary orders unavailable' },
    { entrepreneurId: 13, returnError: 'fulfillment breakdown unavailable' },
  ], { allowReturnErrors: true }), [11, 13])
})

test('keeps fulfillment-only failures non-blocking for order totals', () => {
  const results = [
    { entrepreneurId: 11, entrepreneurName: 'Seller 11', error: 'orders unavailable' },
    { entrepreneurId: 12, entrepreneurName: 'Seller 12', returnError: 'FBO/FBS unavailable' },
  ]
  assert.deepEqual(splitDailyLoadIssues(results, true), {
    errors: [{ id: 11, name: 'Seller 11', error: 'orders unavailable' }],
    warnings: [{ id: 12, name: 'Seller 12', error: 'FBO/FBS unavailable' }],
  })
  assert.equal(splitDailyLoadIssues(results, false).errors.length, 2)
})

test('collapses missing day partitions into one bounded range recovery selection', () => {
  assert.equal(buildDailyRangeRecoverySelection([
    { date: '2026-08-28', selection: '12' },
    { date: '2026-08-29', selection: '11' },
    { date: '2026-08-30', selection: '11,12' },
  ], 'all'), '11,12')
  assert.equal(buildDailyRangeRecoverySelection([
    { date: '2026-08-28', selection: 'all' },
  ], 'all'), 'all')
})

test('plans exact seller recovery for daily dates after the last warm cache date', () => {
  assert.deepEqual(buildDailyRecoveryPlan({
    requestedDates: ['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'],
    daily: { dates: ['2026-08-27', '2026-08-28'] },
    incompleteDates: ['2026-08-28', '2026-08-29', '2026-08-30'],
    missingTargetIdsByDate: {
      '2026-08-28': [12, 12, -1],
      '2026-08-29': [11],
      '2026-08-30': [11, 12],
    },
    fallbackSelection: 'all',
  }), [
    { date: '2026-08-28', selection: '12' },
    { date: '2026-08-29', selection: '11' },
    { date: '2026-08-30', selection: '11,12' },
  ])
})

test('plans recovery for present cache partitions with incomplete fulfillment', () => {
  assert.deepEqual((cachePerformance as any).buildDailyRecoveryPlan({
    requestedDates: ['2026-08-31'],
    daily: { dates: ['2026-08-31'] },
    incompleteDates: [],
    missingTargetIdsByDate: { '2026-08-31': [] },
    incompleteTargetIdsByDate: { '2026-08-31': [7, 3, 7] },
    fallbackSelection: 'all',
  }), [
    { date: '2026-08-31', selection: '3,7' },
  ])
})

test('requires a complete Redis response when the dashboard requests complete data', () => {
  assert.equal(shouldServeDailyCache({ missing: 1, requireComplete: true }), false)
  assert.equal(shouldServeDailyCache({ missing: 0, requireComplete: true }), true)
  assert.equal(shouldServeDailyCache({ missing: 0, incomplete: 1, requireComplete: true }), false)
  assert.equal(shouldServeDailyCache({ missing: 1, requireComplete: false }), true)
  assert.equal(shouldServeDailyCache({ missing: 0, incomplete: 1, requireComplete: false }), true)
})

test('allows live daily recovery only inside the supported seven-day budget', () => {
  assert.equal(canLiveLoadDailyRange(['2026-08-23']), true)
  assert.equal(canLiveLoadDailyRange([
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
    '2026-08-21', '2026-08-22', '2026-08-23',
  ]), true)
  assert.equal(canLiveLoadDailyRange([
    '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19',
    '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23',
  ]), false)
  assert.equal(canLiveLoadDailyRange([]), false)
})

test('recovers only dates missing from a partial Redis range', () => {
  const requested = [
    '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
    '2026-08-28', '2026-08-29', '2026-08-30',
  ]

  assert.deepEqual(getMissingDailyDates(requested, {
    dates: [
      '2026-08-24', '2026-08-25', '2026-08-26',
      '2026-08-28', '2026-08-29', '2026-08-30',
    ],
  }), ['2026-08-27'])
  assert.deepEqual(getMissingDailyDates(requested, {
    dates: requested,
  }, ['2026-08-27']), ['2026-08-27'])
  assert.deepEqual(getMissingDailyDates(requested, null), requested)
})

test('identifies only the missing seller partitions for each cached date', () => {
  assert.deepEqual(getMissingDailyTargetIdsByDate({
    targetIds: [11, 12],
    dates: ['2026-08-29', '2026-08-30'],
    // Redis MGET is target-major: 11/29, 11/30, 12/29, 12/30.
    presentRows: [true, true, true, false],
  }), {
    '2026-08-29': [],
    '2026-08-30': [12],
  })
})

test('cache-only probes never start a live WB range load', () => {
  const dates = ['2026-08-24', '2026-08-25']

  assert.equal(shouldLiveLoadDailyRange({ dates, cacheOnly: true }), false)
  assert.equal(shouldLiveLoadDailyRange({ dates, cacheOnly: false }), true)
  assert.equal(shouldLiveLoadDailyRange({
    dates: Array.from({ length: 8 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`),
    cacheOnly: false,
  }), false)
})

test('cache-only wins over an internal refresh request', () => {
  assert.equal(shouldRefreshDailyCache({
    internalWarmRequest: true,
    refreshRequested: true,
    cacheOnly: true,
  }), false)
  assert.equal(shouldRefreshDailyCache({
    internalWarmRequest: true,
    refreshRequested: true,
    cacheOnly: false,
  }), true)
})

test('slices a multi-day daily payload into one cacheable day', () => {
  const daily = {
    fulfillmentComplete: false,
    dates: ['2026-08-22', '2026-08-23'],
    allDates: ['2026-08-22', '2026-08-23'],
    products: [{ id: 0, name: 'Плед ФЛИС' }],
    entrepreneurs: [{ id: 11, name: 'Seller 11' }],
    pivot: { 0: { 0: 2, 1: 3 } },
    previousPivot: {},
    previousFbsPivot: {},
    previousFboPivot: {},
    dateTotals: [2, 3],
    revenueDateTotals: [200, 300],
    previousDateTotals: [0, 0],
    productTotals: { 0: 5 },
    productRevenue: { 0: 500 },
    entrepreneurDailyData: {
      '2026-08-22': { 11: 2 },
      '2026-08-23': { 11: 3 },
    },
    entrepreneurDailyRevenue: {
      '2026-08-22': { 11: 200 },
      '2026-08-23': { 11: 300 },
    },
    entrepreneurDailyFbs: {
      '2026-08-22': { 11: 2 },
      '2026-08-23': { 11: 3 },
    },
    entrepreneurDailyFbo: {
      '2026-08-22': { 11: 0 },
      '2026-08-23': { 11: 0 },
    },
    fbsPivot: { 0: { 0: 2, 1: 3 } },
    fbsDateTotals: [2, 3],
    fbsProductTotals: { 0: 5 },
    fboPivot: {},
    fboDateTotals: [0, 0],
    fboProductTotals: {},
  }

  assert.deepEqual(sliceDailyPayloadByDate(daily, '2026-08-23'), {
    fulfillmentComplete: false,
    dates: ['2026-08-23'],
    allDates: ['2026-08-23'],
    products: [{ id: 0, name: 'Плед ФЛИС' }],
    entrepreneurs: [{ id: 11, name: 'Seller 11' }],
    pivot: { 0: { 0: 3 } },
    previousPivot: {},
    previousFbsPivot: {},
    previousFboPivot: {},
    dateTotals: [3],
    revenueDateTotals: [300],
    previousDateTotals: [0],
    productTotals: { 0: 3 },
    productRevenue: {},
    entrepreneurDailyData: { '2026-08-23': { 11: 3 } },
    entrepreneurDailyRevenue: { '2026-08-23': { 11: 300 } },
    entrepreneurDailyFbs: { '2026-08-23': { 11: 3 } },
    entrepreneurDailyFbo: { '2026-08-23': { 11: 0 } },
    fbsPivot: { 0: { 0: 3 } },
    fbsDateTotals: [3],
    fbsProductTotals: { 0: 3 },
    fboPivot: {},
    fboDateTotals: [0],
    fboProductTotals: {},
  })
})

test('enriches exact funnel totals with a clamped FBS/FBO breakdown', () => {
  const daily = {
    fulfillmentComplete: false,
    dates: ['2026-08-30'],
    allDates: ['2026-08-30'],
    products: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }],
    entrepreneurs: [{ id: 5, name: 'Seller 5' }],
    pivot: { 0: { 0: 5 }, 1: { 0: 3 } },
    dateTotals: [8],
    productTotals: { 0: 5, 1: 3 },
    entrepreneurDailyData: { '2026-08-30': { 5: 8 } },
    fbsPivot: {}, fbsDateTotals: [0], fbsProductTotals: {},
    fboPivot: {}, fboDateTotals: [0], fboProductTotals: {},
    entrepreneurDailyFbs: { '2026-08-30': { 5: 0 } },
    entrepreneurDailyFbo: { '2026-08-30': { 5: 0 } },
  }

  const enriched = (cachePerformance as any).applyFulfillmentBreakdown?.(
    daily,
    { A: 2, B: 9, C: 4 },
    5,
  )

  assert.deepEqual({
    fulfillmentComplete: enriched?.fulfillmentComplete,
    pivot: enriched?.pivot,
    dateTotals: enriched?.dateTotals,
    fbsPivot: enriched?.fbsPivot,
    fboPivot: enriched?.fboPivot,
    fbsDateTotals: enriched?.fbsDateTotals,
    fboDateTotals: enriched?.fboDateTotals,
    fbsProductTotals: enriched?.fbsProductTotals,
    fboProductTotals: enriched?.fboProductTotals,
    entrepreneurDailyFbs: enriched?.entrepreneurDailyFbs,
    entrepreneurDailyFbo: enriched?.entrepreneurDailyFbo,
  }, {
    fulfillmentComplete: true,
    pivot: { 0: { 0: 5 }, 1: { 0: 3 } },
    dateTotals: [8],
    fbsPivot: { 0: { 0: 3 } },
    fboPivot: { 0: { 0: 2 }, 1: { 0: 3 } },
    fbsDateTotals: [3],
    fboDateTotals: [5],
    fbsProductTotals: { 0: 3 },
    fboProductTotals: { 0: 2, 1: 3 },
    entrepreneurDailyFbs: { '2026-08-30': { 5: 3 } },
    entrepreneurDailyFbo: { '2026-08-30': { 5: 5 } },
  })
})

test('reconciles a complete fulfillment partition against authoritative Funnel totals', () => {
  const reconciled = (cachePerformance as any).reconcileFulfillmentCounts?.(
    { a: 5, b: 3 },
    { a: 2, b: 9, c: 4 },
  )

  assert.deepEqual(reconciled, {
    fbs: { a: 2, b: 3 },
    fbo: { a: 3 },
    sourceExcess: { b: 6, c: 4 },
  })
})

test('rejects a successful but truncated fulfillment response', () => {
  assert.equal((cachePerformance as any).hasCompleteFulfillmentCoverage?.(
    { '2026-09-01\u0000A': 5, '2026-09-01\u0000B': 3 },
    { '2026-09-01\u0000A': 5, '2026-09-01\u0000B': 2 },
  ), false)
  assert.equal((cachePerformance as any).hasCompleteFulfillmentCoverage?.(
    { '2026-09-01\u0000A': 5, '2026-09-01\u0000B': 3 },
    { '2026-09-01\u0000A': 6, '2026-09-01\u0000B': 3 },
  ), false)
  assert.equal((cachePerformance as any).hasCompleteFulfillmentCoverage?.(
    { '2026-09-01\u0000A': 5, '2026-09-01\u0000B': 3 },
    { '2026-09-01\u0000A': 5, '2026-09-01\u0000B': 3 },
  ), true)
  assert.equal((cachePerformance as any).hasCompleteFulfillmentCoverage?.(
    { '2026-09-01\u0000A': 1 },
    { '2026-09-01\u0000A': 1, '2026-09-01\u0000B': 999 },
  ), false)
})

test('converts exact stock-type analytics counts into warehouse-tagged fulfillment rows', () => {
  const buildRows = (cachePerformance as any).buildStockAnalyticsFulfillmentOrders
  const wb = buildRows?.([{
    nmID: 101,
    vendorCode: 'pillow-40x40',
    subjectName: 'Подушки декоративные',
    brandName: 'Brand',
    metrics: { ordersCount: 2 },
  }], 'wb', '2026-08-31')
  const mp = buildRows?.([{
    nmID: 202,
    vendorCode: 'bag',
    subjectName: 'Сумки',
    brandName: 'Brand',
    metrics: { ordersCount: 1 },
  }], 'mp', '2026-08-31')

  assert.equal(wb?.error, undefined)
  assert.equal(mp?.error, undefined)
  assert.deepEqual(wb?.orders.map((row: any) => ({
    date: row.date,
    nmId: row.nmId,
    supplierArticle: row.supplierArticle,
    subject: row.subject,
    brand: row.brand,
    warehouseType: row.warehouseType,
  })), [
    {
      date: '2026-08-31T12:00:00',
      nmId: 101,
      supplierArticle: 'pillow-40x40',
      subject: 'Подушки декоративные',
      brand: 'Brand',
      warehouseType: 'Склад WB',
    },
    {
      date: '2026-08-31T12:00:00',
      nmId: 101,
      supplierArticle: 'pillow-40x40',
      subject: 'Подушки декоративные',
      brand: 'Brand',
      warehouseType: 'Склад WB',
    },
  ])
  assert.equal(mp?.orders.length, 1)
  assert.equal(mp?.orders[0]?.warehouseType, 'Склад продавца')
  assert.equal(buildRows?.([{ metrics: { ordersCount: -1 } }], 'wb', '2026-08-31')?.error,
    'Некорректный ответ складской аналитики FBS/FBO')
})

test('turns a stock analytics network rejection into a fulfillment warning', async () => {
  const loadSafely = (cachePerformance as any).loadStockAnalyticsResponseSafely
  const result = await loadSafely?.(async () => {
    throw new Error('socket reset with private details')
  })

  assert.deepEqual(result, {
    response: null,
    error: 'Ошибка сети складской аналитики FBS/FBO',
  })
})

test('accepts a stock analytics page only when no positive rows can remain', () => {
  const isComplete = (cachePerformance as any).isStockAnalyticsPageComplete
  assert.equal(isComplete?.([{ metrics: { ordersCount: 2 } }], 1000), true)
  assert.equal(isComplete?.([
    { metrics: { ordersCount: 2 } },
    { metrics: { ordersCount: 0 } },
  ], 2), true)
  assert.equal(isComplete?.([
    { metrics: { ordersCount: 2 } },
    { metrics: { ordersCount: 1 } },
  ], 2), false)
})

test('accepts only real order dates and applies Moscow time to timestamps', () => {
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2026-09-01'), '2026-09-01')
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2026-08-31T22:30:00Z'), '2026-09-01')
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2026-09-01garbage'), '')
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2026-02-30'), '')
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2026-02-30T00:00:00Z'), '')
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2026-02-29T00:00:00Z'), '')
  assert.equal((cachePerformance as any).getMoscowOrderDate?.('2024-02-29T00:00:00Z'), '2024-02-29')
})

test('selects only missing sellers for a scheduled cache retry', () => {
  assert.deepEqual((cachePerformance as any).getMissingWarmTargetIds?.({
    missing: 3,
    missingEntrepreneurIdsByDate: {
      '2026-09-01': [5],
      '2026-09-02': [5, 6],
    },
  }, ['2026-09-01', '2026-09-02']), [5, 6])
  assert.deepEqual((cachePerformance as any).getMissingWarmTargetIds?.({ missing: 0 }, ['2026-09-01']), [])
  assert.equal((cachePerformance as any).getMissingWarmTargetIds?.({ missing: 1 }, ['2026-09-01']), null)
  assert.equal((cachePerformance as any).getMissingWarmTargetIds?.({
    missing: 1,
    missingEntrepreneurIdsByDate: { '2026-08-31': [5] },
  }, ['2026-09-01']), null)

  assert.deepEqual((cachePerformance as any).getMissingWarmTargetsByDate?.({
    missing: 3,
    missingEntrepreneurIdsByDate: {
      '2026-08-31': [5],
      '2026-09-01': [5, 6],
    },
  }, ['2026-08-31', '2026-09-01']), {
    '2026-08-31': [5],
    '2026-09-01': [5, 6],
  })

  assert.deepEqual((cachePerformance as any).getMissingWarmTargetsByDate?.({
    missing: 0,
    incompleteFulfillmentEntrepreneurIdsByDate: { '2026-09-01': [5] },
  }, ['2026-09-01']), { '2026-09-01': [5] })

  assert.equal((cachePerformance as any).getMissingWarmTargetsByDate?.({
    missing: 2,
    missingEntrepreneurIdsByDate: { '2026-09-01': [5] },
  }, ['2026-09-01']), null)
})
