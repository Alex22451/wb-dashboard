import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canLiveLoadDailyRange,
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
