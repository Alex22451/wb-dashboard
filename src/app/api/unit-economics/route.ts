import { createHash, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { redisCommand } from '@/lib/redis-cache'
import seedRowsRaw from '@/data/unit-economics-seed.json'
import seedCostsRaw from '@/data/unit-economics-cost-seed.json'
import { getVercelWbTargets, type WbTarget } from '@/lib/user-store'
import { mapWbOrderToProductKey } from '@/lib/wb-mapping'
import {
  calculateUnitEconomics,
  normalizeUnitProductKey,
  summarizeUnitCosts,
  summarizeUnitEconomics,
  toNumber,
  type UnitCostComponent,
  type UnitEconomicsRow,
  type UnitEconomicsStore,
  type UnitFulfillment,
  type UnitProductCost,
} from '@/lib/unit-economics'

const STORE_KEY = 'wb:unit-economics:v1'
const CONTENT_CARDS_URL = 'https://content-api.wildberries.ru/content/v2/get/cards/list'
const PRICES_URL = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter'
const COMMON_API_BASE = 'https://common-api.wildberries.ru'
const seedRows = seedRowsRaw as UnitEconomicsRow[]
const seedCosts = seedCostsRaw as UnitProductCost[]
const WB_MANAGED_ROW_FIELDS: Array<keyof UnitEconomicsRow> = [
  'nmId',
  'vendorCode',
  'wbBrand',
  'wbSyncedAt',
  'commissionPct',
  'returnLogisticsRub',
  'deliveryLogisticsRub',
  'logisticsTotalRub',
]

interface WbCard {
  nmId: number
  vendorCode: string
  subject: string
  brand: string
  target: WbTarget
}

interface WbPrice {
  priceBeforeDiscountRub: number
  discountPct: number
  clubDiscountPct: number
}

interface WbTariffsPayload {
  fetchedAt: string
  date: string
  commissionReport: Record<string, unknown>[]
  boxWarehouses: Record<string, unknown>[]
  returnWarehouses: Record<string, unknown>[]
}

interface UnitTariffCategory {
  subjectID: number
  subjectName: string
  parentName: string
  fbsCommissionPct: number
  fboCommissionPct: number
}

function seedStore(): UnitEconomicsStore {
  const costs = seedCosts.map((cost) => normalizeCost(cost))
  return {
    version: 1,
    updatedAt: seedRows[0]?.updatedAt || costs[0]?.updatedAt || new Date(0).toISOString(),
    rows: applyCostCatalog(seedRows.map((row) => normalizeRow(row)), costs),
    costs,
  }
}

async function readStore(): Promise<UnitEconomicsStore> {
  const raw = await redisCommand<string>(['GET', STORE_KEY])
  if (!raw) return seedStore()
  try {
    const parsed = JSON.parse(raw) as UnitEconomicsStore
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return seedStore()
    return {
      version: 1,
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
      rows: applyCostCatalog(parsed.rows.map((row) => normalizeRow(row)), (parsed.costs || seedCosts).map((cost) => normalizeCost(cost))),
      costs: (parsed.costs || seedCosts).map((cost) => normalizeCost(cost)),
    }
  } catch {
    return seedStore()
  }
}

async function writeStore(rows: UnitEconomicsRow[], costsInput?: UnitProductCost[]): Promise<UnitEconomicsStore> {
  const costs = (costsInput || seedCosts).map((cost) => normalizeCost(cost))
  const store: UnitEconomicsStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rows: applyCostCatalog(rows.map((row) => normalizeRow(row)), costs),
    costs,
  }
  const result = await redisCommand<string>(['SET', STORE_KEY, JSON.stringify(store)])
  if (!result) throw new Error('Redis store is not available')
  return store
}

function jsonResponse(store: UnitEconomicsStore, tariffOptions?: Awaited<ReturnType<typeof buildUnitTariffOptions>>) {
  const costs = (store.costs || seedCosts).map((cost) => normalizeCost(cost))
  const rows = applyCostCatalog(store.rows.map((row) => normalizeRow(row)), costs).map(calculateUnitEconomics)
  return NextResponse.json({
    store: {
      version: store.version,
      updatedAt: store.updatedAt,
      rows,
      costs,
      summary: summarizeUnitEconomics(rows),
      costSummary: summarizeUnitCosts(costs),
    },
    tariffOptions,
  })
}

async function getAuthorizedUser(request: NextRequest) {
  const internalWarmRequest = !!(
    process.env.WB_VERCEL_API_TOKEN
    && request.headers.get('x-wb-internal-warm') === process.env.WB_VERCEL_API_TOKEN
  )
  return await getCurrentUser()
    || (internalWarmRequest
      ? { id: 0, username: 'cron', role: 'admin' as const }
      : null)
}

function normalizePct(value: unknown) {
  const number = toNumber(value)
  return Math.abs(number) > 1 ? number / 100 : number
}

