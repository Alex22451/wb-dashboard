export type UnitFulfillment = 'fbs' | 'fbo'

export interface UnitEconomicsRow {
  id: string
  fulfillment: UnitFulfillment
  productName: string
  category?: string
  entrepreneurName: string
  nmId?: number | null
  vendorCode?: string | null
  excelProductKey?: string | null
  wbSubject?: string | null
  wbBrand?: string | null
  wbSyncedAt?: string | null
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
  drrMode?: 'excel-auto' | 'manual'
  minProfitRub: number
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  boxQty: number
  source?: 'excel' | 'manual' | 'wb'
  updatedAt?: string
}

export interface UnitCostComponent {
  key: string
  name: string
  unit?: string
  unitCostRub: number
  quantity: number
  costRub: number
}

export interface UnitProductCost {
  id: string
  productName: string
  productKey: string
  totalCostRub: number
  components: UnitCostComponent[]
  lengthCm: number
  widthCm: number
  heightCm: number
  volumeLiters: number
  weightKg: number
  fbsCommissionPct: number
  fboCommissionPct: number
  extraCommissionPct: number
  boxQty: number
  updatedAt?: string
}

export interface UnitEconomicsStore {
  version: 1
  updatedAt: string
  rows: UnitEconomicsRow[]
  costs?: UnitProductCost[]
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
  profitabilityWithAdsPct: number
  volumeLiters: number
  expenseTotalRub: number
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

export function clampUnitRatio(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function calculateRawUnitLogistics(row: Pick<
  UnitEconomicsRow,
  'deliveryLogisticsRub' | 'returnLogisticsRub' | 'buyoutPct' | 'localizationIndex'
>): number {
  const buyoutPct = clampUnitRatio(row.buyoutPct, 1)
  const localizationIndex = Math.max(0, Number(row.localizationIndex) || 1)
  const delivery = Math.max(0, Number(row.deliveryLogisticsRub) || 0)
  const returns = Math.max(0, Number(row.returnLogisticsRub) || 0)
  return delivery * localizationIndex + returns * (1 - buyoutPct)
}

export function calculateUnitLogistics(row: Pick<
  UnitEconomicsRow,
  'deliveryLogisticsRub' | 'returnLogisticsRub' | 'buyoutPct' | 'localizationIndex'
>): number {
  return roundMoney(calculateRawUnitLogistics(row))
}

export function normalizeUnitProductKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[x*]/gi, 'х')
    .replace(/внутренняя\s+подушка/g, 'подушка внутренняя')
    .replace(/декоративная\s+подушка/g, 'подушка декоративная')
    .replace(/наволочки\s+декоративные/g, 'наволочка декоративная')
    .replace(/шеврон\b/g, 'шевроны')
    .replace(/\bремувк[аиуы]?\b/g, 'ремувки')
    .replace(/\s+/g, ' ')
    .trim()
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
  const discountPct = clampUnitRatio(row.discountPct)
  const sppPct = clampUnitRatio(row.sppPct)
  const walletPct = clampUnitRatio(row.walletPct)
  const commissionPct = clampUnitRatio(row.commissionPct)
  const taxAcquiringPct = clampUnitRatio(row.taxAcquiringPct)
  const rawPriceAfterDiscountRub = Math.max(0, row.priceBeforeDiscountRub) * (1 - discountPct)
  const rawPriceAfterSppRub = rawPriceAfterDiscountRub * (1 - sppPct)
  const rawPriceWithWalletRub = rawPriceAfterSppRub * (1 - walletPct)
  const rawCommissionRub = rawPriceAfterDiscountRub * commissionPct
  const extraCommissionPct = calculateExtraCommissionPct(row.avgDeliveryDays, row.fulfillment)
  const rawExtraCommissionRub = rawPriceAfterDiscountRub * extraCommissionPct
  const rawTaxAcquiringRub = rawPriceWithWalletRub * taxAcquiringPct
  const volumeLiters = roundMoney((row.lengthCm * row.widthCm * row.heightCm) / 1000)
  const rawLogisticsTotalRub = calculateRawUnitLogistics(row)
  const logisticsTotalRub = roundMoney(rawLogisticsTotalRub)
  const rawProfitRub = rawPriceAfterDiscountRub
    - rawCommissionRub
    - row.costRub
    - rawLogisticsTotalRub
    - rawTaxAcquiringRub
    - rawExtraCommissionRub
  const rawProfitability = rawPriceAfterDiscountRub > 0 ? rawProfitRub / rawPriceAfterDiscountRub : 0
  const drrMode = row.drrMode || (row.source === 'manual' ? 'manual' : 'excel-auto')
  // Excel derives DRR from profitability, but a loss must never create negative ad spend.
  const drrPct = drrMode === 'excel-auto' ? clampUnitRatio(rawProfitability / 3) : clampUnitRatio(row.drrPct)
  const rawAdSpendRub = rawPriceAfterDiscountRub * drrPct
  const rawProfitWithAdsRub = rawProfitRub - rawAdSpendRub
  const rawProfitabilityWithAds = rawPriceAfterDiscountRub > 0 ? rawProfitWithAdsRub / rawPriceAfterDiscountRub : 0
  const priceAfterDiscountRub = roundMoney(rawPriceAfterDiscountRub)
  const priceAfterSppRub = roundMoney(rawPriceAfterSppRub)
  const priceWithWalletRub = roundMoney(rawPriceWithWalletRub)
  const commissionRub = roundMoney(rawCommissionRub)
  const extraCommissionRub = roundMoney(rawExtraCommissionRub)
  const taxAcquiringRub = roundMoney(rawTaxAcquiringRub)
  const adSpendRub = roundMoney(rawAdSpendRub)
  const profitRub = roundMoney(rawProfitRub)
  const profitWithAdsRub = roundMoney(rawProfitWithAdsRub)
  const expenseTotalRub = roundMoney(rawCommissionRub + row.costRub + rawLogisticsTotalRub + rawTaxAcquiringRub + rawExtraCommissionRub + rawAdSpendRub)
  const profitabilityPct = roundPct(rawProfitability)
  const profitabilityWithAdsPct = roundPct(rawProfitabilityWithAds)
  const incomplete = !row.productName
    || priceAfterDiscountRub <= 0
    || row.costRub <= 0
    || row.buyoutPct <= 0
    || row.fixedWarehouseCoeff <= 0
    || row.localizationIndex <= 0
  const status = incomplete
    ? 'incomplete'
    : profitWithAdsRub < 0
      ? 'loss'
      : profitWithAdsRub < row.minProfitRub
        ? 'below-min-profit'
        : 'ok'

