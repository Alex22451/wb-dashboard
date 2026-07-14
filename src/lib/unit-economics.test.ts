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
    drrMode: 'manual',
    minProfitRub: 100,
    lengthCm: 20,
    widthCm: 10,
    heightCm: 5,
    weightKg: 0.3,
    boxQty: 10,
    ...patch,
  }
}

test('logistics follows the Excel W = V*T + U*(1-S) formula', () => {
  assert.equal(calculateUnitLogistics(row()), 108)
  assert.equal(calculateUnitLogistics(row({ fixedWarehouseCoeff: 1.5 })), 108)
  assert.equal(calculateUnitLogistics(row({ localizationIndex: 1.25 })), 133)
  assert.equal(calculateUnitLogistics(row({ buyoutPct: 1 })), 100)
})

test('profitability matches Excel before ads and is explicit after ads', () => {
  const result = calculateUnitEconomics(row())
  assert.equal(result.priceAfterDiscountRub, 900)
  assert.equal(result.commissionRub, 180)
  assert.equal(result.logisticsTotalRub, 108)
  assert.equal(result.taxAcquiringRub, 18)
  assert.equal(result.adSpendRub, 90)
  assert.equal(result.profitRub, 294)
  assert.equal(result.profitWithAdsRub, 204)
  assert.equal(result.profitabilityPct, 32.67)
  assert.equal(result.profitabilityWithAdsPct, 22.67)
  assert.equal(result.status, 'ok')
})

test('advertising can turn a row into a loss', () => {
  const result = calculateUnitEconomics(row({ drrPct: 0.4 }))
  assert.equal(result.profitWithAdsRub, -66)
  assert.equal(result.status, 'loss')
  assert.equal(result.profitabilityPct, 32.67)
  assert.equal(result.profitabilityWithAdsPct, -7.33)
})

test('automatic Excel DRR never credits negative advertising to a loss', () => {
  const result = calculateUnitEconomics(row({
    costRub: 1_000,
    drrMode: 'excel-auto',
    drrPct: -0.5,
  }))
  assert.equal(result.profitRub, -406)
  assert.equal(result.drrPct, 0)
  assert.equal(result.adSpendRub, 0)
  assert.equal(result.profitWithAdsRub, -406)
})

test('FBS row matches ЮНИТКА ОБЩАЯ 2.0 row 2', () => {
  const result = calculateUnitEconomics(row({
    productName: 'Брелки 15*5',
    entrepreneurName: 'Зубахина Н.В.',
    costRub: 56,
    priceBeforeDiscountRub: 940,
    discountPct: 0.7,
    sppPct: 0.1,
    walletPct: 0.02,
    commissionPct: 0.2425,
    avgDeliveryDays: 30,
    fixedWarehouseCoeff: 1.65,
    buyoutPct: 0.9,
    localizationIndex: 1.03,
    returnLogisticsRub: 51.11111111111111,
    deliveryLogisticsRub: 58.08,
    taxAcquiringPct: 0.135,
    drrPct: 0.057862587339112155,
    drrMode: 'excel-auto',
  }))
  assert.equal(result.logisticsTotalRub, 64.93)
  assert.equal(result.profitRub, 48.95)
  assert.equal(result.adSpendRub, 16.32)
  assert.equal(result.profitWithAdsRub, 32.63)
  assert.equal(result.profitabilityPct, 17.36)
  assert.equal(result.profitabilityWithAdsPct, 11.57)
  assert.ok(Math.abs(result.drrPct - 0.05786258293838862) < 0.000001)
})

test('FBO row matches ЮНИТКА ОБЩАЯ 2.0 row 2', () => {
  const result = calculateUnitEconomics(row({
    fulfillment: 'fbo',
    productName: 'Подушка декоративная 150*50',
    entrepreneurName: 'Бураго Т.В.',
    costRub: 673,
    priceBeforeDiscountRub: 3630,
    discountPct: 0,
    sppPct: 0.43,
    walletPct: 0.02,
    commissionPct: 0.295,
    avgDeliveryDays: 0,
    fixedWarehouseCoeff: 1.65,
    buyoutPct: 0.87,
    localizationIndex: 1.03,
    returnLogisticsRub: 275.264367816092,
    deliveryLogisticsRub: 446.51045999999997,
    taxAcquiringPct: 0.12,
    drrPct: 0.10533826431440846,
    drrMode: 'excel-auto',
  }))
  assert.equal(result.logisticsTotalRub, 495.69)
  assert.equal(result.profitRub, 1147.13)
  assert.equal(result.adSpendRub, 382.38)
  assert.equal(result.profitWithAdsRub, 764.76)
  assert.equal(result.profitabilityPct, 31.6)
  assert.equal(result.profitabilityWithAdsPct, 21.07)
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