function normalizeRow(input: Partial<UnitEconomicsRow>, existing?: UnitEconomicsRow): UnitEconomicsRow {
  const now = new Date().toISOString()
  return {
    id: String(input.id || existing?.id || randomUUID()),
    fulfillment: input.fulfillment === 'fbo' ? 'fbo' : 'fbs',
    productName: String(input.productName ?? existing?.productName ?? '').trim(),
    category: String(input.category ?? existing?.category ?? '').trim(),
    entrepreneurName: String(input.entrepreneurName ?? existing?.entrepreneurName ?? '').trim(),
    nmId: input.nmId ?? existing?.nmId ?? null,
    vendorCode: input.vendorCode ?? existing?.vendorCode ?? null,
    excelProductKey: input.excelProductKey ?? existing?.excelProductKey ?? normalizeUnitProductKey(input.productName ?? existing?.productName ?? ''),
    wbSubject: input.wbSubject ?? existing?.wbSubject ?? null,
    wbBrand: input.wbBrand ?? existing?.wbBrand ?? null,
    wbSyncedAt: input.wbSyncedAt ?? existing?.wbSyncedAt ?? null,
    costRub: toNumber(input.costRub, existing?.costRub || 0),
    priceBeforeDiscountRub: toNumber(input.priceBeforeDiscountRub, existing?.priceBeforeDiscountRub || 0),
    discountPct: normalizePct(input.discountPct ?? existing?.discountPct ?? 0),
    sppPct: normalizePct(input.sppPct ?? existing?.sppPct ?? 0),
    walletPct: normalizePct(input.walletPct ?? existing?.walletPct ?? 0),
    commissionPct: normalizePct(input.commissionPct ?? existing?.commissionPct ?? 0),
    avgDeliveryDays: toNumber(input.avgDeliveryDays, existing?.avgDeliveryDays || 0),
    warehouse: String(input.warehouse ?? existing?.warehouse ?? '').trim(),
    fixedWarehouseCoeff: toNumber(input.fixedWarehouseCoeff, existing?.fixedWarehouseCoeff || 1),
    buyoutPct: normalizePct(input.buyoutPct ?? existing?.buyoutPct ?? 1),
    localizationIndex: toNumber(input.localizationIndex, existing?.localizationIndex || 1),
    returnLogisticsRub: toNumber(input.returnLogisticsRub, existing?.returnLogisticsRub || 0),
    deliveryLogisticsRub: toNumber(input.deliveryLogisticsRub, existing?.deliveryLogisticsRub || 0),
    logisticsTotalRub: toNumber(input.logisticsTotalRub, existing?.logisticsTotalRub || 0),
    taxAcquiringPct: normalizePct(input.taxAcquiringPct ?? existing?.taxAcquiringPct ?? 0),
    drrPct: normalizePct(input.drrPct ?? existing?.drrPct ?? 0),
    minProfitRub: toNumber(input.minProfitRub, existing?.minProfitRub || 0),
    lengthCm: toNumber(input.lengthCm, existing?.lengthCm || 0),
    widthCm: toNumber(input.widthCm, existing?.widthCm || 0),
    heightCm: toNumber(input.heightCm, existing?.heightCm || 0),
    weightKg: toNumber(input.weightKg, existing?.weightKg || 0),
    boxQty: toNumber(input.boxQty, existing?.boxQty || 0),
    source: input.source || existing?.source || 'manual',
    updatedAt: input.updatedAt || existing?.updatedAt || now,
  }
}

function normalizeCost(input: Partial<UnitProductCost>, existing?: UnitProductCost): UnitProductCost {
  const now = new Date().toISOString()
  const productName = String(input.productName ?? existing?.productName ?? '').trim()
  const components = Array.isArray(input.components) ? input.components : existing?.components || []
  const normalizedComponents: UnitCostComponent[] = components.map((component) => ({
    key: String(component.key || '').trim(),
    name: String(component.name || '').trim(),
    unit: component.unit ? String(component.unit).trim() : '',
    unitCostRub: toNumber(component.unitCostRub),
    quantity: toNumber(component.quantity),
    costRub: toNumber(component.costRub),
  })).filter((component) => component.name)

  return {
    id: String(input.id || existing?.id || randomUUID()),
    productName,
    productKey: normalizeUnitProductKey(input.productKey || existing?.productKey || productName),
    totalCostRub: toNumber(input.totalCostRub, existing?.totalCostRub || 0),
    components: normalizedComponents,
    lengthCm: toNumber(input.lengthCm, existing?.lengthCm || 0),
    widthCm: toNumber(input.widthCm, existing?.widthCm || 0),
    heightCm: toNumber(input.heightCm, existing?.heightCm || 0),
    volumeLiters: toNumber(input.volumeLiters, existing?.volumeLiters || 0),
    weightKg: toNumber(input.weightKg, existing?.weightKg || 0),
    fbsCommissionPct: normalizePct(input.fbsCommissionPct ?? existing?.fbsCommissionPct ?? 0),
    fboCommissionPct: normalizePct(input.fboCommissionPct ?? existing?.fboCommissionPct ?? 0),
    extraCommissionPct: normalizePct(input.extraCommissionPct ?? existing?.extraCommissionPct ?? 0),
    boxQty: toNumber(input.boxQty, existing?.boxQty || 0),
    updatedAt: input.updatedAt || existing?.updatedAt || now,
  }
}

function preserveWbManagedFields(input: Partial<UnitEconomicsRow>, existing?: UnitEconomicsRow): Partial<UnitEconomicsRow> {
  if (!existing) return input
  const next = { ...input }
  for (const key of WB_MANAGED_ROW_FIELDS) {
    ;(next as Record<string, unknown>)[key] = existing[key]
  }
  return next
}

function applyCostCatalog(rows: UnitEconomicsRow[], costs: UnitProductCost[]): UnitEconomicsRow[] {
  const byKey = new Map(costs.map((cost) => [normalizeUnitProductKey(cost.productKey || cost.productName), cost]))
  return rows.map((row) => {
    const key = normalizeUnitProductKey(row.excelProductKey || row.productName)
    const cost = byKey.get(key)
    if (!cost) return row
    return {
      ...row,
      costRub: cost.totalCostRub || row.costRub,
      lengthCm: cost.lengthCm || row.lengthCm,
      widthCm: cost.widthCm || row.widthCm,
      heightCm: cost.heightCm || row.heightCm,
      weightKg: cost.weightKg || row.weightKg,
      boxQty: cost.boxQty || row.boxQty,
    }
  })
}

