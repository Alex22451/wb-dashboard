import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { getEntrepreneurs, isVercel } from '@/lib/entrepreneurs-config'
import { getVercelWbTargets } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import {
  mapWbOrderToProductKey,
  filterToDateRange,
  EXCLUDED_WB_SUBJECTS,
  extractItemsMultiplier,
} from '@/lib/wb-mapping'

// ─── In-memory cache ────────────────────────────────────────────────
// Caches WB API responses to avoid hitting the API on every request
// TTL: 5 minutes for dashboard, 2 minutes for daily, 10 minutes for monthly
interface CacheEntry {
  data: any
  timestamp: number
  ttl: number
}

const apiCache = new Map<string, CacheEntry>()
const inFlightRequests = new Map<string, Promise<any>>()

function apiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(normalizeApiKey(apiKey)).digest('hex').slice(0, 16)
}

function getCacheKey(entId: number, apiKey: string, dateFrom: string, dateTo: string): string {
  return `${entId}:${apiKeyFingerprint(apiKey)}:orders-v11:${dateFrom}:${dateTo}`
}

function getStockCacheKey(entId: number, apiKey: string, stockDate: string): string {
  return `${entId}:${apiKeyFingerprint(apiKey)}:stocks:${stockDate}`
}

function getCached(key: string): any | null {
  const entry = apiCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    apiCache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any, ttlMs: number): void {
  apiCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs })
  // Prune old entries
  if (apiCache.size > 200) {
    const now = Date.now()
    for (const [k, v] of apiCache) {
      if (now - v.timestamp > v.ttl) apiCache.delete(k)
    }
  }
}

async function cachedRequest<T>(key: string, ttlMs: number, loader: () => Promise<T>, cacheErrors = false): Promise<T> {
  const cached = getCached(key)
  if (cached) return cached

  const inFlight = inFlightRequests.get(key)
  if (inFlight) return inFlight

  const promise = loader()
    .then((result: any) => {
      const ttl = result?.error ? CACHE_TTL_RATE_LIMIT : ttlMs
      if (cacheErrors || !result?.error) setCache(key, result, ttl)
      return result
    })
    .finally(() => {
      inFlightRequests.delete(key)
    })

  inFlightRequests.set(key, promise)
  return promise
}

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

async function redisCommand<T = unknown>(command: unknown[]): Promise<T | null> {
  const config = getRedisConfig()
  if (!config) return null

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const json = await response.json()
    if (json.error) return null
    return json.result as T
  } catch {
    return null
  }
}

function redisDailyKey(apiKey: string, date: string) {
  return `wb:daily:v1:${apiKeyFingerprint(apiKey)}:${date}`
}

function redisDailyTtlSeconds(date: string) {
  const mskNow = new Date(Date.now() + 3 * 3600000)
  const today = mskNow.toISOString().split('T')[0]
  const yesterday = new Date(mskNow.getTime() - 86400000).toISOString().split('T')[0]
  if (date >= today) return 15 * 60
  if (date === yesterday) return 24 * 60 * 60
  return 180 * 24 * 60 * 60
}

async function readRedisDailyResult(apiKey: string, date: string): Promise<{ orders: any[]; fulfillmentOrders: any[] } | null> {
  const raw = await redisCommand<string>(['GET', redisDailyKey(apiKey, date)])
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.fulfillmentOrders)) return null
    return {
      orders: parsed.orders,
      fulfillmentOrders: parsed.fulfillmentOrders,
    }
  } catch {
    return null
  }
}

async function writeRedisDailyResult(apiKey: string, date: string, data: { orders: any[]; fulfillmentOrders: any[] }) {
  await redisCommand([
    'SET',
    redisDailyKey(apiKey, date),
    JSON.stringify({
      date,
      fetchedAt: new Date().toISOString(),
      source: 'wb-daily-funnel-v1',
      complete: true,
      orders: data.orders,
      fulfillmentOrders: data.fulfillmentOrders,
    }),
    'EX',
    redisDailyTtlSeconds(date),
  ])
}

const CACHE_TTL_DASHBOARD = 5 * 60 * 1000   // 5 min
const CACHE_TTL_DAILY = 2 * 60 * 1000       // 2 min
const CACHE_TTL_MONTHLY = 10 * 60 * 1000    // 10 min
const CACHE_TTL_STOCKS = 15 * 60 * 1000     // 15 min
const CACHE_TTL_RATE_LIMIT = 60 * 1000      // WB orders/statistics limit is 1 request/min per seller account
const AD_API_BASE = 'https://advert-api.wildberries.ru'
const FUNNEL_PRODUCTS_URL = 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products'
const FUNNEL_PRODUCTS_HISTORY_URL = 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products/history'
const FUNNEL_REQUEST_INTERVAL_MS = 21000
const FUNNEL_PRODUCTS_PAGE_LIMIT = 1000

// Derived from upload/Отчет ВБ ежедневный (1) (1).xlsx, sheet "ОБЩИЙ ОТЧЕТ":
// 7-day rolling product peaks across the available 2024-2026 history.
const PRODUCTION_SEASONAL_PEAKS = [
  { product: 'салфетки', peakMonthDay: '04-11', avg: 92.5, peakAvg: 1095.7, uplift: 11.8 },
  { product: 'салфетки с вышивкой', peakMonthDay: '04-04', avg: 2.5, peakAvg: 66.1, uplift: 26.6 },
  { product: 'дорожки', peakMonthDay: '04-04', avg: 30.6, peakAvg: 243, uplift: 7.9 },
  { product: 'флаги', peakMonthDay: '05-02', avg: 35.9, peakAvg: 209.3, uplift: 5.8 },
  { product: 'Сумки пляжные', peakMonthDay: '04-14', avg: 2, peakAvg: 15.7, uplift: 7.7 },
  { product: 'Пляжные коврики', peakMonthDay: '07-08', avg: 6.4, peakAvg: 31, uplift: 4.8 },
  { product: 'Мешки для обуви', peakMonthDay: '08-29', avg: 113.8, peakAvg: 737.4, uplift: 6.5 },
  { product: 'чехол для обуви', peakMonthDay: '08-30', avg: 52.8, peakAvg: 294.4, uplift: 5.6 },
  { product: 'Сумки хозяйственные (Шоппер)', peakMonthDay: '08-29', avg: 41.3, peakAvg: 111, uplift: 2.7 },
  { product: 'Чехлы на Чемодан', peakMonthDay: '10-23', avg: 35.7, peakAvg: 86.3, uplift: 2.4 },
  { product: 'Наволочка декоративная 2 шт 45*45', peakMonthDay: '11-22', avg: 65.8, peakAvg: 329.1, uplift: 5 },
  { product: 'набор', peakMonthDay: '12-06', avg: 8.5, peakAvg: 59.6, uplift: 7 },
  { product: 'Подушка декоративная 90*30', peakMonthDay: '12-08', avg: 33.8, peakAvg: 99.6, uplift: 2.9 },
  { product: 'Подушка декоративная 60*20', peakMonthDay: '12-09', avg: 54.4, peakAvg: 134.6, uplift: 2.5 },
  { product: 'Подушка декоративная 150*50', peakMonthDay: '12-16', avg: 184.8, peakAvg: 526.4, uplift: 2.8 },
  { product: 'Подушка декоративная 120*40', peakMonthDay: '12-16', avg: 32.8, peakAvg: 82.7, uplift: 2.5 },
  { product: 'Маски', peakMonthDay: '12-17', avg: 44.5, peakAvg: 189.6, uplift: 4.3 },
  { product: 'Подушка декоративная 45*45', peakMonthDay: '12-19', avg: 86.6, peakAvg: 282.6, uplift: 3.3 },
  { product: 'Наволочки декоративные 2 шт 40*40', peakMonthDay: '12-19', avg: 82.7, peakAvg: 404, uplift: 4.9 },
  { product: 'Наволочка декоративная 2 шт 50*50', peakMonthDay: '12-20', avg: 18.3, peakAvg: 160, uplift: 8.7 },
  { product: 'Наволочка декоративная 150*50', peakMonthDay: '12-20', avg: 106.7, peakAvg: 249.7, uplift: 2.3 },
  { product: 'Наволочка декоративная 90*30', peakMonthDay: '12-21', avg: 6.6, peakAvg: 29.9, uplift: 4.5 },
  { product: 'Подушка декоративная 50*50', peakMonthDay: '12-22', avg: 3.1, peakAvg: 30.1, uplift: 9.7 },
  { product: 'Наволочка декоративная 120*40', peakMonthDay: '12-22', avg: 8.9, peakAvg: 27.1, uplift: 3.1 },
  { product: 'Кольца для салфеток', peakMonthDay: '12-23', avg: 9.2, peakAvg: 126.7, uplift: 13.7 },
  { product: 'Подушка декоративная 40*40', peakMonthDay: '02-12', avg: 71.8, peakAvg: 254.4, uplift: 3.5 },
  { product: 'Подушка декоративная 30*40', peakMonthDay: '02-13', avg: 27.5, peakAvg: 185.1, uplift: 6.7 },
  { product: 'Шевроны', peakMonthDay: '02-19', avg: 20.7, peakAvg: 113.1, uplift: 5.5 },
  { product: 'Коврики для мыши', peakMonthDay: '02-20', avg: 13.6, peakAvg: 49, uplift: 3.6 },
  { product: 'Подушка декоративная 35*35', peakMonthDay: '03-01', avg: 14.6, peakAvg: 36.3, uplift: 2.5 },
]

function dateDiffDays(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.round((end - start) / 86400000)
}

