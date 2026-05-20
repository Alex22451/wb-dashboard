import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

interface EntrepreneurRow {
  id: number
  name: string
  wbApiKey: string
}

interface FunnelProduct {
  product: {
    nmId: number
    title: string
    vendorCode: string
    brandName: string
    subjectName: string
  }
  statistic: {
    selected: {
      openCount: number
      cartCount: number
      orderCount: number
      orderSum: number
      buyoutCount?: number
    }
  }
}

interface GrowthItem {
  entrepreneurId: number
  entrepreneurName: string
  nmId: number
  article: string
  title: string
  subject: string
  opens: number
  carts: number
  orders: number
  orderSum: number
  ctrToCart: number
  conversion: number
  fboStock: number
  daysUntilOos: number | null
  potentialScore: number
  recommendation: string
}

const API_BASE = 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products'
const STATS_BASE = 'https://statistics-api.wildberries.ru/api/v1/supplier/stocks'
const growthCache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000

function getCached(key: string): unknown | null {
  const cached = growthCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    growthCache.delete(key)
    return null
  }
  return cached.data
}

function setCached(key: string, data: unknown) {
  growthCache.set(key, { data, timestamp: Date.now() })
  if (growthCache.size > 100) {
    const now = Date.now()
    for (const [cacheKey, entry] of growthCache) {
      if (now - entry.timestamp > CACHE_TTL) growthCache.delete(cacheKey)
    }
  }
}

function parseEntrepreneurIds(value: string | null, rows: EntrepreneurRow[]): EntrepreneurRow[] {
  if (!value || value === 'all') return rows
  const ids = new Set(value.split(',').map((id) => Number(id.trim())).filter(Number.isFinite))
  return rows.filter((row) => ids.has(row.id))
}

async function fetchWbApi(url: string, options: RequestInit): Promise<Response> {
  return fetch(url, options)
}

async function fetchFunnel(apiKey: string, dateFrom: string, dateTo: string): Promise<FunnelProduct[]> {
  const products = new Map<number, FunnelProduct>()

  const response = await fetchWbApi(API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      page: 1,
      pageSize: 100,
      selectedPeriod: { start: dateFrom, end: dateTo },
      orderBy: { field: 'openCount', mode: 'asc' },
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = body.detail || body.title || body.message || 'ошибка'
    if (response.status === 429 || response.status === 461) {
      throw new Error('Превышен лимит WB Sales Funnel API. Подождите 2-3 минуты и загрузите одно ИП.')
    }
    throw new Error(`WB Sales Funnel API ${response.status}: ${message}`)
  }

  const data = await response.json()
  const pageProducts: FunnelProduct[] = data?.data?.products || []
  for (const product of pageProducts) {
    const nmId = product.product?.nmId
    if (nmId && !products.has(nmId)) products.set(nmId, product)
  }

  return [...products.values()]
}

async function fetchFboStocks(apiKey: string, dateTo: string): Promise<Map<number, number>> {
  const stocks = new Map<number, number>()
  const response = await fetchWbApi(`${STATS_BASE}?dateFrom=${dateTo}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) return stocks
  const data = await response.json()
  if (!Array.isArray(data)) return stocks

  for (const item of data) {
    const nmId = Number(item.nmId) || 0
    if (!nmId) continue
    const qty = Number(item.quantityFull) || 0
    stocks.set(nmId, (stocks.get(nmId) || 0) + qty)
  }
  return stocks
}

function median(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const entrepreneurId = searchParams.get('entrepreneurId')
    const dateTo = searchParams.get('dateTo') || new Date().toISOString().split('T')[0]
    const dateFrom = searchParams.get('dateFrom') || (() => {
      const d = new Date(`${dateTo}T00:00:00`)
      d.setDate(d.getDate() - 30)
      return d.toISOString().split('T')[0]
    })()
    const minOpens = Number(searchParams.get('minOpens')) || 20

    const cacheKey = `${entrepreneurId || 'all'}:${dateFrom}:${dateTo}:${minOpens}`
    const cached = getCached(cacheKey)
    if (cached) return NextResponse.json(cached)

    const rows = await db.$queryRawUnsafe<EntrepreneurRow[]>(
      `SELECT id, name, wbApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL AND wbApiKey != ''`
    )
    const targets = parseEntrepreneurIds(entrepreneurId, rows)
    const errors: Array<{ id: number; name: string; error: string }> = []
    const items: GrowthItem[] = []

    for (let i = 0; i < targets.length; i++) {
      const ent = targets[i]
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 1200))

      try {
        const [funnel, fboStocks] = await Promise.all([
          fetchFunnel(ent.wbApiKey, dateFrom, dateTo),
          fetchFboStocks(ent.wbApiKey, dateTo),
        ])

        const prepared = funnel.map((product) => {
          const selected = product.statistic?.selected || {}
          const opens = Number(selected.openCount) || 0
          const orders = Number(selected.orderCount) || 0
          return {
            product,
            opens,
            carts: Number(selected.cartCount) || 0,
            orders,
            orderSum: Number(selected.orderSum) || 0,
            conversion: opens > 0 ? orders / opens : 0,
            fboStock: fboStocks.get(product.product.nmId) || 0,
          }
        })

        const trafficMedian = median(prepared.map((item) => item.opens)) || 1
        const conversionMedian = median(prepared.map((item) => item.conversion)) || 0.01

        for (const item of prepared) {
          if (item.opens < minOpens || item.orders <= 0 || item.fboStock <= 0) continue

          const avgDailyOrders = item.orders / Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1)
          const daysUntilOos = avgDailyOrders > 0 ? Math.round((item.fboStock / avgDailyOrders) * 10) / 10 : null
          const conversionScore = Math.min(2, item.conversion / conversionMedian)
          const lowTrafficScore = Math.max(0.15, Math.min(1.5, trafficMedian / Math.max(item.opens, 1)))
          const stockScore = daysUntilOos === null ? 0 : Math.max(0, Math.min(1, daysUntilOos / 14))
          const confidenceScore = Math.min(1, item.opens / 100)
          const potentialScore = Math.round(conversionScore * lowTrafficScore * stockScore * confidenceScore * 50)

          let recommendation = 'Разгонять трафик'
          if (daysUntilOos !== null && daysUntilOos < 10) recommendation = 'Сначала довезти ФБО'
          else if (item.opens < trafficMedian * 0.6) recommendation = 'Добавить рекламу'
          else if (item.carts > 0 && item.orders / item.carts < 0.25) recommendation = 'Проверить цену/карточку'

          items.push({
            entrepreneurId: ent.id,
            entrepreneurName: ent.name,
            nmId: item.product.product.nmId,
            article: item.product.product.vendorCode || '',
            title: item.product.product.title || '',
            subject: item.product.product.subjectName || '',
            opens: item.opens,
            carts: item.carts,
            orders: item.orders,
            orderSum: item.orderSum,
            ctrToCart: item.opens > 0 ? item.carts / item.opens : 0,
            conversion: item.conversion,
            fboStock: item.fboStock,
            daysUntilOos,
            potentialScore,
            recommendation,
          })
        }
      } catch (error: any) {
        errors.push({ id: ent.id, name: ent.name, error: error.message || 'Ошибка WB API' })
      }
    }

    const response = {
      dateFrom,
      dateTo,
      minOpens,
      source: 'wb-sales-funnel-and-fbo-stocks',
      items: items.sort((a, b) => b.potentialScore - a.potentialScore).slice(0, 100),
      errors,
    }
    setCached(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Growth potential API error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load growth potential' }, { status: 500 })
  }
}