function readWorkbookCosts(workbook: import('xlsx').WorkBook, XLSX: typeof import('xlsx')): UnitProductCost[] {
  const sheet = workbook.Sheets['Себестоимость 2.0']
  if (!sheet?.['!ref']) return []
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const cell = (row: number, col: number) => sheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v
  const components: Array<{ col: number; key: string; name: string; unit: string; unitCostRub: number }> = []

  for (let col = 2; col <= 49; col += 1) {
    const name = String(cell(0, col) || '').trim()
    if (!name) continue
    components.push({
      col,
      key: XLSX.utils.encode_col(col),
      name,
      unit: String(cell(4, col) || '').trim(),
      unitCostRub: toNumber(cell(2, col)),
    })
  }

  const costs: UnitProductCost[] = []
  for (let row = 6; row <= range.e.r; row += 1) {
    const productName = String(cell(row, 0) || '').trim()
    if (!productName || /КОЛ-ВО МАТЕРИАЛОВ/i.test(productName) || productName === 'СЕБЕСТОИМОСТЬ ПО ИЗДЕЛИЯМ') continue
    const totalCostRub = toNumber(cell(row, 1))
    if (totalCostRub <= 0) continue
    const previousName = String(cell(row - 1, 0) || '')
    const quantityRow = /КОЛ-ВО МАТЕРИАЛОВ/i.test(previousName) ? row - 1 : -1
    const costComponents = components
      .map((component) => {
        const quantity = quantityRow >= 0 ? toNumber(cell(quantityRow, component.col)) : 0
        const costRub = toNumber(cell(row, component.col))
        return {
          key: component.key,
          name: component.name,
          unit: component.unit,
          unitCostRub: component.unitCostRub,
          quantity,
          costRub,
        }
      })
      .filter((component) => component.quantity || component.costRub)

    costs.push(normalizeCost({
      id: `cost-${row + 1}`,
      productName,
      productKey: normalizeUnitProductKey(productName),
      totalCostRub,
      components: costComponents,
      lengthCm: toNumber(cell(row, 51)),
      widthCm: toNumber(cell(row, 52)),
      heightCm: toNumber(cell(row, 53)),
      volumeLiters: toNumber(cell(row, 54)),
      weightKg: toNumber(cell(row, 55)),
      fbsCommissionPct: toNumber(cell(row, 56)),
      fboCommissionPct: toNumber(cell(row, 57)),
      extraCommissionPct: toNumber(cell(row, 58)),
      boxQty: toNumber(cell(row, 59)),
      updatedAt: new Date().toISOString(),
    }))
  }
  return costs
}

async function parseWorkbook(file: File): Promise<{ rows: UnitEconomicsRow[]; costs: UnitProductCost[] }> {
  const XLSX = await import('xlsx')
  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellDates: false })
  const now = new Date().toISOString()

  const readSheet = (sheetName: string, fulfillment: UnitFulfillment): UnitEconomicsRow[] => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet?.['!ref']) return []
    const range = XLSX.utils.decode_range(sheet['!ref'])
    const cell = (row: number, col: number) => sheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v
    const rows: UnitEconomicsRow[] = []

    for (let row = 1; row <= range.e.r; row += 1) {
      const productName = String(cell(row, 0) || '').trim()
      if (!productName || productName === 'СЕБЕСТОИМОСТЬ ПО ИЗДЕЛИЯМ') continue
      const priceBeforeDiscountRub = toNumber(cell(row, 4))
      const costRub = toNumber(cell(row, 3))
      if (!priceBeforeDiscountRub && !costRub) continue

      rows.push(normalizeRow({
        id: randomUUID(),
        fulfillment,
        productName,
        category: String(cell(row, 1) || '').trim(),
        entrepreneurName: String(cell(row, 2) || '').trim(),
        excelProductKey: normalizeUnitProductKey(productName),
        wbSubject: null,
        wbBrand: null,
        wbSyncedAt: null,
        costRub,
        priceBeforeDiscountRub,
        discountPct: toNumber(cell(row, 5)),
        sppPct: toNumber(cell(row, 7)),
        walletPct: toNumber(cell(row, 9)),
        commissionPct: toNumber(cell(row, 11)),
        avgDeliveryDays: toNumber(cell(row, 13)),
        warehouse: String(cell(row, 16) || '').trim(),
        fixedWarehouseCoeff: toNumber(cell(row, 17), 1),
        buyoutPct: toNumber(cell(row, 18), 1),
        localizationIndex: toNumber(cell(row, 19), 1),
        returnLogisticsRub: toNumber(cell(row, 20)),
        deliveryLogisticsRub: toNumber(cell(row, 21)),
        logisticsTotalRub: toNumber(cell(row, 22)),
        taxAcquiringPct: toNumber(cell(row, 23)),
        drrPct: toNumber(cell(row, 25)),
        minProfitRub: toNumber(cell(row, fulfillment === 'fbs' ? 30 : 29)),
        lengthCm: toNumber(cell(row, 32)),
        widthCm: toNumber(cell(row, 33)),
        heightCm: toNumber(cell(row, 34)),
        weightKg: toNumber(cell(row, 35)),
        boxQty: toNumber(cell(row, 36)),
        source: 'excel',
        updatedAt: now,
      }))
    }

    return rows
  }

  return {
    rows: [
    ...readSheet('Юнитка 2.0 ФБС', 'fbs'),
    ...readSheet('Юнитка 2.0 ФБО', 'fbo'),
    ],
    costs: readWorkbookCosts(workbook, XLSX),
  }
}

function normalizeApiKey(apiKey: string) {
  return apiKey.trim().replace(/^bearer\s+/i, '').trim()
}

function apiKeyFingerprint(apiKey: string) {
  return createHash('sha256').update(normalizeApiKey(apiKey)).digest('hex').slice(0, 16)
}

function numberFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(record[key])
    if (value > 0) return value
  }
  return 0
}

function tariffCacheKey(apiKey: string, date: string) {
  return `wb:unit-economics:tariffs:v1:${apiKeyFingerprint(apiKey)}:${date}`
}

function tariffCacheTtlSeconds() {
  return 14 * 24 * 60 * 60
}

function todayMoscowDate() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)
}

async function readTariffCache(apiKey: string, date: string): Promise<WbTariffsPayload | null> {
  const raw = await redisCommand<string>(['GET', tariffCacheKey(apiKey, date)])
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.commissionReport) || !Array.isArray(parsed?.boxWarehouses)) return null
    return parsed as WbTariffsPayload
  } catch {
    return null
  }
}

async function writeTariffCache(apiKey: string, date: string, payload: WbTariffsPayload) {
  await redisCommand([
    'SET',
    tariffCacheKey(apiKey, date),
    JSON.stringify(payload),
    'EX',
    tariffCacheTtlSeconds(),
  ])
}

function parseWbNumber(value: unknown, fallback = 0) {
  if (typeof value === 'string') {
    return toNumber(value.replace(/\u00a0/g, ' '), fallback)
  }
  return toNumber(value, fallback)
}

function normalizeTariffName(value: unknown) {
  return normalizeUnitProductKey(value).replace(/^категория\s+/i, '').trim()
}

