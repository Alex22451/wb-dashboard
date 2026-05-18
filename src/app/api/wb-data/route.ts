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

function getCacheKey(entId: number, dateFrom: string): string {
  return `${entId}:${dateFrom}`
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
  if (apiCache.size > 50) {
    const now = Date.now()
    for (const [k, v] of apiCache) {
      if (now - v.timestamp > v.ttl) apiCache.delete(k)
    }
  }
}

const CACHE_TTL_DASHBOARD = 5 * 60 * 1000   // 5 min
const CACHE_TTL_DAILY = 2 * 60 * 1000       // 2 min
const CACHE_TTL_MONTHLY = 10 * 60 * 1000    // 10 min

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
      const tenDaysAgo = new Date(nowMsk.getTime() - 10 * 86400000)
      defaultDateFrom = tenDaysAgo.toISOString().split('T')[0]
    } else {
      const threeMonthsAgo = new Date(nowMsk.getTime() - 90 * 86400000)
      defaultDateFrom = threeMonthsAgo.toISOString().split('T')[0]
    }

    const dateFrom = searchParams.get('dateFrom') || defaultDateFrom
    const dateTo = searchParams.get('dateTo') || new Date().toISOString().split('T')[0]

    // Get entrepreneurs with API keys
    const entResult = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string }>>(
      `SELECT id, name, wbApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL AND wbApiKey != ''`
    )

    let targets: Array<{ id: number; name: string; wbApiKey: string }>

    if (entrepreneurId === 'all') {
      targets = entResult
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
    const cacheTtl = section === 'dashboard' ? CACHE_TTL_DASHBOARD
      : section === 'daily' ? CACHE_TTL_DAILY
      : section === 'monthly' ? CACHE_TTL_MONTHLY
      : section === 'production' ? CACHE_TTL_PRODUCTION
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
      const cacheKey = getCacheKey(ent.id, dateFrom)

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
        const ordersUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${dateFrom}&flag=0`
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

        const dateStr = order.date?.substring(0, 10) || ''
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

      // Entrepreneur stats for current week (Monday to yesterday, excluding today)
      // Calculate Monday of current week in Moscow timezone
      const mskDayOfWeek = mskNow.getUTCDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
      const daysSinceMonday = mskDayOfWeek === 0 ? 6 : mskDayOfWeek - 1 // Monday=0, Sunday=6
      const weekMonday = new Date(mskNow.getTime() - daysSinceMonday * 86400000).toISOString().split('T')[0]

      const weekOrders = allMappedOrders.filter(o => o.dateStr >= weekMonday && o.dateStr < todayMsk)
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
        weekDateFrom: weekMonday,
        weekDateTo: yesterdayMsk,
        productCount: productTypes.length,
      }
    }

    // ─── Build Daily ───
    if (needDaily) {
      const dailyDates = [...new Set(allMappedOrders.map(o => o.dateStr).filter(Boolean))].sort()
      const dailyProducts = productTypes.map((name, i) => ({ id: i, name }))
      const dailyProductMap = new Map(productTypes.map((name, i) => [name, i]))

      const dailyPivot: Record<number, Record<number, number>> = {}
      const dailyDateTotals: number[] = new Array(dailyDates.length).fill(0)
      const dailyProductTotals: Record<number, number> = {}

      // FBS/FBO separate pivots
      const fbsPivot: Record<number, Record<number, number>> = {}
      const fbsDateTotals: number[] = new Array(dailyDates.length).fill(0)
      const fbsProductTotals: Record<number, number> = {}

      const fboPivot: Record<number, Record<number, number>> = {}
      const fboDateTotals: number[] = new Array(dailyDates.length).fill(0)
      const fboProductTotals: Record<number, number> = {}

      for (const o of allMappedOrders) {
        const dateIdx = dailyDates.indexOf(o.dateStr)
        if (dateIdx === -1) continue

        const productId = dailyProductMap.get(o.mappedType)
        if (productId === undefined) continue

        // All orders
        if (!dailyPivot[productId]) dailyPivot[productId] = {}
        dailyPivot[productId][dateIdx] = (dailyPivot[productId][dateIdx] || 0) + 1
        dailyDateTotals[dateIdx]++
        dailyProductTotals[productId] = (dailyProductTotals[productId] || 0) + 1

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
        dates: dailyDates,
        products: dailyProducts,
        pivot: dailyPivot,
        dateTotals: dailyDateTotals,
        productTotals: dailyProductTotals,
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
      const DAILY_CAPACITY = 2300

      // Only FBS orders matter for production load
      const fbsOrders = allMappedOrders.filter(o => o.isFbs)

      // Get unique dates
      const prodDates = [...new Set(fbsOrders.map(o => o.dateStr).filter(Boolean))].sort()

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
      const prodDateItems: number[] = new Array(prodDates.length).fill(0)   // total items per date
      const prodDateOrders: number[] = new Array(prodDates.length).fill(0)  // total orders per date
      const prodProductItems: Record<number, number> = {}   // total items per product
      const prodProductOrders: Record<number, number> = {}  // total orders per product

      for (const o of fbsOrders) {
        const dateIdx = prodDates.indexOf(o.dateStr)
        if (dateIdx === -1) continue

        const productId = prodProductMap.get(o.mappedType)
        if (productId === undefined) continue

        const multiplier = prodProducts[productId].multiplier
        const items = multiplier // 1 order × multiplier = multiplier items

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

      // Week/Month aggregates
      const mskOffset2 = 3 * 3600000
      const mskNow2 = new Date(Date.now() + mskOffset2)
      const todayMsk2 = mskNow2.toISOString().split('T')[0]
      const yesterdayMsk2 = new Date(mskNow2.getTime() - 86400000).toISOString().split('T')[0]

      // Current week (Mon-yesterday)
      const mskDayOfWeek = mskNow2.getUTCDay()
      const daysSinceMonday = mskDayOfWeek === 0 ? 6 : mskDayOfWeek - 1
      const weekMonday = new Date(mskNow2.getTime() - daysSinceMonday * 86400000).toISOString().split('T')[0]

      const weekDates = prodDates.filter(d => d >= weekMonday && d < todayMsk2)
      const weekTotalItems = weekDates.reduce((sum, d) => {
        const idx = prodDates.indexOf(d)
        return sum + (prodDateItems[idx] || 0)
      }, 0)
      const weekDays = weekDates.length || 1
      const weekAvgLoadPct = Math.round((weekTotalItems / (DAILY_CAPACITY * weekDays)) * 1000) / 10

      // Current month
      const currentMonth2 = todayMsk2.substring(0, 7)
      const monthDates = prodDates.filter(d => d.startsWith(currentMonth2) && d < todayMsk2)
      const monthTotalItems = monthDates.reduce((sum, d) => {
        const idx = prodDates.indexOf(d)
        return sum + (prodDateItems[idx] || 0)
      }, 0)
      const monthDays = monthDates.length || 1
      const daysInMonth = new Date(mskNow2.getUTCFullYear(), mskNow2.getUTCMonth() + 1, 0).getDate()
      const monthAvgLoadPct = Math.round((monthTotalItems / (DAILY_CAPACITY * monthDays)) * 1000) / 10

      // Yesterday load
      const yesterdayIdx = prodDates.indexOf(yesterdayMsk2)
      const yesterdayItems = yesterdayIdx >= 0 ? prodDateItems[yesterdayIdx] : 0
      const yesterdayLoadPct = yesterdayIdx >= 0 ? prodDateLoadPct[yesterdayIdx] : 0

      response.production = {
        capacity: DAILY_CAPACITY,
        dates: prodDates,
        products: prodProducts,
        pivot: prodPivot,
        ordersPivot: prodOrdersPivot,
        dateItems: prodDateItems,
        dateOrders: prodDateOrders,
        dateLoadPct: prodDateLoadPct,
        productItems: prodProductItems,
        productOrders: prodProductOrders,
        summary: {
          yesterday: { date: yesterdayMsk2, items: yesterdayItems, loadPct: yesterdayLoadPct, orders: yesterdayIdx >= 0 ? prodDateOrders[yesterdayIdx] : 0 },
          week: { dateFrom: weekMonday, dateTo: yesterdayMsk2, totalItems: weekTotalItems, avgLoadPct: weekAvgLoadPct, days: weekDays },
          month: { month: currentMonth2, totalItems: monthTotalItems, avgLoadPct: monthAvgLoadPct, days: monthDays, daysInMonth },
        },
      }
    }

    return NextResponse.json(response)
  } catch (e: any) {
    console.error('wb-data error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
