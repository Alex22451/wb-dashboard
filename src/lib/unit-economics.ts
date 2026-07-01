export type UnitFulfillment = 'fbs' | 'fbo'

export interface UnitEconomicsRow {
  id: string
  fulfillment: UnitFulfillment
  productName: string
  category?: string
  entrepreneurName: string
  nmId?: number | null
  vendorCode?: string | null
  costRub: number
  priceBeforeDiscountRub: number
  discountPct: number
  sppPct: number
  walletPct: number
  commissionPct: number
  avgDeliveryDays: number
  warehouse: string
  fixedWarehouseCoeff: number
  buyoutPct: number
  localizationIndex: number
  returnLogisticsRub: number
  deliveryLogisticsRub: number
  logisticsTotalRub: number
  taxAcquiringPct: number
  drrPct: number
  minProfitRub: number
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  boxQty: number
  source?: 'excel' | 'manual' | 'wb'
  updatedAt?: string
}

export interface UnitEconomicsStore {
  version: 1
  updatedAt: string
  rows: UnitEconomicsRow[]
}

export interface UnitEconomicsCalculatedRow extends UnitEconomicsRow {
  priceAfterDiscountRub: number
  priceAfterSppRub: number
  priceWithWalletRub: number
  commissionRub: number
  extraCommissionPct: number
  extraCommissionRub: number
  taxAcquiringRub: number
  adSpendRub: number
  profitRub: number
  profitWithAdsRub: number
  profitabilityPct: number
  volumeLiters: number
  status: 'ok' | 'below-min-profit' | 'loss' | 'incomplete'
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export function roundPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10000) / 100
}

export function calculateExtraCommissionPct(days: number, fulfillment: UnitFulfillment): number {
  if (!Number.isFinite(days) || days <= 1) return 0
  if (fulfillment === 'fbo') {
    if (days <= 13) return -0.01
    if (days <= 15) return 0
    if (days <= 42) return ((days - 15) * 0.15) / 100
    return ((days - 15) * 0.25) / 100
  }

  if (days <= 13) return -0.015
  if (days <= 18) return 0
  if (days <= 30) return ((days - 18) * 0.3) / 100
  if (days <= 36) return ((days - 18) * 0.35) / 100
  return ((days - 18) * 0.45) / 100
}

export function calculateUnitEconomics(row: UnitEconomicsRow): UnitEconomicsCalculatedRow {
  const priceAfterDiscountRub = roundMoney(row.priceBeforeDiscountRub * (1 - row.discountPct))
  const priceAfterSppRub = roundMoney(priceAfterDiscountRub * (1 - row.sppPct))
  const priceWithWalletRub = roundMoney(priceAfterSppRub * (1 - row.walletPct))
  const commissionRub = roundMoney(priceAfterDiscountRub * row.commissionPct)
  const extraCommissionPct = calculateExtraCommissionPct(row.avgDeliveryDays, row.fulfillment)
  const extraCommissionRub = roundMoney(priceAfterDiscountRub * extraCommissionPct)
  const taxAcquiringRub = roundMoney(priceWithWalletRub * row.taxAcquiringPct)
  const adSpendRub = roundMoney(priceAfterDiscountRub * row.drrPct)
  const volumeLiters = roundMoney((row.lengthCm * row.widthCm * row.heightCm) / 1000)
  const profitRub = roundMoney(
    priceAfterDiscountRub
    - commissionRub
    - row.costRub
    - row.logisticsTotalRub
    - taxAcquiringRub
    - extraCommissionRub,
  )
  const profitWithAdsRub = roundMoney(profitRub - adSpendRub)
  const profitabilityPct = priceAfterDiscountRub > 0 ? roundPct(profitRub / priceAfterDiscountRub) : 0
  const incomplete = !row.productName || row.priceBeforeDiscountRub <= 0 || row.costRub <= 0
  const status = incomplete
    ? 'incomplete'
    : profitWithAdsRub < 0
      ? 'loss'
      : profitWithAdsRub < row.minProfitRub
        ? 'below-min-profit'
        : 'ok'

  return {
    ...row,
    priceAfterDiscountRub,
    priceAfterSppRub,
    priceWithWalletRub,
    commissionRub,
    extraCommissionPct,
    extraCommissionRub,
    taxAcquiringRub,
    adSpendRub,
    profitRub,
    profitWithAdsRub,
    profitabilityPct,
    volumeLiters,
    status,
  }
}

export function summarizeUnitEconomics(rows: UnitEconomicsCalculatedRow[]) {
  const activeRows = rows.filter((row) => row.status !== 'incomplete')
  const profitRows = activeRows.filter((row) => row.profitWithAdsRub > 0)
  const avgProfit = activeRows.length
    ? activeRows.reduce((sum, row) => sum + row.profitWithAdsRub, 0) / activeRows.length
    : 0
  const avgProfitability = activeRows.length
    ? activeRows.reduce((sum, row) => sum + row.profitabilityPct, 0) / activeRows.length
    : 0

  return {
    totalRows: rows.length,
    activeRows: activeRows.length,
    lossRows: activeRows.filter((row) => row.status === 'loss').length,
    belowMinRows: activeRows.filter((row) => row.status === 'below-min-profit').length,
    profitableRows: profitRows.length,
    avgProfitRub: roundMoney(avgProfit),
    avgProfitabilityPct: roundPct(avgProfitability / 100),
    updatedAt: rows.reduce<string | null>((latest, row) => {
      if (!row.updatedAt) return latest
      if (!latest || row.updatedAt > latest) return row.updatedAt
      return latest
    }, null),
  }
}