async function fetchWbTariffs(target: WbTarget, date: string, force = false): Promise<{ payload: WbTariffsPayload; cacheHit: boolean }> {
  if (!force) {
    const cached = await readTariffCache(target.wbApiKey, date)
    if (cached) return { payload: cached, cacheHit: true }
  }

  const headers = { Authorization: normalizeApiKey(target.wbApiKey) }
  const fetchJson = async (url: string) => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`${target.name}: WB Tariffs ${response.status} ${body.slice(0, 140)}`)
    }
    return response.json()
  }

  const [commission, box, returns] = await Promise.all([
    fetchJson(`${COMMON_API_BASE}/api/v1/tariffs/commission?locale=ru`),
    fetchJson(`${COMMON_API_BASE}/api/v1/tariffs/box?date=${date}`),
    fetchJson(`${COMMON_API_BASE}/api/v1/tariffs/return?date=${date}`),
  ])

  const payload: WbTariffsPayload = {
    fetchedAt: new Date().toISOString(),
    date,
    commissionReport: Array.isArray(commission?.report) ? commission.report : [],
    boxWarehouses: Array.isArray(box?.response?.data?.warehouseList) ? box.response.data.warehouseList : [],
    returnWarehouses: Array.isArray(returns?.response?.data?.warehouseList) ? returns.response.data.warehouseList : [],
  }
  await writeTariffCache(target.wbApiKey, date, payload)
  return { payload, cacheHit: false }
}

async function fetchWbCards(target: WbTarget): Promise<WbCard[]> {
  const cards: WbCard[] = []
  let cursor: Record<string, unknown> = { limit: 100 }

  for (let page = 0; page < 60; page += 1) {
    const response = await fetch(CONTENT_CARDS_URL, {
      method: 'POST',
      headers: {
        Authorization: normalizeApiKey(target.wbApiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        settings: {
          cursor,
          filter: { withPhoto: -1 },
        },
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`${target.name}: WB Content ${response.status} ${body.slice(0, 120)}`)
    }

    const data = await response.json()
    const pageCards = Array.isArray(data?.cards) ? data.cards : []
    for (const card of pageCards) {
      const nmId = Number(card.nmID ?? card.nmId ?? card.nm_id) || 0
      const vendorCode = String(card.vendorCode || card.supplierArticle || '').trim()
      const subject = String(card.subjectName || card.object || '').trim()
      const brand = String(card.brand || card.brandName || '').trim()
      if (!nmId || !vendorCode || !subject) continue
      cards.push({ nmId, vendorCode, subject, brand, target })
    }

    const nextCursor = data?.cursor || {}
    const total = Number(nextCursor.total) || pageCards.length
    if (pageCards.length === 0 || total < 100) break
    cursor = {
      limit: 100,
      updatedAt: nextCursor.updatedAt,
      nmID: nextCursor.nmID,
    }
  }

  return cards
}

async function fetchWbPrices(target: WbTarget): Promise<Map<number, WbPrice>> {
  const prices = new Map<number, WbPrice>()
  for (let offset = 0; offset < 100000; offset += 1000) {
    const response = await fetch(`${PRICES_URL}?limit=1000&offset=${offset}`, {
      headers: { Authorization: normalizeApiKey(target.wbApiKey) },
      signal: AbortSignal.timeout(30000),
    })

    if (response.status === 404) return prices
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`${target.name}: WB Prices ${response.status} ${body.slice(0, 120)}`)
    }

    const data = await response.json()
    const rows = Array.isArray(data?.data?.listGoods) ? data.data.listGoods : []
    for (const item of rows) {
      const record = item as Record<string, unknown>
      const nmId = Number(record.nmID ?? record.nmId ?? record.nm_id) || 0
      if (!nmId) continue
      const price = numberFromRecord(record, ['price', 'priceBeforeDiscount', 'basicPrice'])
      const discount = toNumber(record.discount)
      const clubDiscount = toNumber(record.clubDiscount)
      prices.set(nmId, {
        priceBeforeDiscountRub: price,
        discountPct: Math.abs(discount) > 1 ? discount / 100 : discount,
        clubDiscountPct: Math.abs(clubDiscount) > 1 ? clubDiscount / 100 : clubDiscount,
      })
    }

    if (rows.length < 1000) break
  }
  return prices
}

function sameEntrepreneur(rowName: string, targetName: string) {
  const row = rowName.toLowerCase().replace(/\s+/g, '')
  const target = targetName.toLowerCase().replace(/\s+/g, '')
  return row && target && (row.includes(target) || target.includes(row))
}

