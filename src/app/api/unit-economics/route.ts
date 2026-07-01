import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { redisCommand } from '@/lib/redis-cache'
import seedRowsRaw from '@/data/unit-economics-seed.json'
import { getVercelWbTargets, type WbTarget } from '@/lib/user-store'
import { mapWbOrderToProductKey } from '@/lib/wb-mapping'
import {
  calculateUnitEconomics,
  normalizeUnitProductKey,
  summarizeUnitEconomics,
  toNumber,
  type UnitEconomicsRow,
  type UnitEconomicsStore,
  type UnitFulfillment,
} from '@/lib/unit-economics'

const STORE_KEY = 'wb:unit-economics:v1'
const CONTENT_CARDS_URL = 'https://content-api.wildberries.ru/content/v2/get/cards/list'
const PRICES_URL = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter'
const seedRows = seedRowsRaw as UnitEconomicsRow[]

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
}

function seedStore(): UnitEconomicsStore {
  return {
    version: 1,
    updatedAt: seedRows[0]?.updatedAt || new Date(0).toISOString(),
    rows: seedRows.map((row) => normalizeRow(row)),
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
      rows: parsed.rows,
    }
  } catch {
    return seedStore()
  }
}

async function writeStore(rows: UnitEconomicsRow[]): Promise<UnitEconomicsStore> {
  const store: UnitEconomicsStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rows,
  }
  const result = await redisCommand<string>(['SET', STORE_KEY, JSON.stringify(store)])
  if (!result) throw new Error('Redis store is not available')
  return store
}

function jsonResponse(store: UnitEconomicsStore) {
  const rows = store.rows.map(calculateUnitEconomics)
  return NextResponse.json({
    store: {
      version: store.version,
      updatedAt: store.updatedAt,
      rows,
      summary: summarizeUnitEconomics(rows),
    },
  })
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

async function parseWorkbookRows(file: File): Promise<UnitEconomicsRow[]> {
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

  return [
    ...readSheet('Юнитка 2.0 ФБС', 'fbs'),
    ...readSheet('Юнитка 2.0 ФБО', 'fbo'),
  ]
}

function normalizeApiKey(apiKey: string) {
  return apiKey.trim().replace(/^bearer\s+/i, '').trim()
}

function numberFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(record[key])
    if (value > 0) return value
  }
  return 0
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
      prices.set(nmId, {
        priceBeforeDiscountRub: price,
        discountPct: Math.abs(discount) > 1 ? discount / 100 : discount,
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

async function syncWithWb(store: UnitEconomicsStore, targets: WbTarget[]) {
  const now = new Date().toISOString()
  const rows = store.rows.map((row) => normalizeRow(row))
  const rowKeys = rows.map((row) => ({
    row,
    key: normalizeUnitProductKey(row.excelProductKey || row.productName),
  }))
  const stats = {
    targets: targets.length,
    cards: 0,
    prices: 0,
    matchedRows: 0,
    updatedRows: 0,
    unmatchedCards: [] as Array<{ target: string; vendorCode: string; nmId: number; key: string }>,
    errors: [] as string[],
  }

  for (const target of targets) {
    try {
      const [cards, prices] = await Promise.all([
        fetchWbCards(target),
        fetchWbPrices(target),
      ])
      stats.cards += cards.length
      stats.prices += prices.size

      for (const card of cards) {
        const mappedKey = normalizeUnitProductKey(mapWbOrderToProductKey(card.subject, card.vendorCode, card.brand) || '')
        if (!mappedKey) continue
        const matched = rowKeys.filter(({ row, key }) => {
          if (key !== mappedKey) return false
          if (!row.entrepreneurName) return true
          return sameEntrepreneur(row.entrepreneurName, target.name)
        })

        if (matched.length === 0) {
          if (stats.unmatchedCards.length < 20) {
            stats.unmatchedCards.push({ target: target.name, vendorCode: card.vendorCode, nmId: card.nmId, key: mappedKey })
          }
          continue
        }

        const price = prices.get(card.nmId)
        stats.matchedRows += matched.length
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
            if (price?.priceBeforeDiscountRub) row.priceBeforeDiscountRub = price.priceBeforeDiscountRub
            if (price && Number.isFinite(price.discountPct)) row.discountPct = price.discountPct
          }
          if (JSON.stringify(row) !== before) {
            row.updatedAt = now
            stats.updatedRows += 1
          }
        }
      }
    } catch (error) {
      stats.errors.push(error instanceof Error ? error.message : `${target.name}: ошибка WB API`)
    }
  }

  return {
    store: await writeStore(rows),
    stats,
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const store = await readStore()
  return jsonResponse(store)
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
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
    const rows = await parseWorkbookRows(file)
    const nextStore = await writeStore(rows)
    return jsonResponse(nextStore)
  }

  const body = await request.json()
  if (body.action === 'delete') {
    const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : [String(body.id || '')])
    const nextStore = await writeStore(store.rows.filter((row) => !ids.has(row.id)))
    return jsonResponse(nextStore)
  }

  if (body.action === 'replace' && Array.isArray(body.rows)) {
    const nextStore = await writeStore(body.rows.map((row: Partial<UnitEconomicsRow>) => normalizeRow(row)))
    return jsonResponse(nextStore)
  }

  if (body.action === 'sync-wb') {
    const targets = await getVercelWbTargets(user, 'all', { includeAdminAngelina: true })
    if (targets.length === 0) {
      return NextResponse.json({ error: 'WB API ключи не найдены' }, { status: 400 })
    }
    const { store: nextStore, stats } = await syncWithWb(store, targets)
    const rows = nextStore.rows.map(calculateUnitEconomics)
    return NextResponse.json({
      store: {
        version: nextStore.version,
        updatedAt: nextStore.updatedAt,
        rows,
        summary: summarizeUnitEconomics(rows),
      },
      sync: stats,
    })
  }

  const existing = store.rows.find((row) => row.id === body.row?.id)
  const nextRow = normalizeRow({ ...(body.row || {}), updatedAt: new Date().toISOString() }, existing)
  const rows = existing
    ? store.rows.map((row) => row.id === existing.id ? nextRow : row)
    : [nextRow, ...store.rows]
  const nextStore = await writeStore(rows)
  return jsonResponse(nextStore)
}
