import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
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

function getCacheKey(entId: number, dateFrom: string, dateTo: string): string {
  return `${entId}:orders:${dateFrom}:${dateTo}`
}

function getStockCacheKey(entId: number, stockDate: string): string {
  return `${entId}:stocks:${stockDate}`
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

const CACHE_TTL_DASHBOARD = 5 * 60 * 1000   // 5 min
const CACHE_TTL_DAILY = 2 * 60 * 1000       // 2 min
const CACHE_TTL_MONTHLY = 10 * 60 * 1000    // 10 min
const CACHE_TTL_STOCKS = 15 * 60 * 1000     // 15 min
const AD_API_BASE = 'https://advert-api.wildberries.ru'

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

async function fetchAdSpend(apiKey: string, from: string, to: string): Promise<number> {
  const url = `${AD_API_BASE}/adv/v1/upd?from=${from}&to=${to}`
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
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
      const sixMonthsAgo = new Date(nowMsk.getTime() - 180 * 86400000)
      defaultDateFrom = sixMonthsAgo.toISOString().split('T')[0]
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
    let dateFrom = requestedDateFrom
    const dateTo = requestedDateTo
    if (section === 'daily' || section === 'production') {
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

    // Get entrepreneurs with API keys
    const entResult = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string }>>(
      `SELECT id, name, wbApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL AND wbApiKey != ''`
    )
    let targets: Array<{ id: number; name: string; wbApiKey: string }>

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
        monthly: { entrepreneurs: [], products: [], months: [], monthlyData: {}, productMonthlyData: {} },
        rateLimitErrors: [],
      })
    }

    // Determine cache TTL based on section
    const CACHE_TTL_PRODUCTION = 2 * 60 * 1000  // 2 min
    const CACHE_TTL_SUPPLY = 2 * 60 * 1000  // 2 min
    const cacheTtl = section === 'dashboard' ? CACHE_TTL_DASHBOARD
      : section === 'daily' ? CACHE_TTL_DAILY
      : section === 'monthly' ? CACHE_TTL_MONTHLY
      : section === 'production' ? CACHE_TTL_PRODUCTION
      : section === 'supply' ? CACHE_TTL_SUPPLY
      : CACHE_TTL_DASHBOARD

    // Fetch orders for each entrepreneur SEQUENTIALLY with delays
    // Use cache to avoid repeated API calls
    const results: Array<{
      entrepreneurId: number
      entrepreneurName: string
      orders: any[]
      error?: string
    }> = []

    for (let i = 0; i < targets.length; i++) {
      const ent = targets[i]
      const cacheKey = getCacheKey(ent.id, apiDateFrom, dateTo)

      // Check cache first
      const cached = getCached(cacheKey)
      if (cached) {
        results.push(cached)
        continue
      }

      const apiHeaders = { 'Authorization': `Bearer ${ent.wbApiKey}`, 'Content-Type': 'application/json' }

      // Delay between entrepreneurs (1s) to respect rate limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      let orders: any[] = []
      let error: string | undefined

      try {
        // flag=0 returns the complete dataset filtered by lastChangeDate (not order date).
        // We use flag=0 instead of flag=1 because flag=1 returns a tiny broken subset.
        // We do NOT filter out isCancel because Excel "Воронка продаж" counts ALL orders
        // including cancelled ones. Matching Excel requires keeping cancelled orders.
        // NOTE: WB API dateFrom filters by lastChangeDate, not order date.
        // We add a 2-day buffer and filter client-side by actual order date.
        const ordersUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${apiDateFrom}&flag=0`
        const response = await fetch(ordersUrl, { headers: apiHeaders, signal: AbortSignal.timeout(30000) })

        if (response.status === 429 || response.status === 461) {
          console.log(`WB API rate limited for ${ent.name}, skipping (429)`)
          error = 'Превышен лимит запросов (429), попробуйте позже'
        } else if (response.status === 401) {
          console.log(`WB API unauthorized for ${ent.name} (401)`)
          error = 'Неверный API ключ (401)'
        } else if (response.ok) {
          const allOrders = await response.json()
          if (Array.isArray(allOrders)) {
            orders = filterToDateRange(allOrders, dateFrom, dateTo)
          }
        } else {
          console.log(`WB API error for ${ent.name}: ${response.status}`)
          error = `Ошибка API (${response.status})`
        }
      } catch (_e) {
        console.log(`WB API network error for ${ent.name}`)
        error = 'Ошибка сети'
      }

      const result = {
        entrepreneurId: ent.id,
        entrepreneurName: ent.name,
        orders,
        error,
      }

      // Cache only successful results (with orders)
      if (!error) {
        setCache(cacheKey, result, cacheTtl)
      }

      results.push(result)
    }

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

    for (const result of results) {
      const { entrepreneurId, entrepreneurName, orders } = result

      for (const order of orders) {
        const subject = order.subject || ''
        const article = order.supplierArticle || ''
        const brand = order.brand || ''

        // Filter out EXCLUDED subjects (Картины, Алмазная мозаика, etc.)
        // These categories should NOT be counted in analytics/statistics
        const subjectLower = subject.toLowerCase()
        if (EXCLUDED_WB_SUBJECTS.some(excl => subjectLower.includes(excl.toLowerCase()))) {
          continue
        }

        const mappedType = mapWbOrderToProductKey(subject, article, brand, order.techSize || order.size)
        if (!mappedType) continue

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

        allMappedOrders.push({
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

    // Collect rate limit errors for UI display
    const rateLimitErrors = results
      .filter(r => r.error)
      .map(r => ({ id: r.entrepreneurId, name: r.entrepreneurName, error: r.error }))

    // Build response based on requested section(s)
    const needDashboard = !section || section === 'dashboard'
    const needDaily = !section || section === 'daily'
    const needMonthly = !section || section === 'monthly'
    const needProduction = !section || section === 'production'
    const needSupply = !section || section === 'supply'

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
      const visibleDailyDates = [...new Set(allMappedOrders.map(o => o.dateStr).filter((d): d is string => Boolean(d) && d >= requestedDateFrom && d <= requestedDateTo))].sort()
      const allDailyDates = [...new Set(allMappedOrders.map(o => o.dateStr).filter(Boolean))].sort()
      const dailyProducts = productTypes.map((name, i) => ({ id: i, name }))
      const dailyProductMap = new Map(productTypes.map((name, i) => [name, i]))
      const dailyEntrepreneurs = targets.map(e => ({ id: e.id, name: e.name }))

      const dailyPivot: Record<number, Record<number, number>> = {}
      const dailyDateTotals: number[] = new Array(visibleDailyDates.length).fill(0)
      const dailyProductTotals: Record<number, number> = {}
      const entrepreneurDailyData: Record<string, Record<number, number>> = {}
      for (const date of visibleDailyDates) {
        entrepreneurDailyData[date] = {}
        for (const ent of dailyEntrepreneurs) {
          entrepreneurDailyData[date][ent.id] = 0
        }
      }

      // FBS/FBO separate pivots
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

      for (const o of allMappedOrders) {
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

        // All orders
        if (!dailyPivot[productId]) dailyPivot[productId] = {}
        dailyPivot[productId][dateIdx] = (dailyPivot[productId][dateIdx] || 0) + 1
        dailyDateTotals[dateIdx]++
        dailyProductTotals[productId] = (dailyProductTotals[productId] || 0) + 1
        entrepreneurDailyData[o.dateStr][o.entrepreneurId] = (entrepreneurDailyData[o.dateStr][o.entrepreneurId] || 0) + 1

        // FBS or FBO
        if (o.isFbs) {
          if (!fbsPivot[productId]) fbsPivot[productId] = {}
          fbsPivot[productId][dateIdx] = (fbsPivot[productId][dateIdx] || 0) + 1
          fbsDateTotals[dateIdx]++
          fbsProductTotals[productId] = (fbsProductTotals[productId] || 0) + 1
        } else {
          if (!fboPivot[productId]) fboPivot[productId] = {}
          fboPivot[productId][dateIdx] = (fboPivot[productId][dateIdx] || 0) + 1
          fboDateTotals[dateIdx]++
          fboProductTotals[productId] = (fboProductTotals[productId] || 0) + 1
        }
      }

      response.daily = {
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

    // ─── Build Monthly ───
    if (needMonthly) {
      const monthsSet = new Set<string>()
      for (const o of allMappedOrders) {
        if (o.monthStr) monthsSet.add(o.monthStr)
      }
      const months = [...monthsSet].sort()

      const monthlyEntrepreneurs = targets.map(e => ({ id: e.id, name: e.name }))

      const monthlyData: Record<string, Record<number, number>> = {}
      const productMonthlyData: Record<string, Record<number, number>> = {}

      const dailyProductMap = new Map(productTypes.map((name, i) => [name, i]))

      // Initialize all months with zeros
      for (const m of months) {
        monthlyData[m] = {}
        productMonthlyData[m] = {}
        for (const ent of monthlyEntrepreneurs) {
          monthlyData[m][ent.id] = 0
        }
        for (const pt of productTypes) {
          const pid = dailyProductMap.get(pt)
          if (pid !== undefined) {
            productMonthlyData[m][pid] = 0
          }
        }
      }

      for (const o of allMappedOrders) {
        if (!o.monthStr || !monthlyData[o.monthStr]) continue

        monthlyData[o.monthStr][o.entrepreneurId] = (monthlyData[o.monthStr][o.entrepreneurId] || 0) + 1

        const productId = dailyProductMap.get(o.mappedType)
        if (productId !== undefined) {
          productMonthlyData[o.monthStr][productId] = (productMonthlyData[o.monthStr][productId] || 0) + 1
        }
      }

      const dailyProducts = productTypes.map((name, i) => ({ id: i, name }))

      response.monthly = {
        entrepreneurs: monthlyEntrepreneurs,
        products: dailyProducts,
        months,
        monthlyData,
        productMonthlyData,
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
        const apiHeaders = { 'Authorization': `Bearer ${ent.wbApiKey}`, 'Content-Type': 'application/json' }
        const stockDate = dateTo || new Date().toISOString().split('T')[0]
        const stockCacheKey = getStockCacheKey(ent.id, stockDate)

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