function normalizeUnitMatchKey(value: unknown) {
  return normalizeUnitProductKey(value)
    .replace(/\bбрелки\b/g, 'ремувки')
    .replace(/\bбрелок\b/g, 'ремувки')
    .replace(/\bковрик для намаза\b/g, 'коврики для намаза')
    .replace(/\bчехлы для бутылей с дном\b/g, 'чехлы для бутылей')
    .replace(/\bчехол для бутылей с дном\b/g, 'чехлы для бутылей')
    .replace(/\bшеврон\b/g, 'шевроны')
    .replace(/\bбез печати\b/g, '')
    .replace(/\bвелюр\b/g, '')
    .replace(/\bгабардин\b/g, '')
    .replace(/\bo[хx]ford\b/g, '')
    .replace(/\bоксфорд\b/g, '')
    .replace(/\b2\s*шт\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getDimension(value: string) {
  return value.match(/\b(\d{1,3})\s*х\s*(\d{1,3})\b/)
}

function swapFirstDimension(value: string) {
  return value.replace(/\b(\d{1,3})\s*х\s*(\d{1,3})\b/, '$2х$1')
}

function baseUnitMatchKey(value: string) {
  return value
    .replace(/\b\d{1,3}\s*х\s*\d{1,3}\b/g, '')
    .replace(/\b\d+\s*шт\b/g, '')
    .replace(/\b\d{2,3}\s*см\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function unitMatchCandidates(value: unknown) {
  const exact = normalizeUnitMatchKey(value)
  const candidates = new Set<string>()
  if (exact) {
    candidates.add(exact)
    const swapped = swapFirstDimension(exact)
    if (swapped !== exact) candidates.add(swapped)
    const base = baseUnitMatchKey(exact)
    if (base) candidates.add(base)
  }
  return {
    exact,
    hasDimension: !!getDimension(exact),
    base: baseUnitMatchKey(exact),
    candidates,
  }
}

function unitKeysMatch(rowKey: ReturnType<typeof unitMatchCandidates>, cardKey: ReturnType<typeof unitMatchCandidates>) {
  if (!rowKey.exact || !cardKey.exact) return false
  for (const candidate of cardKey.candidates) {
    if (rowKey.candidates.has(candidate)) return true
  }
  if ((!rowKey.hasDimension || !cardKey.hasDimension) && rowKey.base && cardKey.base) {
    return rowKey.base === cardKey.base
  }
  return false
}

function findCommission(row: UnitEconomicsRow, report: Record<string, unknown>[]) {
  const candidates = [
    row.wbSubject,
    row.category,
    row.excelProductKey,
    row.productName,
  ].map(normalizeTariffName).filter(Boolean)

  const exact = report.find((item) => {
    const subject = normalizeTariffName(item.subjectName)
    return candidates.some((candidate) => subject === candidate)
  })
  const partial = exact || report.find((item) => {
    const subject = normalizeTariffName(item.subjectName)
    return candidates.some((candidate) => subject.includes(candidate) || candidate.includes(subject))
  })
  if (!partial) return null

  const pct = row.fulfillment === 'fbs'
    ? parseWbNumber(partial.kgvpMarketplace)
    : parseWbNumber(partial.paidStorageKgvp) || parseWbNumber(partial.kgvpMarketplace)
  return pct > 0 ? pct / 100 : null
}

function pickWarehouse(row: UnitEconomicsRow, warehouses: Record<string, unknown>[]) {
  if (warehouses.length === 0) return null
  const rowWarehouse = normalizeTariffName(row.warehouse)
  if (rowWarehouse && rowWarehouse !== 'маркетплеис' && rowWarehouse !== 'маркетплейс') {
    const exact = warehouses.find((item) => {
      return normalizeTariffName(item.warehouseName) === rowWarehouse
        || normalizeTariffName(item.geoName) === rowWarehouse
    })
    if (exact) return exact
    const partial = warehouses.find((item) => {
      const name = normalizeTariffName(item.warehouseName)
      const geoName = normalizeTariffName(item.geoName)
      return (name && (name.includes(rowWarehouse) || rowWarehouse.includes(name)))
        || (geoName && (geoName.includes(rowWarehouse) || rowWarehouse.includes(geoName)))
    })
    if (partial) return partial
  }
  return null
}

function averageWarehouseTariff(warehouses: Record<string, unknown>[], keys: string[]) {
  const values = warehouses
    .map((warehouse) => {
      const next: Record<string, number> = {}
      for (const key of keys) next[key] = parseWbNumber(warehouse[key], key.toLowerCase().includes('coef') ? 100 : 0)
      return next
    })
    .filter((item) => item[keys[0]] > 0 && item[keys[2]] > 0)
  if (values.length === 0) return null
  return keys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = values.reduce((sum, item) => sum + item[key], 0) / values.length
    return acc
  }, {})
}

function calculateDeliveryFromBoxTariff(row: UnitEconomicsRow, boxWarehouses: Record<string, unknown>[]) {
  const keys = row.fulfillment === 'fbs'
    ? ['boxDeliveryMarketplaceBase', 'boxDeliveryMarketplaceLiter', 'boxDeliveryMarketplaceCoefExpr']
    : ['boxDeliveryBase', 'boxDeliveryLiter', 'boxDeliveryCoefExpr']
  const warehouse = pickWarehouse(row, boxWarehouses)
  const values = warehouse
    ? {
      [keys[0]]: parseWbNumber(warehouse[keys[0]]),
      [keys[1]]: parseWbNumber(warehouse[keys[1]]),
      [keys[2]]: parseWbNumber(warehouse[keys[2]], 100),
    }
    : averageWarehouseTariff(boxWarehouses, keys)
  if (!values) return null

  const base = values[keys[0]]
  const liter = values[keys[1]]
  const coef = values[keys[2]] || 100
  if (base <= 0) return null
  const volume = Math.max(1, (row.lengthCm * row.widthCm * row.heightCm) / 1000)
  return Math.round((base + Math.max(0, volume - 1) * liter) * (coef / 100) * 100) / 100
}

function calculateReturnFromTariff(row: UnitEconomicsRow, returnWarehouses: Record<string, unknown>[]) {
  const warehouse = pickWarehouse(row, returnWarehouses)
  const source = warehouse || null
  const values = source
    ? ['deliveryDumpSrgReturnExpr', 'deliveryDumpSupReturnExpr', 'deliveryDumpKgtReturnExpr']
      .map((key) => parseWbNumber(source[key]))
      .filter((value) => value > 0)
    : returnWarehouses
      .flatMap((item) => ['deliveryDumpSrgReturnExpr', 'deliveryDumpSupReturnExpr']
        .map((key) => parseWbNumber(item[key]))
        .filter((value) => value > 0))
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
}

function calculateLogisticsTotal(row: UnitEconomicsRow) {
  const buyout = row.buyoutPct > 0 ? row.buyoutPct : 1
  const returnPart = row.returnLogisticsRub * Math.max(0, (1 - buyout) / buyout)
  return Math.round((row.deliveryLogisticsRub + returnPart) * Math.max(1, row.localizationIndex || 1) * 100) / 100
}

function findTulaWarehouse(warehouses: Record<string, unknown>[]) {
  return warehouses.find((warehouse) => normalizeTariffName(warehouse.warehouseName) === 'тула') || null
}

function isCentralFederalDistrictWarehouse(warehouse: Record<string, unknown>) {
  const geoName = normalizeTariffName(warehouse.geoName)
  const warehouseName = normalizeTariffName(warehouse.warehouseName)
  return geoName.includes('центральн') || warehouseName.includes('центральн')
}

function centralFederalDistrictWarehouses(warehouses: Record<string, unknown>[]) {
  return warehouses.filter(isCentralFederalDistrictWarehouse)
}

function pickLogisticsWarehouses(warehouses: Record<string, unknown>[], fulfillment: UnitFulfillment) {
  if (fulfillment === 'fbs') {
    const central = centralFederalDistrictWarehouses(warehouses)
    return central.length > 0 ? central : warehouses
  }
  const tula = findTulaWarehouse(warehouses)
  return tula ? [tula] : warehouses
}

function logisticsWarehouseName(fulfillment: UnitFulfillment) {
  return fulfillment === 'fbs' ? 'Центральный федеральный округ' : 'Тула'
}

function getCommissionPair(item: Record<string, unknown>) {
  const fbs = parseWbNumber(item.kgvpMarketplace)
  const fbo = parseWbNumber(item.paidStorageKgvp) || parseWbNumber(item.kgvpMarketplace)
  return {
    fbsCommissionPct: fbs > 0 ? fbs / 100 : 0,
    fboCommissionPct: fbo > 0 ? fbo / 100 : 0,
  }
}

function tariffCategories(payload: WbTariffsPayload): UnitTariffCategory[] {
  const bySubject = new Map<string, UnitTariffCategory>()
  for (const item of payload.commissionReport) {
    const subjectName = String(item.subjectName || '').trim()
    if (!subjectName) continue
    const pair = getCommissionPair(item)
    bySubject.set(subjectName, {
      subjectID: Number(item.subjectID) || 0,
      subjectName,
      parentName: String(item.parentName || '').trim(),
      ...pair,
    })
  }
  return [...bySubject.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ru'))
}

function calculateTariffDelivery(volumeLiters: number, fulfillment: UnitFulfillment, warehouses: Record<string, unknown>[]) {
  const keys = fulfillment === 'fbs'
    ? ['boxDeliveryMarketplaceBase', 'boxDeliveryMarketplaceLiter', 'boxDeliveryMarketplaceCoefExpr']
    : ['boxDeliveryBase', 'boxDeliveryLiter', 'boxDeliveryCoefExpr']
  const values = averageWarehouseTariff(warehouses, keys)
  if (!values) return 0
  const base = values[keys[0]]
  const liter = values[keys[1]]
  const coef = values[keys[2]] || 100
  if (base <= 0) return 0
  const volume = Math.max(1, volumeLiters)
  return Math.round((base + Math.max(0, volume - 1) * liter) * (coef / 100) * 100) / 100
}

function calculateTariffReturn(warehouses: Record<string, unknown>[]) {
  const values = warehouses.flatMap((warehouse) => ['deliveryDumpSrgReturnExpr', 'deliveryDumpSupReturnExpr']
    .map((key) => parseWbNumber(warehouse[key]))
    .filter((value) => value > 0))
  if (values.length === 0) return 0
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
}

async function buildUnitTariffOptions(targets: WbTarget[]) {
  const target = targets.find((item) => item.wbApiKey)
  if (!target) return null
  try {
    const date = todayMoscowDate()
    const { payload, cacheHit } = await fetchWbTariffs(target, date)
    const fbsBox = pickLogisticsWarehouses(payload.boxWarehouses, 'fbs')
    const fbsReturn = pickLogisticsWarehouses(payload.returnWarehouses, 'fbs')
    const tulaBox = pickLogisticsWarehouses(payload.boxWarehouses, 'fbo')
    const tulaReturn = pickLogisticsWarehouses(payload.returnWarehouses, 'fbo')
    const fbsBoxValues = averageWarehouseTariff(fbsBox, ['boxDeliveryMarketplaceBase', 'boxDeliveryMarketplaceLiter', 'boxDeliveryMarketplaceCoefExpr'])
    const fboBoxValues = averageWarehouseTariff(tulaBox, ['boxDeliveryBase', 'boxDeliveryLiter', 'boxDeliveryCoefExpr'])
    return {
      date,
      cacheHit,
      sourceTarget: target.name,
      categories: tariffCategories(payload),
      tula: {
        warehouseName: 'Тула',
        fbsWarehouseName: 'Центральный федеральный округ',
        fboWarehouseName: 'Тула',
        fbsBaseRub: fbsBoxValues?.boxDeliveryMarketplaceBase || 0,
        fbsLiterRub: fbsBoxValues?.boxDeliveryMarketplaceLiter || 0,
        fbsCoefPct: fbsBoxValues?.boxDeliveryMarketplaceCoefExpr || 100,
        fboBaseRub: fboBoxValues?.boxDeliveryBase || 0,
        fboLiterRub: fboBoxValues?.boxDeliveryLiter || 0,
        fboCoefPct: fboBoxValues?.boxDeliveryCoefExpr || 100,
        fbsReturnRub: calculateTariffReturn(fbsReturn),
        fboReturnRub: calculateTariffReturn(tulaReturn),
        returnRub: calculateTariffReturn(tulaReturn),
      },
    }
  } catch {
    return null
  }
}

async function applyAutomaticWbTariffs(row: UnitEconomicsRow, targets: WbTarget[]) {
  const target = targets.find((item) => item.wbApiKey)
  if (!target) return row
  try {
    const { payload } = await fetchWbTariffs(target, todayMoscowDate())
    const next = { ...row, warehouse: logisticsWarehouseName(row.fulfillment) }
    const subject = normalizeTariffName(next.wbSubject || next.category)
    const commissionRow = payload.commissionReport.find((item) => normalizeTariffName(item.subjectName) === subject)
    if (commissionRow) {
      const pair = getCommissionPair(commissionRow)
      next.commissionPct = next.fulfillment === 'fbs' ? pair.fbsCommissionPct : pair.fboCommissionPct
    }

    const volume = Math.max(1, (next.lengthCm * next.widthCm * next.heightCm) / 1000)
    next.deliveryLogisticsRub = calculateTariffDelivery(volume, next.fulfillment, pickLogisticsWarehouses(payload.boxWarehouses, next.fulfillment))
    next.returnLogisticsRub = calculateTariffReturn(pickLogisticsWarehouses(payload.returnWarehouses, next.fulfillment))
    next.logisticsTotalRub = calculateLogisticsTotal(next)
    return next
  } catch {
    return row
  }
}

async function syncWithWb(store: UnitEconomicsStore, targets: WbTarget[]) {
  const now = new Date().toISOString()
  const rows = store.rows.map((row) => normalizeRow(row))
  const rowKeys = rows.map((row) => ({
    row,
    key: unitMatchCandidates(row.excelProductKey || row.productName),
  }))
  const stats = {
    targets: targets.length,
    cards: 0,
    prices: 0,
    matchedRows: 0,
    updatedRows: 0,
    targetReports: [] as Array<{
      name: string
      cards: number
      prices: number
      matchedRows: number
      updatedRows: number
      contentStatus: 'ok' | 'error'
      pricesStatus: 'ok' | 'error' | 'skipped'
      warnings: string[]
    }>,
    unmatchedCards: [] as Array<{ target: string; vendorCode: string; nmId: number; key: string }>,
    errors: [] as string[],
  }

  for (const target of targets) {
    let cards: WbCard[] = []
    let prices = new Map<number, WbPrice>()
    const targetReport = {
      name: target.name,
      cards: 0,
      prices: 0,
      matchedRows: 0,
      updatedRows: 0,
      contentStatus: 'ok' as 'ok' | 'error',
      pricesStatus: 'skipped' as 'ok' | 'error' | 'skipped',
      warnings: [] as string[],
    }

    try {
      cards = await fetchWbCards(target)
      stats.cards += cards.length
      targetReport.cards = cards.length
    } catch (error) {
      const message = error instanceof Error ? error.message : `${target.name}: ошибка WB Content API`
      targetReport.contentStatus = 'error'
      targetReport.warnings.push(message)
      stats.errors.push(message)
      stats.targetReports.push(targetReport)
      continue
    }

    try {
      prices = await fetchWbPrices(target)
      stats.prices += prices.size
      targetReport.prices = prices.size
      targetReport.pricesStatus = 'ok'
    } catch (error) {
      const message = error instanceof Error ? error.message : `${target.name}: ошибка WB Prices API`
      targetReport.pricesStatus = 'error'
      targetReport.warnings.push(`${message}; цены пропущены`)
      stats.errors.push(`${message}; цены пропущены, карточки замаплены`)
    }

    for (const card of cards) {
      const mappedRaw = mapWbOrderToProductKey(card.subject, card.vendorCode, card.brand) || ''
      const mappedKey = unitMatchCandidates(mappedRaw)
      if (!mappedKey.exact) continue
      const matched = rowKeys.filter(({ row, key }) => {
        if (!unitKeysMatch(key, mappedKey)) return false
        if (!row.entrepreneurName) return true
        return sameEntrepreneur(row.entrepreneurName, target.name)
      })

      if (matched.length === 0) {
        if (stats.unmatchedCards.length < 20) {
          stats.unmatchedCards.push({ target: target.name, vendorCode: card.vendorCode, nmId: card.nmId, key: mappedKey.exact || mappedRaw })
        }
        continue
      }

      const price = prices.get(card.nmId)
      stats.matchedRows += matched.length
      targetReport.matchedRows += matched.length
      for (const match of matched) {
        const row = match.row
        const before = JSON.stringify(row)
        const shouldUseCardValues = !row.nmId || row.nmId === card.nmId || row.vendorCode === card.vendorCode
        if (shouldUseCardValues) {
          row.nmId = row.nmId || card.nmId
          row.vendorCode = row.vendorCode || card.vendorCode
          row.wbSubject = card.subject
          row.wbBrand = card.brand
          row.wbSyncedAt = now
          if (!row.category && card.subject) row.category = card.subject
          if (price && Number.isFinite(price.clubDiscountPct)) row.walletPct = price.clubDiscountPct
        }
        if (JSON.stringify(row) !== before) {
          row.updatedAt = now
          stats.updatedRows += 1
          targetReport.updatedRows += 1
        }
      }
    }
    stats.targetReports.push(targetReport)
  }

  return {
    store: await writeStore(rows, store.costs),
    stats,
  }
}

async function syncWbTariffs(store: UnitEconomicsStore, targets: WbTarget[], force = false) {
  const now = new Date().toISOString()
  const date = todayMoscowDate()
  const rows = store.rows.map((row) => normalizeRow(row))
  const stats = {
    type: 'tariffs',
    date,
    targets: targets.length,
    cacheHits: 0,
    commissionRows: 0,
    boxWarehouses: 0,
    returnWarehouses: 0,
    updatedRows: 0,
    targetReports: [] as Array<{
      name: string
      cacheHit: boolean
      commissionRows: number
      boxWarehouses: number
      returnWarehouses: number
      updatedRows: number
      status: 'ok' | 'error'
      warnings: string[]
    }>,
    errors: [] as string[],
  }

  for (const target of targets) {
    const report = {
      name: target.name,
      cacheHit: false,
      commissionRows: 0,
      boxWarehouses: 0,
      returnWarehouses: 0,
      updatedRows: 0,
      status: 'ok' as 'ok' | 'error',
      warnings: [] as string[],
    }

    let payload: WbTariffsPayload
    try {
      const result = await fetchWbTariffs(target, date, force)
      payload = result.payload
      report.cacheHit = result.cacheHit
      if (result.cacheHit) stats.cacheHits += 1
      report.commissionRows = payload.commissionReport.length
      report.boxWarehouses = payload.boxWarehouses.length
      report.returnWarehouses = payload.returnWarehouses.length
      stats.commissionRows += payload.commissionReport.length
      stats.boxWarehouses += payload.boxWarehouses.length
      stats.returnWarehouses += payload.returnWarehouses.length
    } catch (error) {
      const message = error instanceof Error ? error.message : `${target.name}: ошибка WB Tariffs API`
      report.status = 'error'
      report.warnings.push(message)
      stats.errors.push(message)
      stats.targetReports.push(report)
      continue
    }

    for (const row of rows) {
      if (!sameEntrepreneur(row.entrepreneurName, target.name)) continue
      const before = JSON.stringify(row)
      row.warehouse = logisticsWarehouseName(row.fulfillment)
      const commission = findCommission(row, payload.commissionReport)
      if (commission !== null) row.commissionPct = commission

      const delivery = calculateDeliveryFromBoxTariff(row, payload.boxWarehouses)
      if (delivery !== null) row.deliveryLogisticsRub = delivery

      const returnLogistics = calculateReturnFromTariff(row, payload.returnWarehouses)
      if (returnLogistics !== null) row.returnLogisticsRub = returnLogistics

      if (delivery !== null || returnLogistics !== null) row.logisticsTotalRub = calculateLogisticsTotal(row)

      if (JSON.stringify(row) !== before) {
        row.source = 'wb'
        row.updatedAt = now
        report.updatedRows += 1
        stats.updatedRows += 1
      }
    }
    stats.targetReports.push(report)
  }

  return {
    store: await writeStore(rows, store.costs),
    stats,
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthorizedUser(request)
  if (!user) return unauthorized()
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const store = await readStore()
  const targets = await getVercelWbTargets(user, 'all', { includeAdminAngelina: true })
  return jsonResponse(store, await buildUnitTariffOptions(targets))
}

export async function POST(request: NextRequest) {
  const user = await getAuthorizedUser(request)
  if (!user) return unauthorized()
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const contentType = request.headers.get('content-type') || ''
  const store = await readStore()

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'XLSX файл не найден' }, { status: 400 })
    }
    const { rows, costs } = await parseWorkbook(file)
    const nextStore = await writeStore(rows, costs.length ? costs : store.costs)
    return jsonResponse(nextStore)
  }

  const body = await request.json()
  if (body.action === 'delete') {
    const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : [String(body.id || '')])
    const nextStore = await writeStore(store.rows.filter((row) => !ids.has(row.id)))
    return jsonResponse(nextStore)
  }

  if (body.action === 'replace' && Array.isArray(body.rows)) {
    const nextStore = await writeStore(body.rows.map((row: Partial<UnitEconomicsRow>) => normalizeRow(row)), store.costs)
    return jsonResponse(nextStore)
  }

  if (body.action === 'save-cost') {
    const existingCosts = store.costs || seedCosts
    const existing = existingCosts.find((cost) => cost.id === body.cost?.id)
    const nextCost = normalizeCost({ ...(body.cost || {}), updatedAt: new Date().toISOString() }, existing)
    const costs = existing
      ? existingCosts.map((cost) => cost.id === existing.id ? nextCost : cost)
      : [nextCost, ...existingCosts]
    const nextStore = await writeStore(store.rows, costs)
    return jsonResponse(nextStore)
  }

  if (body.action === 'delete-cost') {
    const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : [String(body.id || '')])
    const nextStore = await writeStore(store.rows, (store.costs || seedCosts).filter((cost) => !ids.has(cost.id)))
    return jsonResponse(nextStore)
  }

  if (body.action === 'bulk-update' && Array.isArray(body.ids) && body.patch && typeof body.patch === 'object') {
    const ids = new Set(body.ids.map(String))
    const allowedKeys = new Set<keyof UnitEconomicsRow>([
      'avgDeliveryDays',
      'warehouse',
      'fixedWarehouseCoeff',
      'buyoutPct',
      'localizationIndex',
      'taxAcquiringPct',
      'drrPct',
      'minProfitRub',
      'sppPct',
      'walletPct',
    ])
    const rows = store.rows.map((row) => {
      if (!ids.has(row.id)) return row
      const patch = Object.entries(body.patch).reduce<Partial<UnitEconomicsRow>>((acc, [key, value]) => {
        if (!allowedKeys.has(key as keyof UnitEconomicsRow)) return acc
        ;(acc as Record<string, unknown>)[key] = value
        return acc
      }, {})
      return normalizeRow({ ...row, ...patch, updatedAt: new Date().toISOString() }, row)
    })
    const nextStore = await writeStore(rows, store.costs)
    return jsonResponse(nextStore)
  }

  if (body.action === 'sync-wb') {
    const targets = await getVercelWbTargets(user, 'all', { includeAdminAngelina: true })
    if (targets.length === 0) {
      return NextResponse.json({ error: 'WB API ключи не найдены' }, { status: 400 })
    }
    const { store: nextStore, stats } = await syncWithWb(store, targets)
    const costs = (nextStore.costs || seedCosts).map((cost) => normalizeCost(cost))
    const rows = nextStore.rows.map(calculateUnitEconomics)
    return NextResponse.json({
      store: {
        version: nextStore.version,
        updatedAt: nextStore.updatedAt,
        rows,
        costs,
        summary: summarizeUnitEconomics(rows),
        costSummary: summarizeUnitCosts(costs),
      },
      sync: stats,
    })
  }

  if (body.action === 'sync-wb-tariffs') {
    const targets = await getVercelWbTargets(user, 'all', { includeAdminAngelina: true })
    if (targets.length === 0) {
      return NextResponse.json({ error: 'WB API ключи не найдены' }, { status: 400 })
    }
    const { store: nextStore, stats } = await syncWbTariffs(store, targets, body.force === true)
    const costs = (nextStore.costs || seedCosts).map((cost) => normalizeCost(cost))
    const rows = nextStore.rows.map(calculateUnitEconomics)
    return NextResponse.json({
      store: {
        version: nextStore.version,
        updatedAt: nextStore.updatedAt,
        rows,
        costs,
        summary: summarizeUnitEconomics(rows),
        costSummary: summarizeUnitCosts(costs),
      },
      sync: stats,
    })
  }

  const existing = store.rows.find((row) => row.id === body.row?.id)
  const targets = await getVercelWbTargets(user, 'all', { includeAdminAngelina: true })
  const tariffOptions = await buildUnitTariffOptions(targets)
  const nextRowBase = normalizeRow(
    preserveWbManagedFields({ ...(body.row || {}), updatedAt: new Date().toISOString() }, existing),
    existing,
  )
  if (!nextRowBase.wbSubject) {
    return NextResponse.json({ error: 'Выберите WB категорию из списка тарифов' }, { status: 400 })
  }
  if (tariffOptions && !tariffOptions.categories.some((category) => category.subjectName === nextRowBase.wbSubject)) {
    return NextResponse.json({ error: 'WB категория должна быть выбрана из актуального списка WB' }, { status: 400 })
  }
  const nextRow = await applyAutomaticWbTariffs(nextRowBase, targets)
  const rows = existing
    ? store.rows.map((row) => row.id === existing.id ? nextRow : row)
    : [nextRow, ...store.rows]
  const nextStore = await writeStore(rows, store.costs)
  return jsonResponse(nextStore, tariffOptions)
}