function isSortCenterWarehouse(warehouseName: string): boolean {
  return /\bсц\b/i.test(warehouseName)
}

function distributeSupplyQty<T extends { recommendedQtyRaw: number }>(
  rows: T[],
  supplyQty: number
): Array<T & { recommendedQty: number }> {
  if (supplyQty <= 0 || rows.length === 0) return []

  const totalRaw = rows.reduce((sum, row) => sum + row.recommendedQtyRaw, 0)
  if (totalRaw <= 0) return []

  const distributed = rows.map((row) => {
    const exact = (row.recommendedQtyRaw / totalRaw) * supplyQty
    const floor = Math.floor(exact)
    return { ...row, recommendedQty: floor, remainder: exact - floor }
  })

  let remaining = supplyQty - distributed.reduce((sum, row) => sum + row.recommendedQty, 0)
  distributed
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((row) => {
      if (remaining <= 0) return
      row.recommendedQty += 1
      remaining -= 1
    })

  return distributed
    .filter((row) => row.recommendedQty > 0)
    .sort((a, b) => b.recommendedQty - a.recommendedQty)
    .map((row) => {
      const { remainder: _remainder, ...cleanRow } = row
      return cleanRow as T & { recommendedQty: number }
    })
}

function getOrderRevenue(order: any): number {
  return Number(order.finishedPrice)
    || Number(order.priceWithDisc)
    || Number(order.totalPrice)
    || Number(order.forPay)
    || 0
}

function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^bearer\s+/i, '').trim()
}

function wbAuthHeader(apiKey: string): string {
  return normalizeApiKey(apiKey)
}

function getDirectProductName(order: any): string {
  const article = String(order.supplierArticle || '').trim()
  const subject = String(order.subject || '').trim()
  const brand = String(order.brand || '').trim()
  const nmId = order.nmId ? String(order.nmId) : ''

  if (article && subject) return `${article} · ${subject}`
  if (article) return article
  if (subject && brand) return `${subject} · ${brand}`
  if (subject) return subject
  if (nmId) return `nmId ${nmId}`
  return 'Товар без артикула'
}

function getDateRange(from: string, to: string, maxDays = 120): string[] {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end && dates.length < maxDays) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function isReturnSale(record: any): boolean {
  const saleId = String(record.saleID || record.saleId || '')
  return saleId.startsWith('R')
    || Number(record.finishedPrice) < 0
    || Number(record.priceWithDisc) < 0
    || Number(record.forPay) < 0
}

function saleReturnToOrder(record: any): any {
  return {
    ...record,
    isReturn: true,
    isCancel: false,
    odid: `return:${record.saleID || record.srid || record.gNumber || `${record.supplierArticle || ''}:${record.nmId || ''}:${record.date || ''}`}`,
  }
}

async function fetchFunnelProducts(apiKey: string, from: string, to: string): Promise<{ products: any[]; error?: string }> {
  const cacheKey = `funnel-products-positive-v2:${apiKeyFingerprint(apiKey)}:${from}:${to}`
  return cachedRequest(cacheKey, CACHE_TTL_DAILY, async () => {
    const allProducts: any[] = []
    let offset = 0
    const limit = FUNNEL_PRODUCTS_PAGE_LIMIT

    while (offset < 250000) {
      const response = await fetch(FUNNEL_PRODUCTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalizeApiKey(apiKey)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedPeriod: { start: from, end: to },
          nmIds: [],
          brandNames: [],
          subjectIds: [],
          tagIds: [],
          skipDeletedNm: false,
          orderBy: { field: 'orderCount', mode: 'desc' },
          limit,
          offset,
        }),
        signal: AbortSignal.timeout(45000),
      })

      if (response.status === 429 || response.status === 461) {
        return { products: allProducts, error: 'WB Analytics API ограничил загрузку воронки продаж. Подождите минуту и повторите.' }
      }
      if (response.status === 401 || response.status === 403) {
        return { products: allProducts, error: `Нет доступа к воронке продаж (${response.status})` }
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        return { products: allProducts, error: `Ошибка воронки продаж (${response.status}): ${body.detail || body.title || body.message || 'неизвестная ошибка'}` }
      }

      const data = await response.json()
      const products = data?.data?.products || []
      const positiveProducts = products.filter((product: any) => {
        return (Number(product?.statistic?.selected?.orderCount) || 0) > 0
      })
      allProducts.push(...positiveProducts)
      if (products.length < limit) break
      if (positiveProducts.length < products.length) break
      offset += limit
      await new Promise(resolve => setTimeout(resolve, FUNNEL_REQUEST_INTERVAL_MS))
    }

    return { products: allProducts }
  })
}

function addFunnelProductOrders(orders: any[], product: any, count: number, date: string) {
  if (count <= 0) return
  const item = product.product || {}
  for (let i = 0; i < count; i++) {
    orders.push({
      date: `${date}T12:00:00`,
      lastChangeDate: `${date}T12:00:00`,
      supplierArticle: item.vendorCode || '',
      nmId: item.nmId || 0,
      subject: item.subjectName || '',
      brand: item.brandName || '',
      techSize: '',
      warehouseType: '',
      finishedPrice: 0,
      priceWithDisc: 0,
      totalPrice: 0,
      forPay: 0,
      odid: `funnel:${item.nmId || item.vendorCode || 'unknown'}:${date}:${i}`,
      isFunnelOrder: true,
    })
  }
}

async function fetchFunnelProductOrders(apiKey: string, from: string, to: string): Promise<{ orders: any[]; error?: string }> {
  const result = await fetchFunnelProducts(apiKey, from, to)
  const orders: any[] = []

  for (const product of result.products) {
    addFunnelProductOrders(orders, product, Number(product?.statistic?.selected?.orderCount) || 0, to)
  }

  return { orders, error: result.error }
}

async function fetchFunnelProductOrdersByDate(apiKey: string, dates: string[]): Promise<{ orders: any[]; error?: string }> {
  const orders: any[] = []
  const errors: string[] = []

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    const result = await fetchFunnelProductOrders(apiKey, date, date)
    if (result.orders.length > 0) orders.push(...result.orders)
    if (result.error) errors.push(result.error)
    if (i < dates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, FUNNEL_REQUEST_INTERVAL_MS))
    }
  }

  return {
    orders,
    error: errors.slice(0, 3).join('; ') || undefined,
  }
}

async function fetchFunnelHistoryOrders(apiKey: string, from: string, to: string): Promise<{ orders: any[]; error?: string }> {
  const productsResult = await fetchFunnelProducts(apiKey, from, to)
  const nmIds = [...new Set(
    productsResult.products
      .map(product => Number(product?.product?.nmId) || 0)
      .filter(Boolean)
  )]
  if (nmIds.length === 0) return { orders: [], error: productsResult.error }

  const productByNmId = new Map<number, any>()
  for (const product of productsResult.products) {
    const nmId = Number(product?.product?.nmId) || 0
    if (nmId && !productByNmId.has(nmId)) productByNmId.set(nmId, product)
  }

  const orders: any[] = []
  const errors: string[] = []
  const chunkSize = 20

  for (let offset = 0; offset < nmIds.length; offset += chunkSize) {
    const chunk = nmIds.slice(offset, offset + chunkSize)
    const response = await fetch(FUNNEL_PRODUCTS_HISTORY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizeApiKey(apiKey)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedPeriod: { start: from, end: to },
        nmIds: chunk,
        skipDeletedNm: false,
        aggregationLevel: 'day',
      }),
      signal: AbortSignal.timeout(45000),
    })

    if (response.status === 429 || response.status === 461) {
      errors.push('WB Analytics API ограничил загрузку истории воронки. Подождите минуту и повторите.')
      break
    }
    if (response.status === 401 || response.status === 403) {
      errors.push(`Нет доступа к истории воронки продаж (${response.status})`)
      break
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      errors.push(`Ошибка истории воронки (${response.status}): ${body.detail || body.title || body.message || 'неизвестная ошибка'}`)
      break
    }

    const rows = await response.json()
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const nmId = Number(row?.product?.nmId) || 0
        const product = productByNmId.get(nmId) || row
        for (const day of row?.history || []) {
          const count = Number(day?.orderCount) || 0
          const date = String(day?.date || '').slice(0, 10)
          if (date >= from && date <= to) addFunnelProductOrders(orders, product, count, date)
        }
      }
    }

    if (offset + chunkSize < nmIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
  }

  return {
    orders,
    error: [...(productsResult.error ? [productsResult.error] : []), ...errors].slice(0, 3).join('; ') || undefined,
  }
}

async function fetchFunnelDailyOrders(apiKey: string, from: string, to: string): Promise<{ orders: any[]; error?: string }> {
  const dates = getDateRange(from, to)
  if (dates.length === 0) return { orders: [], error: 'Некорректный период для воронки продаж' }
  if (dates.length === 1) return fetchFunnelProductOrders(apiKey, from, to)

  return fetchFunnelProductOrdersByDate(apiKey, dates)
}

