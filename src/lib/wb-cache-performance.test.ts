import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canLiveLoadDailyRange,
  getMissingDailyTargetIdsByDate,
  getMissingDailyDates,
  shouldLiveLoadDailyRange,
  shouldRefreshDailyCache,
  shouldServeDailyCache,
  sliceDailyPayloadByDate,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './wb-cache-performance.ts'

test('requires a complete Redis response when the dashboard requests complete data', () => {
  assert.equal(shouldServeDailyCache({ missing: 1, requireComplete: true }), false)
  assert.equal(shouldServeDailyCache({ missing: 0, requireComplete: true }), true)
  assert.equal(shouldServeDailyCache({ missing: 1, requireComplete: false }), true)
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
