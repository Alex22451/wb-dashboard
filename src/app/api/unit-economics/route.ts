import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { redisCommand } from '@/lib/redis-cache'
import {
  calculateUnitEconomics,
  summarizeUnitEconomics,
  toNumber,
  type UnitEconomicsRow,
  type UnitEconomicsStore,
  type UnitFulfillment,
} from '@/lib/unit-economics'

const STORE_KEY = 'wb:unit-economics:v1'

async function readStore(): Promise<UnitEconomicsStore> {
  const raw = await redisCommand<string>(['GET', STORE_KEY])
  if (!raw) return { version: 1, updatedAt: new Date(0).toISOString(), rows: [] }
  try {
    const parsed = JSON.parse(raw) as UnitEconomicsStore
    return {
      version: 1,
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    }
  } catch {
    return { version: 1, updatedAt: new Date(0).toISOString(), rows: [] }
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
    updatedAt: now,
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

  const existing = store.rows.find((row) => row.id === body.row?.id)
  const nextRow = normalizeRow(body.row || {}, existing)
  const rows = existing
    ? store.rows.map((row) => row.id === existing.id ? nextRow : row)
    : [nextRow, ...store.rows]
  const nextStore = await writeStore(rows)
  return jsonResponse(nextStore)
}