async function fetchAdSpend(apiKey: string, from: string, to: string): Promise<number> {
  const url = `${AD_API_BASE}/adv/v1/upd?from=${from}&to=${to}`
  const response = await fetch(url, {
    headers: { Authorization: wbAuthHeader(apiKey) },
    signal: AbortSignal.timeout(20000),
  })
  if (response.status === 204) return 0
  if (!response.ok) return 0
  const data = await response.json()
  if (!Array.isArray(data)) return 0
  return data.reduce((sum, row) => sum + (Number(row.updSum) || 0), 0)
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const { searchParams } = request.nextUrl
    const entrepreneurId = searchParams.get('entrepreneurId') || 'all'
    const section = searchParams.get('section') || '' // 'dashboard' | 'daily' | 'monthly' | 'production' | '' (all)

    // Calculate date range based on section
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    let defaultDateFrom: string

    if (section === 'dashboard') {
      const twoMonthsAgo = new Date(nowMsk.getTime() - 60 * 86400000)
      defaultDateFrom = twoMonthsAgo.toISOString().split('T')[0]
    } else if (section === 'monthly') {
      const thirteenMonthsAgo = new Date(nowMsk)
      thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)
      thirteenMonthsAgo.setDate(1)
      defaultDateFrom = thirteenMonthsAgo.toISOString().split('T')[0]
    } else if (section === 'daily') {
      const threeDaysAgo = new Date(nowMsk.getTime() - 3 * 86400000)
      defaultDateFrom = threeDaysAgo.toISOString().split('T')[0]
    } else if (section === 'production') {
      const thirtyOneDaysAgo = new Date(nowMsk.getTime() - 31 * 86400000)
      defaultDateFrom = thirtyOneDaysAgo.toISOString().split('T')[0]
    } else if (section === 'supply') {
      const thirtyDaysAgo = new Date(nowMsk.getTime() - 30 * 86400000)
      defaultDateFrom = thirtyDaysAgo.toISOString().split('T')[0]
    } else {
      const threeMonthsAgo = new Date(nowMsk.getTime() - 90 * 86400000)
      defaultDateFrom = threeMonthsAgo.toISOString().split('T')[0]
    }

    const requestedDateFrom = searchParams.get('dateFrom') || defaultDateFrom
    const requestedDateTo = searchParams.get('dateTo') || new Date().toISOString().split('T')[0]
    const useExactSingleDayStats = requestedDateFrom === requestedDateTo
    let dateFrom = requestedDateFrom
    const dateTo = requestedDateTo
    if (section === 'production') {
      const fromMs = new Date(`${requestedDateFrom}T00:00:00`).getTime()
      const toMs = new Date(`${requestedDateTo}T00:00:00`).getTime()
      if (!Number.isNaN(fromMs) && !Number.isNaN(toMs) && toMs >= fromMs) {
        const periodDays = Math.ceil((toMs - fromMs) / 86400000) + 1
        const extendedFrom = new Date(fromMs)
        extendedFrom.setDate(extendedFrom.getDate() - periodDays)
        dateFrom = extendedFrom.toISOString().split('T')[0]
      }
    }

    // WB API `dateFrom` parameter filters by `lastChangeDate`, not by order `date`.
    // To avoid missing orders that were created in our range but last changed earlier,
    // we add a 2-day buffer to the API request and filter client-side by actual order date.
    const apiDateFrom = (() => {
      const d = new Date(dateFrom)
      d.setDate(d.getDate() - 2)
      return d.toISOString().split('T')[0]
    })()

    let targets: Array<{ id: number; name: string; wbApiKey: string }>

    if (isVercel()) {
      targets = await getVercelWbTargets(user, entrepreneurId)
    } else {
      // Get entrepreneurs with API keys
      const userScope = user.role === 'admin' ? '' : `AND userId = ${user.id}`
      const entResult = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string }>>(
        `SELECT id, name, wbApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL AND wbApiKey != '' ${userScope}`
      )

      if (entrepreneurId === 'all') {
        targets = entResult
      } else if (entrepreneurId.includes(',')) {
        const entIds = new Set(
          entrepreneurId
            .split(',')
            .map((id) => Number(id.trim()))
            .filter((id) => Number.isFinite(id))
        )
        targets = entResult.filter(e => entIds.has(e.id))
      } else {
        const entId = Number(entrepreneurId)
        targets = entResult.filter(e => e.id === entId)
      }
    }

    if (targets.length === 0) {
      return NextResponse.json({
        dashboard: {
          totalOrders: 0, yesterdayOrders: 0, dayBeforeYesterdayOrders: 0,
          yesterdayDate: null, monthOrders: 0, prevMonthOrders: 0, latestDate: null,
          dayChange: null, monthChange: null,
          yesterdayFbsOrders: 0, yesterdayFboOrders: 0,
          dayBeforeYesterdayFbsOrders: 0, dayBeforeYesterdayFboOrders: 0,
          entrepreneurStats: [], weekEntrepreneurStats: [],
          weekTotalOrders: 0, weekDateFrom: null, weekDateTo: null,
          productCount: 0,
        },
        daily: { dates: [], products: [], pivot: {}, dateTotals: [], productTotals: {}, fbsPivot: {}, fbsDateTotals: [], fbsProductTotals: {}, fboPivot: {}, fboDateTotals: [], fboProductTotals: {} },
        monthly: { entrepreneurs: [], products: [], months: [], monthlyData: {}, productMonthlyData: {}, monthStats: [], entrepreneurMonthly: {}, productDynamics: { growth: [], decline: [] }, seasonality: [] },
        rateLimitErrors: [],
      })
    }

    const mappedAdminApiKeys = new Set(
      getEntrepreneurs()
        .map((ent) => normalizeApiKey(ent.apiKey || ''))
        .filter(Boolean)
    )
    const shouldUseExcelMapping = (apiKey: string) => mappedAdminApiKeys.has(normalizeApiKey(apiKey))

    // Determine cache TTL based on section
    const CACHE_TTL_PRODUCTION = 2 * 60 * 1000  // 2 min
    const CACHE_TTL_SUPPLY = 2 * 60 * 1000  // 2 min
    const cacheTtl = section === 'dashboard' ? CACHE_TTL_DASHBOARD
      : section === 'daily' ? CACHE_TTL_DAILY
      : section === 'monthly' ? CACHE_TTL_MONTHLY
      : section === 'production' ? CACHE_TTL_PRODUCTION
      : section === 'supply' ? CACHE_TTL_SUPPLY
      : CACHE_TTL_DASHBOARD
    const needDashboard = !section || section === 'dashboard'
    const needDaily = !section || section === 'daily'
    const needMonthly = !section || section === 'monthly'
    const needProduction = !section || section === 'production'
    const needSupply = !section || section === 'supply'
    const shouldUseFunnelOrders = !needProduction && !needSupply && (
      needDaily || (useExactSingleDayStats && (needDashboard || needMonthly))
    )

    // Fetch each entrepreneur independently. WB limits are per seller cabinet, so
    // parallelizing different API keys avoids the admin "all IP" waterfall.
    const results: Array<{
      entrepreneurId: number
      entrepreneurName: string
      orders: any[]
      fulfillmentOrders?: any[]
      returns: any[]
      error?: string
      returnError?: string
    }> = await Promise.all(targets.map(async (ent) => {
      const cacheKey = getCacheKey(ent.id, ent.wbApiKey, apiDateFrom, dateTo)

      return cachedRequest(cacheKey, cacheTtl, async () => {
        const apiHeaders = { 'Authorization': wbAuthHeader(ent.wbApiKey), 'Content-Type': 'application/json' }
        let orders: any[] = []
        let fulfillmentOrders: any[] = []
        let returns: any[] = []
        let error: string | undefined
        let returnError: string | undefined

        if (shouldUseFunnelOrders) {
          if (needDaily && useExactSingleDayStats) {
            const redisDaily = await readRedisDailyResult(ent.wbApiKey, requestedDateFrom)
            if (redisDaily) {
              return {
                entrepreneurId: ent.id,
                entrepreneurName: ent.name,
                orders: redisDaily.orders,
                fulfillmentOrders: redisDaily.fulfillmentOrders,
                returns: [],
                error: undefined,
                returnError: undefined,
              }
            }
          }

          const funnel = needDaily
            ? await fetchFunnelDailyOrders(ent.wbApiKey, dateFrom, dateTo)
            : await fetchFunnelProductOrders(ent.wbApiKey, requestedDateFrom, requestedDateTo)

          if (needDaily) {
            try {
              const ordersUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${requestedDateFrom}&flag=1`
              const response = await fetch(ordersUrl, { headers: apiHeaders, signal: AbortSignal.timeout(30000) })
              if (response.status === 429 || response.status === 461) {
                returnError = 'WB API ограничил загрузку FBO/FBS. Подождите минуту и повторите.'
              } else if (response.status === 401) {
                returnError = 'Неверный API ключ для загрузки FBO/FBS (401)'
              } else if (response.ok) {
                const allOrders = await response.json()
                if (Array.isArray(allOrders)) fulfillmentOrders = filterToDateRange(allOrders, requestedDateFrom, requestedDateTo)
              } else {
                returnError = `Ошибка API FBO/FBS (${response.status})`
              }
            } catch (_e) {
              returnError = 'Ошибка сети при загрузке FBO/FBS'
            }
          }

          if (needDaily && useExactSingleDayStats && !funnel.error && !returnError) {
            await writeRedisDailyResult(ent.wbApiKey, requestedDateFrom, {
              orders: funnel.orders,
              fulfillmentOrders,
            })
          }

          return {
            entrepreneurId: ent.id,
            entrepreneurName: ent.name,
            orders: funnel.orders,
            fulfillmentOrders,
            returns: [],
            error: funnel.error,
            returnError,
          }
        }

        try {
          // flag=0 returns the complete dataset filtered by lastChangeDate (not order date).
          // We use flag=0 instead of flag=1 because flag=1 returns a tiny broken subset.
          // We do NOT filter out isCancel because Excel "Воронка продаж" counts ALL orders
          // including cancelled ones. Matching Excel requires keeping cancelled orders.
          // NOTE: WB API dateFrom filters by lastChangeDate, not order date.
          // We add a 2-day buffer and filter client-side by actual order date.
          const ordersUrl = useExactSingleDayStats
            ? `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${requestedDateFrom}&flag=1`
            : `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${apiDateFrom}&flag=0`
          const response = await fetch(ordersUrl, { headers: apiHeaders, signal: AbortSignal.timeout(30000) })

          if (response.status === 429 || response.status === 461) {
            console.log(`WB API rate limited for ${ent.name}, skipping (429)`)
            error = 'WB API разрешает только 1 запрос в минуту к заказам. Подождите минуту и повторите.'
          } else if (response.status === 401) {
            console.log(`WB API unauthorized for ${ent.name} (401)`)
            error = 'Неверный API ключ (401)'
          } else if (response.ok) {
            const allOrders = await response.json()
            if (Array.isArray(allOrders)) {
              orders = useExactSingleDayStats
                ? allOrders
                : filterToDateRange(allOrders, dateFrom, dateTo)
            }
          } else {
            console.log(`WB API error for ${ent.name}: ${response.status}`)
            error = `Ошибка API (${response.status})`
          }
        } catch (_e) {
          console.log(`WB API network error for ${ent.name}`)
          error = 'Ошибка сети'
        }

        try {
          const salesUrl = useExactSingleDayStats
            ? `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${requestedDateFrom}&flag=1`
            : `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${apiDateFrom}&flag=0`
          const salesResponse = await fetch(salesUrl, { headers: apiHeaders, signal: AbortSignal.timeout(30000) })

          if (salesResponse.status === 429 || salesResponse.status === 461) {
            console.log(`WB Sales API rate limited for ${ent.name}, returns skipped`)
            returnError = 'WB API ограничил загрузку возвратов. Подождите минуту и повторите.'
          } else if (salesResponse.status === 401) {
            console.log(`WB Sales API unauthorized for ${ent.name} (401)`)
            returnError = 'Неверный API ключ для загрузки возвратов (401)'
          } else if (salesResponse.ok) {
            const allSales = await salesResponse.json()
            if (Array.isArray(allSales)) {
              returns = (useExactSingleDayStats ? allSales : filterToDateRange(allSales, dateFrom, dateTo))
                .filter(isReturnSale)
                .map(saleReturnToOrder)
            }
          } else {
            console.log(`WB Sales API error for ${ent.name}: ${salesResponse.status}`)
            returnError = `Ошибка API возвратов (${salesResponse.status})`
          }
        } catch (_e) {
          console.log(`WB Sales API network error for ${ent.name}`)
          returnError = 'Ошибка сети при загрузке возвратов'
        }

        return {
          entrepreneurId: ent.id,
          entrepreneurName: ent.name,
          orders: [...orders, ...returns],
          fulfillmentOrders: orders,
          returns,
          error,
          returnError,
        }
      }, !shouldUseFunnelOrders)
    }))

    // Collect all successful results with mapped types
    // warehouseType: "Склад продавца" = FBS, "Склад WB" = FBO
    const allMappedOrders: Array<{
      entrepreneurId: number
      entrepreneurName: string
      order: any
      mappedType: string
      dateStr: string
      monthStr: string
      isFbs: boolean
    }> = []
    const allFulfillmentMappedOrders: typeof allMappedOrders = []

    for (const result of results) {
      const { entrepreneurId, entrepreneurName, orders, fulfillmentOrders = [] } = result
      const target = targets.find((ent) => ent.id === entrepreneurId)
      const useExcelMapping = target ? shouldUseExcelMapping(target.wbApiKey) : false

      const mapOrders = (sourceOrders: any[], targetRows: typeof allMappedOrders) => {
      for (const order of sourceOrders) {
        let mappedType: string
        if (useExcelMapping) {
          const subject = order.subject || ''
          const article = order.supplierArticle || ''
          const brand = order.brand || ''

          // Filter out EXCLUDED subjects only for the configured admin/catalog keys.
          // User-added external API keys should show raw WB API data without Excel mapping.
          const subjectLower = subject.toLowerCase()
          if (EXCLUDED_WB_SUBJECTS.some(excl => subjectLower.includes(excl.toLowerCase()))) {
            continue
          }

          const mapped = mapWbOrderToProductKey(subject, article, brand, order.techSize || order.size)
          if (!mapped) continue
          mappedType = mapped
        } else {
          mappedType = getDirectProductName(order)
        }

        // Convert UTC date to Moscow date (UTC+3)
        // WB API returns dates like "2026-05-18T01:30:00Z" (UTC)
        // An order at 01:30 MSK is actually 2026-05-17T22:30:00Z — wrong date without conversion
        const orderDate = order.date
        let dateStr: string
        if (orderDate && orderDate.includes('T')) {
          const mskMs = new Date(orderDate).getTime() + 3 * 60 * 60 * 1000
          dateStr = new Date(mskMs).toISOString().substring(0, 10)
        } else {
          dateStr = orderDate?.substring(0, 10) || ''
        }
        const monthStr = dateStr.substring(0, 7)
        const isFbs = (order.warehouseType || '').includes('продавца') // "Склад продавца" = FBS

        targetRows.push({
          entrepreneurId,
          entrepreneurName,
          order,
          mappedType,
          dateStr,
          monthStr,
          isFbs,
        })
      }
      }

      mapOrders(orders, allMappedOrders)
      mapOrders(fulfillmentOrders, allFulfillmentMappedOrders)
    }

    // Collect rate limit errors for UI display
    const rateLimitErrors = results
      .flatMap(r => {
        const errors: Array<{ id: number; name: string; error: string }> = []
        if (r.error) errors.push({ id: r.entrepreneurId, name: r.entrepreneurName, error: r.error })
        if (r.returnError) errors.push({ id: r.entrepreneurId, name: r.entrepreneurName, error: r.returnError })
        return errors
      })

    // Build response based on requested section(s)
    // Product types (shared across sections)
    const productTypes = [...new Set(allMappedOrders.map(o => o.mappedType))]

    const response: Record<string, any> = { rateLimitErrors }

    // ─── Build Dashboard ───
    if (needDashboard) {
      // All dates in Moscow timezone (UTC+3)
      const mskOffset = 3 * 3600000
      const mskNow = new Date(Date.now() + mskOffset)
      const todayMsk = mskNow.toISOString().split('T')[0]
      const yesterdayMsk = new Date(mskNow.getTime() - 86400000).toISOString().split('T')[0]
      const dayBeforeMsk = new Date(mskNow.getTime() - 2 * 86400000).toISOString().split('T')[0]
      const currentMonth = todayMsk.substring(0, 7)
      // Previous month in Moscow timezone
      const prevMonthDate = new Date(mskNow)
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
      const prevMonth = prevMonthDate.toISOString().substring(0, 7)

      const totalOrders = allMappedOrders.length
      const yesterdayOrders = allMappedOrders.filter(o => o.dateStr === yesterdayMsk).length
      const dayBeforeYesterdayOrders = allMappedOrders.filter(o => o.dateStr === dayBeforeMsk).length
      const monthOrders = allMappedOrders.filter(o => o.monthStr === currentMonth).length
      const prevMonthOrders = allMappedOrders.filter(o => o.monthStr === prevMonth).length

      // FBS/FBO breakdown for yesterday and day before
      const yesterdayFbsOrders = allMappedOrders.filter(o => o.dateStr === yesterdayMsk && o.isFbs).length
      const yesterdayFboOrders = allMappedOrders.filter(o => o.dateStr === yesterdayMsk && !o.isFbs).length
      const dayBeforeYesterdayFbsOrders = allMappedOrders.filter(o => o.dateStr === dayBeforeMsk && o.isFbs).length
      const dayBeforeYesterdayFboOrders = allMappedOrders.filter(o => o.dateStr === dayBeforeMsk && !o.isFbs).length

      const allDates = [...new Set(allMappedOrders.map(o => o.dateStr).filter(Boolean))].sort()
      const latestDate = allDates.length > 0 ? allDates[allDates.length - 1] : null

      // Day change: yesterday vs day before yesterday
      const dayChange = dayBeforeYesterdayOrders > 0
        ? ((yesterdayOrders - dayBeforeYesterdayOrders) / dayBeforeYesterdayOrders * 100).toFixed(1)
        : null
      const monthChange = prevMonthOrders > 0
        ? ((monthOrders - prevMonthOrders) / prevMonthOrders * 100).toFixed(1)
        : null

      // Entrepreneur stats (all time from fetched data)
      const entStats: Record<number, { id: number; name: string; totalOrders: number }> = {}
      for (const ent of targets) {
        entStats[ent.id] = { id: ent.id, name: ent.name, totalOrders: 0 }
      }
      for (const o of allMappedOrders) {
        if (!entStats[o.entrepreneurId]) {
          entStats[o.entrepreneurId] = { id: o.entrepreneurId, name: o.entrepreneurName, totalOrders: 0 }
        }
        entStats[o.entrepreneurId].totalOrders++
      }

      // Entrepreneur stats for rolling 7 days ending yesterday
      const weekFromDate = new Date(mskNow.getTime() - 7 * 86400000).toISOString().split('T')[0]
      const weekOrders = allMappedOrders.filter(o => o.dateStr >= weekFromDate && o.dateStr <= yesterdayMsk)
      const weekTotalOrders = weekOrders.length

      const weekEntStats: Record<number, { id: number; name: string; totalOrders: number }> = {}
      for (const ent of targets) {
        weekEntStats[ent.id] = { id: ent.id, name: ent.name, totalOrders: 0 }
      }
      for (const o of weekOrders) {
        if (!weekEntStats[o.entrepreneurId]) {
          weekEntStats[o.entrepreneurId] = { id: o.entrepreneurId, name: o.entrepreneurName, totalOrders: 0 }
        }
        weekEntStats[o.entrepreneurId].totalOrders++
      }

      // FBS/FBO daily breakdown for chart (last 60 days ending yesterday)
      const chartFromDate = new Date(mskNow.getTime() - 60 * 86400000).toISOString().split('T')[0]
      const chartDates = [...new Set(
        allMappedOrders
          .filter(o => o.dateStr >= chartFromDate && o.dateStr <= yesterdayMsk)
          .map(o => o.dateStr)
          .filter(Boolean)
      )].sort()
      const chartFbs: Record<string, number> = {}
      const chartFbo: Record<string, number> = {}
      for (const d of chartDates) {
        chartFbs[d] = 0
        chartFbo[d] = 0
      }
      for (const o of allMappedOrders) {
        if (o.dateStr && chartFbs.hasOwnProperty(o.dateStr)) {
          if (o.isFbs) chartFbs[o.dateStr]++
          else chartFbo[o.dateStr]++
        }
      }

      // Period summary stats (total, fbs, fbo for different periods)
      const calcPeriodStats = (days: number) => {
        const from = new Date(mskNow.getTime() - days * 86400000).toISOString().split('T')[0]
        const periodOrders = allMappedOrders.filter(o => o.dateStr >= from && o.dateStr <= yesterdayMsk)
        return {
          total: periodOrders.length,
          fbs: periodOrders.filter(o => o.isFbs).length,
          fbo: periodOrders.filter(o => !o.isFbs).length,
          revenue: Math.round(periodOrders.reduce((sum, o) => sum + getOrderRevenue(o.order), 0)),
          dateFrom: from,
          dateTo: yesterdayMsk,
        }
      }

      // Previous period stats (same length, just shifted back)
      const calcPrevPeriodStats = (days: number) => {
        const prevTo = new Date(mskNow.getTime() - (days + 1) * 86400000).toISOString().split('T')[0]
        const prevFrom = new Date(mskNow.getTime() - (days * 2) * 86400000).toISOString().split('T')[0]
        const periodOrders = allMappedOrders.filter(o => o.dateStr >= prevFrom && o.dateStr <= prevTo)
        return {
          total: periodOrders.length,
          fbs: periodOrders.filter(o => o.isFbs).length,
          fbo: periodOrders.filter(o => !o.isFbs).length,
          revenue: Math.round(periodOrders.reduce((sum, o) => sum + getOrderRevenue(o.order), 0)),
          dateFrom: prevFrom,
          dateTo: prevTo,
        }
      }

      const dashboardPeriodStats = {
        yesterday: calcPeriodStats(1),
        week: calcPeriodStats(7),
        twoWeeks: calcPeriodStats(14),
        month: calcPeriodStats(30),
      }
      const dashboardPrevPeriodStats = {
        yesterday: calcPrevPeriodStats(1),
        week: calcPrevPeriodStats(7),
        twoWeeks: calcPrevPeriodStats(14),
        month: calcPrevPeriodStats(30),
      }

      const calcProductDynamics = (period: keyof typeof dashboardPeriodStats) => {
        const current = dashboardPeriodStats[period]
        const previous = dashboardPrevPeriodStats[period]
        const currentByProduct: Record<string, { name: string; article: string; currentOrders: number; previousOrders: number }> = {}

        const getProductKey = (o: typeof allMappedOrders[number]) => {
          const article = o.order.supplierArticle || ''
          const nmId = o.order.nmId || ''
          return `${article || 'unknown'}__${nmId || o.mappedType}`
        }

        const ensureProduct = (o: typeof allMappedOrders[number]) => {
          const key = getProductKey(o)
          if (!currentByProduct[key]) {
            const article = o.order.supplierArticle || ''
            currentByProduct[key] = {
              name: article || o.mappedType,
              article,
              currentOrders: 0,
              previousOrders: 0,
            }
          }
          return currentByProduct[key]
        }

        for (const o of allMappedOrders) {
          if (o.dateStr >= current.dateFrom && o.dateStr <= current.dateTo) {
            ensureProduct(o).currentOrders += 1
          } else if (o.dateStr >= previous.dateFrom && o.dateStr <= previous.dateTo) {
            ensureProduct(o).previousOrders += 1
          }
        }

        const rows = Object.values(currentByProduct).map((product) => {
          const { name, article, currentOrders, previousOrders } = product
          const diff = currentOrders - previousOrders
          const diffPercent = previousOrders > 0 ? Math.round((diff / previousOrders) * 1000) / 10 : null
          return { name, article, currentOrders, previousOrders, diff, diffPercent }
        })

        return {
          growth: rows.filter((row) => row.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 10),
          decline: rows.filter((row) => row.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 10),
        }
      }

      const adSpendByPeriod: Record<string, {
        totalSpend: number
        drr: number | null
        entrepreneurs: Array<{ id: number; name: string; spend: number; revenue: number; drr: number | null }>
      }> = {}

      for (const [period, stats] of Object.entries(dashboardPeriodStats)) {
        const entRows: Array<{ id: number; name: string; spend: number; revenue: number; drr: number | null }> = []
        for (const ent of targets) {
          const entOrders = allMappedOrders.filter(o => o.entrepreneurId === ent.id && o.dateStr >= stats.dateFrom && o.dateStr <= stats.dateTo)
          const revenue = Math.round(entOrders.reduce((sum, o) => sum + getOrderRevenue(o.order), 0))
          const spend = await fetchAdSpend(ent.wbApiKey, stats.dateFrom, stats.dateTo)
          entRows.push({
            id: ent.id,
            name: ent.name,
            spend: Math.round(spend),
            revenue,
            drr: revenue > 0 ? Math.round((spend / revenue) * 1000) / 10 : null,
          })
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        const totalSpend = entRows.reduce((sum, row) => sum + row.spend, 0)
        adSpendByPeriod[period] = {
          totalSpend,
          drr: stats.revenue > 0 ? Math.round((totalSpend / stats.revenue) * 1000) / 10 : null,
          entrepreneurs: entRows,
        }
      }

      const productDynamics = {
        yesterday: calcProductDynamics('yesterday'),
        week: calcProductDynamics('week'),
        twoWeeks: calcProductDynamics('twoWeeks'),
        month: calcProductDynamics('month'),
      }

      response.dashboard = {
        totalOrders,
        yesterdayOrders,
        dayBeforeYesterdayOrders,
        yesterdayDate: yesterdayMsk,
        monthOrders,
        prevMonthOrders,
        latestDate,
        dayChange,
        monthChange,
        yesterdayFbsOrders,
        yesterdayFboOrders,
        dayBeforeYesterdayFbsOrders,
        dayBeforeYesterdayFboOrders,
        entrepreneurStats: Object.values(entStats),
        weekEntrepreneurStats: Object.values(weekEntStats),
        weekTotalOrders,
        weekDateFrom: weekFromDate,
        weekDateTo: yesterdayMsk,
        productCount: productTypes.length,
        chartDates,
        chartFbs,
        chartFbo,
        periodStats: dashboardPeriodStats,
        prevPeriodStats: dashboardPrevPeriodStats,
        adSpendByPeriod,
        productDynamics,
      }
    }

    // ─── Build Daily ───
    if (needDaily) {
      const buildDailyPayload = (
        mappedRows: typeof allMappedOrders,
        fulfillmentRows: typeof allFulfillmentMappedOrders,
        dailyTargets: Array<{ id: number; name: string; wbApiKey: string }>
      ) => {
        const visibleDailyDates = [...new Set(mappedRows.map(o => o.dateStr).filter((d): d is string => Boolean(d) && d >= requestedDateFrom && d <= requestedDateTo))].sort()
        const allDailyDates = [...new Set(mappedRows.map(o => o.dateStr).filter(Boolean))].sort()
        const localProductTypes = [...new Set(mappedRows.map(o => o.mappedType))]
        const dailyProducts = localProductTypes.map((name, i) => ({ id: i, name }))
        const dailyProductMap = new Map(localProductTypes.map((name, i) => [name, i]))
        const dailyEntrepreneurs = dailyTargets.map(e => ({ id: e.id, name: e.name }))

        const dailyPivot: Record<number, Record<number, number>> = {}
        const dailyDateTotals: number[] = new Array(visibleDailyDates.length).fill(0)
        const dailyProductTotals: Record<number, number> = {}
        const entrepreneurDailyData: Record<string, Record<number, number>> = {}
        for (const date of visibleDailyDates) {
          entrepreneurDailyData[date] = {}
          for (const ent of dailyEntrepreneurs) entrepreneurDailyData[date][ent.id] = 0
        }

        const fbsPivot: Record<number, Record<number, number>> = {}
        const fbsDateTotals: number[] = new Array(visibleDailyDates.length).fill(0)
        const fbsProductTotals: Record<number, number> = {}
        const fboPivot: Record<number, Record<number, number>> = {}
        const fboDateTotals: number[] = new Array(visibleDailyDates.length).fill(0)
        const fboProductTotals: Record<number, number> = {}
        const previousPivot: Record<number, Record<number, number>> = {}
        const previousFbsPivot: Record<number, Record<number, number>> = {}
        const previousFboPivot: Record<number, Record<number, number>> = {}
        const previousDateTotals: number[] = new Array(visibleDailyDates.length).fill(0)
        const visibleDateIndex = new Map(visibleDailyDates.map((date, index) => [date, index]))
        const requestedFromMs = new Date(`${requestedDateFrom}T00:00:00`).getTime()
        const requestedToMs = new Date(`${requestedDateTo}T00:00:00`).getTime()
        const visiblePeriodDays = !Number.isNaN(requestedFromMs) && !Number.isNaN(requestedToMs)
          ? Math.ceil((requestedToMs - requestedFromMs) / 86400000) + 1
          : visibleDailyDates.length

        for (const o of mappedRows) {
          const productId = dailyProductMap.get(o.mappedType)
          if (productId === undefined) continue
          const dateIdx = visibleDateIndex.get(o.dateStr)

          if (dateIdx === undefined) {
            const orderMs = new Date(`${o.dateStr}T00:00:00`).getTime()
            if (!Number.isNaN(orderMs) && !Number.isNaN(requestedFromMs)) {
              const shifted = new Date(orderMs)
              shifted.setDate(shifted.getDate() + visiblePeriodDays)
              const shiftedDate = shifted.toISOString().split('T')[0]
              const shiftedIdx = visibleDateIndex.get(shiftedDate)
              if (shiftedIdx !== undefined) {
                if (!previousPivot[productId]) previousPivot[productId] = {}
                previousPivot[productId][shiftedIdx] = (previousPivot[productId][shiftedIdx] || 0) + 1
                previousDateTotals[shiftedIdx]++
                const fulfillmentPivot = o.isFbs ? previousFbsPivot : previousFboPivot
                if (!fulfillmentPivot[productId]) fulfillmentPivot[productId] = {}
                fulfillmentPivot[productId][shiftedIdx] = (fulfillmentPivot[productId][shiftedIdx] || 0) + 1
              }
            }
            continue
          }

          if (!dailyPivot[productId]) dailyPivot[productId] = {}
          dailyPivot[productId][dateIdx] = (dailyPivot[productId][dateIdx] || 0) + 1
          dailyDateTotals[dateIdx]++
          dailyProductTotals[productId] = (dailyProductTotals[productId] || 0) + 1
          entrepreneurDailyData[o.dateStr][o.entrepreneurId] = (entrepreneurDailyData[o.dateStr][o.entrepreneurId] || 0) + 1
        }

        for (const o of fulfillmentRows) {
          if (o.isFbs) continue
          const productId = dailyProductMap.get(o.mappedType)
          if (productId === undefined) continue
          const dateIdx = visibleDateIndex.get(o.dateStr)
          if (dateIdx === undefined) continue

          if (!fboPivot[productId]) fboPivot[productId] = {}
          fboPivot[productId][dateIdx] = (fboPivot[productId][dateIdx] || 0) + 1
          fboDateTotals[dateIdx]++
          fboProductTotals[productId] = (fboProductTotals[productId] || 0) + 1
        }

        for (const [productIdRaw, row] of Object.entries(dailyPivot)) {
          const productId = Number(productIdRaw)
          for (const [dateIdxRaw, totalValue] of Object.entries(row)) {
            const dateIdx = Number(dateIdxRaw)
            const fboValue = fboPivot[productId]?.[dateIdx] || 0
            const fbsValue = Math.max((Number(totalValue) || 0) - fboValue, 0)
            if (!fbsValue) continue
            if (!fbsPivot[productId]) fbsPivot[productId] = {}
            fbsPivot[productId][dateIdx] = fbsValue
            fbsDateTotals[dateIdx] += fbsValue
            fbsProductTotals[productId] = (fbsProductTotals[productId] || 0) + fbsValue
          }
        }

        return {
          dates: visibleDailyDates,
          allDates: allDailyDates,
          products: dailyProducts,
          entrepreneurs: dailyEntrepreneurs,
          pivot: dailyPivot,
          previousPivot,
          previousFbsPivot,
          previousFboPivot,
          dateTotals: dailyDateTotals,
          previousDateTotals,
          productTotals: dailyProductTotals,
          entrepreneurDailyData,
          fbsPivot,
          fbsDateTotals,
          fbsProductTotals,
          fboPivot,
          fboDateTotals,
          fboProductTotals,
        }
      }

      response.daily = buildDailyPayload(allMappedOrders, allFulfillmentMappedOrders, targets)
      response.dailyByEntrepreneur = Object.fromEntries(targets.map((ent) => [
        ent.id,
        buildDailyPayload(
          allMappedOrders.filter((row) => row.entrepreneurId === ent.id),
          allFulfillmentMappedOrders.filter((row) => row.entrepreneurId === ent.id),
          [ent]
        ),
      ]))
    }

    // ─── Build Monthly ───
    if (needMonthly) {
      const monthsSet = new Set<string>()
      for (const o of allMappedOrders) {
        if (o.monthStr) monthsSet.add(o.monthStr)
      }
      const months = [...monthsSet].sort()

      const monthlyEntrepreneurs = targets.map(e => ({ id: e.id, name: e.name }))

      const monthlyData: Record<string, Record<number, number>> = {}
      const monthlyRevenue: Record<string, Record<number, number>> = {}
      const productMonthlyData: Record<string, Record<number, number>> = {}
      const productMonthlyRevenue: Record<string, Record<number, number>> = {}

      const dailyProductMap = new Map(productTypes.map((name, i) => [name, i]))

      // Initialize all months with zeros
      for (const m of months) {
        monthlyData[m] = {}
        monthlyRevenue[m] = {}
        productMonthlyData[m] = {}
        productMonthlyRevenue[m] = {}
        for (const ent of monthlyEntrepreneurs) {
          monthlyData[m][ent.id] = 0
          monthlyRevenue[m][ent.id] = 0
        }
        for (const pt of productTypes) {
          const pid = dailyProductMap.get(pt)
          if (pid !== undefined) {
            productMonthlyData[m][pid] = 0
            productMonthlyRevenue[m][pid] = 0
          }
        }
      }

      for (const o of allMappedOrders) {
        if (!o.monthStr || !monthlyData[o.monthStr]) continue

        monthlyData[o.monthStr][o.entrepreneurId] = (monthlyData[o.monthStr][o.entrepreneurId] || 0) + 1
        monthlyRevenue[o.monthStr][o.entrepreneurId] = (monthlyRevenue[o.monthStr][o.entrepreneurId] || 0) + getOrderRevenue(o.order)

        const productId = dailyProductMap.get(o.mappedType)
        if (productId !== undefined) {
          productMonthlyData[o.monthStr][productId] = (productMonthlyData[o.monthStr][productId] || 0) + 1
          productMonthlyRevenue[o.monthStr][productId] = (productMonthlyRevenue[o.monthStr][productId] || 0) + getOrderRevenue(o.order)
        }
      }

      const dailyProducts = productTypes.map((name, i) => ({ id: i, name }))
      const monthRanges = months.map((month) => {
        const [year, monthNum] = month.split('-').map(Number)
        const from = `${month}-01`
        const to = new Date(Date.UTC(year, monthNum, 0)).toISOString().split('T')[0]
        return { month, from, to }
      })
      const adSpendByMonth: Record<string, Record<number, number>> = {}
      for (const { month, from, to } of monthRanges) {
        adSpendByMonth[month] = {}
        await Promise.all(targets.map(async (ent) => {
          adSpendByMonth[month][ent.id] = await fetchAdSpend(ent.wbApiKey, from, to)
        }))
      }
      const monthTotals = (month: string) => {
        const orders = monthlyEntrepreneurs.reduce((sum, ent) => sum + (monthlyData[month]?.[ent.id] || 0), 0)
        const revenue = monthlyEntrepreneurs.reduce((sum, ent) => sum + (monthlyRevenue[month]?.[ent.id] || 0), 0)
        const adSpend = monthlyEntrepreneurs.reduce((sum, ent) => sum + (adSpendByMonth[month]?.[ent.id] || 0), 0)
        return { orders, revenue, adSpend }
      }
      const monthStats = months.map((month, index) => {
        const current = monthTotals(month)
        const prevMonth = index > 0 ? monthTotals(months[index - 1]) : null
        const prevYearMonth = `${Number(month.slice(0, 4)) - 1}-${month.slice(5, 7)}`
        const prevYear = months.includes(prevYearMonth) ? monthTotals(prevYearMonth) : null
        const drr = current.revenue > 0 ? (current.adSpend / current.revenue) * 100 : null
        return {
          month,
          ...current,
          drr,
          momOrdersPct: prevMonth && prevMonth.orders > 0 ? ((current.orders - prevMonth.orders) / prevMonth.orders) * 100 : null,
          yoyOrdersPct: prevYear && prevYear.orders > 0 ? ((current.orders - prevYear.orders) / prevYear.orders) * 100 : null,
        }
      })
      const entrepreneurMonthly: Record<string, Record<number, { orders: number; revenue: number; adSpend: number; drr: number | null }>> = {}
      for (const month of months) {
        entrepreneurMonthly[month] = {}
        for (const ent of monthlyEntrepreneurs) {
          const orders = monthlyData[month]?.[ent.id] || 0
          const revenue = monthlyRevenue[month]?.[ent.id] || 0
          const adSpend = adSpendByMonth[month]?.[ent.id] || 0
          entrepreneurMonthly[month][ent.id] = {
            orders,
            revenue,
            adSpend,
            drr: revenue > 0 ? (adSpend / revenue) * 100 : null,
          }
        }
      }
      const currentMonth = months[months.length - 1]
      const previousMonth = months[months.length - 2]
      const productDynamics = (() => {
        if (!currentMonth || !previousMonth) return { growth: [], decline: [] }
        const rows = dailyProducts.map((product) => {
          const currentOrders = productMonthlyData[currentMonth]?.[product.id] || 0
          const previousOrders = productMonthlyData[previousMonth]?.[product.id] || 0
          const diff = currentOrders - previousOrders
          return {
            id: product.id,
            name: product.name,
            currentOrders,
            previousOrders,
            diff,
            diffPercent: previousOrders > 0 ? (diff / previousOrders) * 100 : null,
          }
        }).filter(row => row.currentOrders > 0 || row.previousOrders > 0)
        return {
          growth: rows.filter(row => row.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 10),
          decline: rows.filter(row => row.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 10),
        }
      })()
      const seasonality = dailyProducts.map((product) => {
        const values = months.map(month => ({ month, orders: productMonthlyData[month]?.[product.id] || 0 }))
        const total = values.reduce((sum, row) => sum + row.orders, 0)
        const avg = values.length ? total / values.length : 0
        const peak = values.slice().sort((a, b) => b.orders - a.orders)[0]
        return {
          id: product.id,
          name: product.name,
          peakMonth: peak?.month || '',
          peakOrders: peak?.orders || 0,
          avgOrders: avg,
          uplift: avg > 0 ? (peak?.orders || 0) / avg : 0,
        }
      })
        .filter(row => row.peakOrders >= 20 && row.uplift >= 1.5)
        .sort((a, b) => b.uplift - a.uplift)
        .slice(0, 10)

      response.monthly = {
        entrepreneurs: monthlyEntrepreneurs,
        products: dailyProducts,
        months,
        monthlyData,
        monthlyRevenue,
        productMonthlyData,
        productMonthlyRevenue,
        adSpendByMonth,
        entrepreneurMonthly,
        monthStats,
        productDynamics,
        seasonality,
      }
    }

    // ─── Build Production Load ───
    if (needProduction) {
      // Maximum FBS production capacity per day
      const capacityParam = Number(searchParams.get('capacity'))
      const DAILY_CAPACITY = Number.isFinite(capacityParam) && capacityParam > 0 ? Math.round(capacityParam) : 2500

      // Only FBS orders matter for production load
      const fbsOrders = allMappedOrders.filter(o => o.isFbs)

      const visibleProdDates = [...new Set(fbsOrders.map(o => o.dateStr).filter((d): d is string => Boolean(d) && d >= requestedDateFrom && d <= requestedDateTo))].sort()
      const visibleDateIndex = new Map(visibleProdDates.map((date, index) => [date, index]))
      const requestedFromMs = new Date(`${requestedDateFrom}T00:00:00`).getTime()
      const requestedToMs = new Date(`${requestedDateTo}T00:00:00`).getTime()
      const visiblePeriodDays = !Number.isNaN(requestedFromMs) && !Number.isNaN(requestedToMs)
        ? Math.ceil((requestedToMs - requestedFromMs) / 86400000) + 1
        : visibleProdDates.length

      // Product types with items multiplier
      const fbsProductTypes = [...new Set(fbsOrders.map(o => o.mappedType))]
      const prodProducts = fbsProductTypes.map((name, i) => ({
        id: i,
        name,
        multiplier: extractItemsMultiplier(name),
      }))
      const prodProductMap = new Map(fbsProductTypes.map((name, i) => [name, i]))

      // Build production pivot: productId → dateIdx → items count (orders × multiplier)
      const prodPivot: Record<number, Record<number, number>> = {}   // items
      const prodOrdersPivot: Record<number, Record<number, number>> = {} // raw orders
      const prodDateItems: number[] = new Array(visibleProdDates.length).fill(0)   // total items per date
      const prodDateOrders: number[] = new Array(visibleProdDates.length).fill(0)  // total orders per date
      const previousDateItems: number[] = new Array(visibleProdDates.length).fill(0)
      const previousDateOrders: number[] = new Array(visibleProdDates.length).fill(0)
      const prodProductItems: Record<number, number> = {}   // total items per product
      const prodProductOrders: Record<number, number> = {}  // total orders per product

      for (const o of fbsOrders) {
        const productId = prodProductMap.get(o.mappedType)
        if (productId === undefined) continue

        const multiplier = prodProducts[productId].multiplier
        const items = multiplier // 1 order × multiplier = multiplier items
        const dateIdx = visibleDateIndex.get(o.dateStr)
        if (dateIdx === undefined) {
          const orderMs = new Date(`${o.dateStr}T00:00:00`).getTime()
          if (!Number.isNaN(orderMs)) {
            const shifted = new Date(orderMs)
            shifted.setDate(shifted.getDate() + visiblePeriodDays)
            const shiftedIdx = visibleDateIndex.get(shifted.toISOString().split('T')[0])
            if (shiftedIdx !== undefined) {
              previousDateItems[shiftedIdx] += items
              previousDateOrders[shiftedIdx]++
            }
          }
          continue
        }

        // Items pivot
        if (!prodPivot[productId]) prodPivot[productId] = {}
        prodPivot[productId][dateIdx] = (prodPivot[productId][dateIdx] || 0) + items
        prodDateItems[dateIdx] += items
        prodProductItems[productId] = (prodProductItems[productId] || 0) + items

        // Orders pivot
        if (!prodOrdersPivot[productId]) prodOrdersPivot[productId] = {}
        prodOrdersPivot[productId][dateIdx] = (prodOrdersPivot[productId][dateIdx] || 0) + 1
        prodDateOrders[dateIdx]++
        prodProductOrders[productId] = (prodProductOrders[productId] || 0) + 1
      }

      // Calculate load percentages per date
      const prodDateLoadPct: number[] = prodDateItems.map(items =>
        Math.round((items / DAILY_CAPACITY) * 1000) / 10 // round to 1 decimal
      )
      const previousDateLoadPct: number[] = previousDateItems.map(items =>
        Math.round((items / DAILY_CAPACITY) * 1000) / 10
      )

      // Week/Month aggregates end at the selected period end, so historical ranges
      // remain internally consistent.
      const mskOffset2 = 3 * 3600000
      const mskNow2 = new Date(Date.now() + mskOffset2)
      const todayMskStr = new Date(mskNow2).toISOString().split('T')[0]
      const periodEnd = requestedDateTo

      // Rolling 7 days ending at selected period end (not calendar week)
      const weekEndDate = new Date(`${periodEnd}T00:00:00`)
      const weekStartDate = new Date(weekEndDate)
      weekStartDate.setDate(weekStartDate.getDate() - 6)
      const weekFromDate = weekStartDate.toISOString().split('T')[0]
      const weekDates = visibleProdDates.filter(d => d >= weekFromDate && d <= periodEnd)
      const weekTotalItems = weekDates.reduce((sum, d) => {
        const idx = visibleProdDates.indexOf(d)
        return sum + (prodDateItems[idx] || 0)
      }, 0)
      const weekDays = weekDates.length || 1
      const weekAvgLoadPct = Math.round((weekTotalItems / (DAILY_CAPACITY * weekDays)) * 1000) / 10
      const previousWeekTotalItems = weekDates.reduce((sum, d) => {
        const idx = visibleProdDates.indexOf(d)
        return sum + (previousDateItems[idx] || 0)
      }, 0)
      const previousWeekAvgLoadPct = Math.round((previousWeekTotalItems / (DAILY_CAPACITY * weekDays)) * 1000) / 10

      // Rolling 30 days ending at selected period end (not calendar month)
      const monthStartDate = new Date(weekEndDate)
      monthStartDate.setDate(monthStartDate.getDate() - 29)
      const monthFromDate = monthStartDate.toISOString().split('T')[0]
      const monthDates = visibleProdDates.filter(d => d >= monthFromDate && d <= periodEnd)
      const monthTotalItems = monthDates.reduce((sum, d) => {
        const idx = visibleProdDates.indexOf(d)
        return sum + (prodDateItems[idx] || 0)
      }, 0)
      const monthDays = monthDates.length || 1
      const monthAvgLoadPct = Math.round((monthTotalItems / (DAILY_CAPACITY * monthDays)) * 1000) / 10
      const previousMonthTotalItems = monthDates.reduce((sum, d) => {
        const idx = visibleProdDates.indexOf(d)
        return sum + (previousDateItems[idx] || 0)
      }, 0)
      const previousMonthAvgLoadPct = Math.round((previousMonthTotalItems / (DAILY_CAPACITY * monthDays)) * 1000) / 10

      // Selected period end load
      const periodEndIdx = visibleProdDates.indexOf(periodEnd)
      const periodEndItems = periodEndIdx >= 0 ? prodDateItems[periodEndIdx] : 0
      const periodEndLoadPct = periodEndIdx >= 0 ? prodDateLoadPct[periodEndIdx] : 0
      const recentItems = prodDateItems.slice(-14).filter(items => items > 0)
      const avgRecentItems = recentItems.length ? recentItems.reduce((sum, v) => sum + v, 0) / recentItems.length : 0
      const sameWeekdayAvg = (targetDate: Date) => {
        const weekday = targetDate.getUTCDay()
        const values = visibleProdDates
          .map((date, index) => ({ date, items: prodDateItems[index] || 0 }))
          .filter(row => row.items > 0 && new Date(`${row.date}T00:00:00`).getUTCDay() === weekday)
          .slice(-4)
          .map(row => row.items)
        if (!values.length) return avgRecentItems
        return values.reduce((sum, value) => sum + value, 0) / values.length
      }
      const forecast = Array.from({ length: 7 }, (_, index) => {
        const forecastDate = new Date(`${periodEnd}T00:00:00`)
        forecastDate.setDate(forecastDate.getDate() + index + 1)
        const predictedItems = Math.round(((avgRecentItems || 0) * 0.55) + (sameWeekdayAvg(forecastDate) * 0.45))
        return {
          date: forecastDate.toISOString().split('T')[0],
          predictedItems,
          loadPct: Math.round((predictedItems / DAILY_CAPACITY) * 1000) / 10,
        }
      })
      const todayMsk = new Date(`${todayMskStr}T00:00:00Z`)
      const seasonalityAlerts = PRODUCTION_SEASONAL_PEAKS
        .map((peak) => {
          const [month, day] = peak.peakMonthDay.split('-').map(Number)
          let peakDate = new Date(Date.UTC(todayMsk.getUTCFullYear(), month - 1, day))
          if (dateDiffDays(todayMsk, peakDate) < 0) {
            peakDate = new Date(Date.UTC(todayMsk.getUTCFullYear() + 1, month - 1, day))
          }
          return {
            ...peak,
            peakDate: peakDate.toISOString().split('T')[0],
            daysToPeak: dateDiffDays(todayMsk, peakDate),
          }
        })
        .filter(alert => alert.daysToPeak >= 0 && alert.daysToPeak <= 14)
        .sort((a, b) => a.daysToPeak - b.daysToPeak || b.uplift - a.uplift)

      response.production = {
        capacity: DAILY_CAPACITY,
        dates: visibleProdDates,
        products: prodProducts,
        pivot: prodPivot,
        ordersPivot: prodOrdersPivot,
        dateItems: prodDateItems,
        dateOrders: prodDateOrders,
        dateLoadPct: prodDateLoadPct,
        previousDateItems,
        previousDateOrders,
        previousDateLoadPct,
        productItems: prodProductItems,
        productOrders: prodProductOrders,
        forecast,
        seasonalityAlerts,
        summary: {
          yesterday: { date: periodEnd, items: periodEndItems, loadPct: periodEndLoadPct, orders: periodEndIdx >= 0 ? prodDateOrders[periodEndIdx] : 0 },
          week: { dateFrom: weekFromDate, dateTo: periodEnd, totalItems: weekTotalItems, avgLoadPct: weekAvgLoadPct, previousTotalItems: previousWeekTotalItems, previousAvgLoadPct: previousWeekAvgLoadPct, days: weekDays },
          month: { dateFrom: monthFromDate, dateTo: periodEnd, totalItems: monthTotalItems, avgLoadPct: monthAvgLoadPct, previousTotalItems: previousMonthTotalItems, previousAvgLoadPct: previousMonthAvgLoadPct, days: monthDays },
        },
      }
    }

    // ─── Build Supply Calculation ───
    if (needSupply) {
      const coefficient = Math.min(1.5, Math.max(1, Number(searchParams.get('coefficient')) || 1))  // 1.0 – 1.5, default 1
      const supplyDays = Number(searchParams.get('supplyDays')) || 14  // default 2 weeks

      // Count orders per supplierArticle in the selected period
      // We use ALL orders (both FBS and FBO) to calculate average daily demand
      const articleStats: Record<string, {
        article: string
        subject: string
        brand: string
        totalOrders: number
        fbsOrders: number
        fboOrders: number
        warehouses: Record<string, number>
      }> = {}

      // Calculate number of unique days in the date range that have orders
      const allOrderDates = new Set<string>()
      for (const o of allMappedOrders) {
        if (o.dateStr) allOrderDates.add(o.dateStr)

        const article = o.order.supplierArticle || ''
        if (!article) continue

        if (!articleStats[article]) {
          articleStats[article] = {
            article,
            subject: o.order.subject || '',
            brand: o.order.brand || '',
            totalOrders: 0,
            fbsOrders: 0,
            fboOrders: 0,
            warehouses: {},
          }
        }
        articleStats[article].totalOrders++
        const warehouseName = o.order.warehouseName || 'Не указан'
        articleStats[article].warehouses[warehouseName] = (articleStats[article].warehouses[warehouseName] || 0) + 1
        if (o.isFbs) {
          articleStats[article].fbsOrders++
        } else {
          articleStats[article].fboOrders++
        }
      }

      // Number of days in the analysis period
      const daysInRange = allOrderDates.size || 1

      // ─── Fetch FBO stock from WB API ───
      // Get current stock levels at WB warehouses to subtract from supply calculation
      const fboStock: Record<string, number> = {}  // supplierArticle -> total FBO quantity
      const fboStockByWarehouse: Record<string, Record<string, number>> = {}  // supplierArticle -> warehouse -> qty

      for (let i = 0; i < targets.length; i++) {
        const ent = targets[i]
        const apiHeaders = { 'Authorization': wbAuthHeader(ent.wbApiKey), 'Content-Type': 'application/json' }
        const stockDate = dateTo || new Date().toISOString().split('T')[0]
        const stockCacheKey = getStockCacheKey(ent.id, ent.wbApiKey, stockDate)

        const cachedStocks = getCached(stockCacheKey)
        if (cachedStocks) {
          for (const item of cachedStocks) {
            const article = item.supplierArticle || ''
            if (!article) continue
            const qty = item.quantityFull || 0
            const warehouseName = item.warehouseName || 'Не указан'
            fboStock[article] = (fboStock[article] || 0) + qty
            if (!fboStockByWarehouse[article]) fboStockByWarehouse[article] = {}
            fboStockByWarehouse[article][warehouseName] = (fboStockByWarehouse[article][warehouseName] || 0) + qty
          }
          continue
        }

        // Delay between entrepreneurs
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 500))

        try {
          // WB Stocks API: statistics-api.wildberries.ru/api/v1/supplier/stocks
          // Returns stock levels at WB warehouses (FBO) per article per warehouse
          // Use yesterday's date — the API requires dateFrom and returns stock snapshot
          const stocksUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${stockDate}`
          const stocksRes = await fetch(stocksUrl, { headers: apiHeaders, signal: AbortSignal.timeout(30000) })

          if (stocksRes.ok) {
            const stocksData = await stocksRes.json()
            if (Array.isArray(stocksData)) {
              for (const item of stocksData) {
                const article = item.supplierArticle || ''
                if (!article) continue
                // quantityFull = total stock at warehouse (free + reserved)
                // One article may appear multiple times (different warehouses) — sum them up
                const qty = item.quantityFull || 0
                const warehouseName = item.warehouseName || 'Не указан'
                fboStock[article] = (fboStock[article] || 0) + qty
                if (!fboStockByWarehouse[article]) fboStockByWarehouse[article] = {}
                fboStockByWarehouse[article][warehouseName] = (fboStockByWarehouse[article][warehouseName] || 0) + qty
              }
              setCache(stockCacheKey, stocksData, CACHE_TTL_STOCKS)
            }
          } else {
            console.log(`WB Stocks API error for ${ent.name}: ${stocksRes.status}`)
          }
        } catch (e) {
          console.log(`WB Stocks API network error for ${ent.name}`)
        }
      }

      // Build supply table — subtract FBO stock from calculated supply
      // supplyQty = max(0, avgDaily × supplyDays × coefficient - fboStock)
      const MIN_SUPPLY_QTY = 9
      const supplyTable = Object.values(articleStats)
        .map(stat => {
          const avgDaily = stat.totalOrders / daysInRange
          const rawSupply = Math.ceil(avgDaily * supplyDays * coefficient)
          const currentFboStock = fboStock[stat.article] || 0
          const supplyQty = Math.max(0, rawSupply - currentFboStock)
          const daysUntilOos = avgDaily > 0 ? Math.round((currentFboStock / avgDaily) * 10) / 10 : null
          const warehouseDemandRows = Object.entries(stat.warehouses)
            .filter(([warehouse]) => !isSortCenterWarehouse(warehouse))
            .map(([warehouse, orders]) => {
              const warehouseAvgDaily = orders / daysInRange
              const stock = fboStockByWarehouse[stat.article]?.[warehouse] || 0
              const targetStock = Math.ceil(warehouseAvgDaily * supplyDays * coefficient)
              return {
                warehouse,
                orders,
                avgDaily: Math.round(warehouseAvgDaily * 100) / 100,
                stock,
                recommendedQtyRaw: Math.max(0, targetStock - stock),
                daysUntilOos: warehouseAvgDaily > 0 ? Math.round((stock / warehouseAvgDaily) * 10) / 10 : null,
              }
            })
            .filter(row => row.recommendedQtyRaw > 0)
          const warehouseRows = distributeSupplyQty(warehouseDemandRows, supplyQty)
          return {
            article: stat.article,
            subject: stat.subject,
            brand: stat.brand,
            totalOrders: stat.totalOrders,
            fbsOrders: stat.fbsOrders,
            fboOrders: stat.fboOrders,
            avgDaily: Math.round(avgDaily * 100) / 100,
            fboStock: currentFboStock,
            daysUntilOos,
            warehouses: warehouseRows.slice(0, 5),
            supplyQty,
          }
        })
        .filter(r => r.supplyQty >= MIN_SUPPLY_QTY)
        .sort((a, b) => b.supplyQty - a.supplyQty)

      response.supply = {
        dateFrom,
        dateTo,
        daysInRange,
        supplyDays,
        coefficient,
        totalArticles: supplyTable.length,
        totalSupplyQty: supplyTable.reduce((s, r) => s + r.supplyQty, 0),
        totalFboStock: supplyTable.reduce((s, r) => s + r.fboStock, 0),
        criticalArticles: supplyTable.filter((r) => r.daysUntilOos !== null && r.daysUntilOos <= 7).length,
        articles: supplyTable,
      }
    }

    return NextResponse.json(response)
  } catch (e: any) {
    console.error('wb-data error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