  return {
    ...row,
    discountPct,
    sppPct,
    walletPct,
    commissionPct,
    taxAcquiringPct,
    drrPct,
    drrMode,
    logisticsTotalRub,
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
    profitabilityWithAdsPct,
    volumeLiters,
    expenseTotalRub,
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
  const avgProfitabilityWithAds = activeRows.length
    ? activeRows.reduce((sum, row) => sum + row.profitabilityWithAdsPct, 0) / activeRows.length
    : 0

  return {
    totalRows: rows.length,
    activeRows: activeRows.length,
    lossRows: activeRows.filter((row) => row.status === 'loss').length,
    belowMinRows: activeRows.filter((row) => row.status === 'below-min-profit').length,
    profitableRows: profitRows.length,
    linkedRows: rows.filter((row) => !!row.nmId).length,
    categorizedRows: rows.filter((row) => !!row.wbSubject).length,
    completeRows: activeRows.length,
    avgProfitRub: roundMoney(avgProfit),
    avgProfitabilityPct: roundPct(avgProfitability / 100),
    avgProfitabilityWithAdsPct: roundPct(avgProfitabilityWithAds / 100),
    updatedAt: rows.reduce<string | null>((latest, row) => {
      if (!row.updatedAt) return latest
      if (!latest || row.updatedAt > latest) return row.updatedAt
      return latest
    }, null),
  }
}

export function summarizeUnitCosts(costs: UnitProductCost[]) {
  const withCost = costs.filter((cost) => cost.totalCostRub > 0)
  const avgCost = withCost.length
    ? withCost.reduce((sum, cost) => sum + cost.totalCostRub, 0) / withCost.length
    : 0

  return {
    totalRows: costs.length,
    avgCostRub: roundMoney(avgCost),
    components: costs.reduce((sum, cost) => sum + cost.components.length, 0),
    updatedAt: costs.reduce<string | null>((latest, cost) => {
      if (!cost.updatedAt) return latest
      if (!latest || cost.updatedAt > latest) return cost.updatedAt
      return latest
    }, null),
  }
}
