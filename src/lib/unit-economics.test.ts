import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateExtraCommissionPct,
  calculateUnitEconomics,
  calculateUnitLogistics,
  type UnitEconomicsRow,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './unit-economics.ts'

function row(patch: Partial<UnitEconomicsRow> = {}): UnitEconomicsRow {
  return {
    id: 'test',
    fulfillment: 'fbs',
    productName: 'Тестовый товар',
    entrepreneurName: 'ИП Тест',
    costRub: 300,
    priceBeforeDiscountRub: 1_000,
    discountPct: 0.1,
    sppPct: 0,
    walletPct: 0,
    commissionPct: 0.2,
    avgDeliveryDays: 18,
    warehouse: 'ЦФО',
    fixedWarehouseCoeff: 1,
    buyoutPct: 0.8,
    localizationIndex: 1,
    returnLogisticsRub: 40,
    deliveryLogisticsRub: 100,
    logisticsTotalRub: 0,
    taxAcquiringPct: 0.02,
    drrPct: 0.1,
    minProfitRub: 100,
    lengthCm: 20,
    widthCm: 10,
    heightCm: 5,
    weightKg: 0.3,
    boxQty: 10,
    ...patch,
  }
}

test('logistics reacts to buyout, warehouse coefficient and localization', () => {
  assert.equal(calculateUnitLogistics(row()), 110)
  assert.equal(calculateUnitLogistics(row({ fixedWarehouseCoeff: 1.5 })), 160)
  assert.equal(calculateUnitLogistics(row({ localizationIndex: 1.25 })), 137.5)
  assert.equal(calculateUnitLogistics(row({ buyoutPct: 1 })), 100)
})

test('profitability and status use profit after advertising', () => {
  const result = calculateUnitEconomics(row())
  assert.equal(result.priceAfterDiscountRub, 900)
  assert.equal(result.commissionRub, 180)
  assert.equal(result.logisticsTotalRub, 110)
  assert.equal(result.taxAcquiringRub, 18)
  assert.equal(result.adSpendRub, 90)
  assert.equal(result.profitWithAdsRub, 202)
  assert.equal(result.profitabilityPct, 22.44)
  assert.equal(result.status, 'ok')
})

test('advertising can turn a row into a loss', () => {
  const result = calculateUnitEconomics(row({ drrPct: 0.4 }))
  assert.equal(result.profitWithAdsRub, -68)
  assert.equal(result.status, 'loss')
  assert.equal(result.profitabilityPct, -7.56)
})

test('invalid logistics inputs keep the row incomplete', () => {
  assert.equal(calculateUnitEconomics(row({ buyoutPct: 0 })).status, 'incomplete')
  assert.equal(calculateUnitEconomics(row({ fixedWarehouseCoeff: 0 })).status, 'incomplete')
  assert.equal(calculateUnitEconomics(row({ localizationIndex: 0 })).status, 'incomplete')
})

test('ratios are clamped to a valid range', () => {
  const result = calculateUnitEconomics(row({ discountPct: 5, commissionPct: -1, drrPct: 3 }))
  assert.equal(result.discountPct, 1)
  assert.equal(result.commissionPct, 0)
  assert.equal(result.drrPct, 1)
  assert.equal(result.priceAfterDiscountRub, 0)
  assert.equal(result.status, 'incomplete')
})

test('extra commission boundaries remain stable', () => {
  assert.equal(calculateExtraCommissionPct(13, 'fbs'), -0.015)
  assert.equal(calculateExtraCommissionPct(18, 'fbs'), 0)
  assert.equal(calculateExtraCommissionPct(20, 'fbs'), 0.006)
  assert.equal(calculateExtraCommissionPct(13, 'fbo'), -0.01)
  assert.equal(calculateExtraCommissionPct(15, 'fbo'), 0)
})
