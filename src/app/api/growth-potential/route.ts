import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { isVercel } from '@/lib/entrepreneurs-config'
import { getVercelWbTargets } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

interface EntrepreneurRow {
  id: number
  name: string
  wbApiKey: string
  wbPromotionApiKey?: string | null
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
  dataSource: 'promotion'
  spend: number
  views: number
  ctr: number
  cpc: number
}

interface PromotionProductStats {
  nmId: number
  name: string
  views: number
  clicks: number
  atbs: number
  orders: number
  spend: number
  orderSum: number
}

const AD_API_BASE = 'https://advert-api.wildberries.ru'
const STATS_BASE = 'https://statistics-api.wildberries.ru/api/v1/supplier/stocks'
const growthCache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000
const ACTIVE_PROMOTION_STATUSES = new Set([7, 9, 11])

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

function apiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(normalizeApiKey(apiKey)).digest('hex').slice(0, 16)
}

function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^bearer\s+/i, '').trim()
}

function parseEntrepreneurIds(value: string | null, rows: EntrepreneurRow[]): EntrepreneurRow[] {
  if (!value || value === 'all') return rows
  const ids = new Set(value.split(',').map((id) => Number(id.trim())).filter(Number.isFinite))
  return rows.filter((row) => ids.has(row.id))
}

async function fetchWbApi(url: string, options: RequestInit): Promise<Response> {
  return fetch(url, options)
}

function collectAdvertIds(node: unknown, ids: Set<number>, parentStatus?: number) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => collectAdvertIds(item, ids, parentStatus))
    return
  }

  const record = node as Record<string, unknown>
  const status = Number(record.status ?? parentStatus)
  const advertId = Number(record.advertId ?? record.advert_id ?? record.id)
  if (advertId && (!status || ACTIVE_PROMOTION_STATUSES.has(status))) ids.add(advertId)

  for (const value of Object.values(record)) {
    collectAdvertIds(value, ids, Number.isFinite(status) ? status : parentStatus)
  }
}

async function fetchPromotionCampaignIds(apiKey: string): Promise<number[]> {
  const response = await fetchWbApi(`${AD_API_BASE}/adv/v1/promotion/count`, {
    headers: { Authorization: normalizeApiKey(apiKey) },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`WB Promotion campaigns ${response.status}: ${body.slice(0, 120) || 'ошибка'}`)
  }

  const data = await response.json()
  const ids = new Set<number>()
  collectAdvertIds(data, ids)
  return [...ids].slice(0, 50)
}

function aggregatePromotionNode(node: unknown, rows: Map<number, PromotionProductStats>) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => aggregatePromotionNode(item, rows))
    return
  }

  const record = node as Record<string, unknown>
  const nmId = Number(record.nmId ?? record.nm_id ?? record.nm)
  if (nmId) {
    const existing = rows.get(nmId)
    rows.set(nmId, {
      nmId,
      name: existing?.name || String(record.name || record.title || ''),
      views: (existing?.views || 0) + (Number(record.views) || 0),
      clicks: (existing?.clicks || 0) + (Number(record.clicks) || 0),
      atbs: (existing?.atbs || 0) + (Number(record.atbs) || 0),
      orders: (existing?.orders || 0) + (Number(record.orders) || 0),
      spend: (existing?.spend || 0) + (Number(record.sum ?? record.spend ?? record.expenses) || 0),
      orderSum: (existing?.orderSum || 0) + (Number(record.sum_price ?? record.price) || 0),
    })
  }

  for (const value of Object.values(record)) aggregatePromotionNode(value, rows)
}

async function fetchPromotionStats(apiKey: string, dateFrom: string, dateTo: string): Promise<PromotionProductStats[]> {
  const campaignIds = await fetchPromotionCampaignIds(apiKey)
  if (campaignIds.length === 0) return []

  const response = await fetchWbApi(
    `${AD_API_BASE}/adv/v3/fullstats?ids=${campaignIds.join(',')}&beginDate=${dateFrom}&endDate=${dateTo}`,
    { headers: { Authorization: normalizeApiKey(apiKey) } }
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`WB Promotion fullstats ${response.status}: ${body.slice(0, 120) || 'ошибка'}`)
  }

  const data = await response.json()
  const rows = new Map<number, PromotionProductStats>()
  aggregatePromotionNode(data, rows)
  return [...rows.values()].filter((row) => row.clicks > 0 || row.atbs > 0 || row.orders > 0 || row.spend > 0)
}

async function fetchFboStocks(apiKey: string, dateTo: string): Promise<Map<number, number>> {
  const stocks = new Map<number, number>()
  const response = await fetchWbApi(`${STATS_BASE}?dateFrom=${dateTo}`, {
    headers: {
      Authorization: normalizeApiKey(apiKey),
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
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const { searchParams } = request.nextUrl
    const entrepreneurId = searchParams.get('entrepreneurId')
    const dateTo = searchParams.get('dateTo') || new Date().toISOString().split('T')[0]
    const dateFrom = searchParams.get('dateFrom') || (() => {
      const d = new Date(`${dateTo}T00:00:00`)
      d.setDate(d.getDate() - 30)
      return d.toISOString().split('T')[0]
    })()
    const minClicks = Number(searchParams.get('minOpens')) || 20

    const rows = isVercel()
      ? await getVercelWbTargets(user, entrepreneurId)
      : await db.$queryRawUnsafe<EntrepreneurRow[]>(
          `SELECT id, name, wbApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL AND wbApiKey != '' ${user.role === 'admin' ? '' : `AND userId = ${user.id}`}`
        )
    const targets = parseEntrepreneurIds(entrepreneurId, rows).slice(0, 1)
    const cacheKey = `promotion:${targets.map((target) => `${target.id}:${apiKeyFingerprint(target.wbApiKey)}`).join(',')}:${dateFrom}:${dateTo}:${minClicks}`
    const cached = getCached(cacheKey)
    if (cached) return NextResponse.json(cached)

    const errors: Array<{ id: number; name: string; error: string }> = []
    const notices: string[] = []
    const items: GrowthItem[] = []

    for (const ent of targets) {
      try {
        const promotionApiKey = ent.wbPromotionApiKey || ent.wbApiKey
        const promotionRows = await fetchPromotionStats(promotionApiKey, dateFrom, dateTo)
        const fboStocks = await fetchFboStocks(ent.wbApiKey, dateTo)

        if (promotionRows.length === 0) {
          notices.push(`${ent.name}: нет рекламируемых товаров со статистикой за выбранный период.`)
          continue
        }

        const clickMedian = median(promotionRows.map((row) => row.clicks)) || 1
        const crMedian = median(promotionRows.map((row) => row.clicks > 0 ? row.orders / row.clicks : 0)) || 0.01
        const periodDays = Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1)

        for (const row of promotionRows) {
          const fboStock = fboStocks.get(row.nmId) || 0
          if (row.clicks < minClicks || row.orders <= 0 || fboStock <= 0) continue

          const conversion = row.clicks > 0 ? row.orders / row.clicks : 0
          const avgDailyOrders = row.orders / periodDays
          const daysUntilOos = avgDailyOrders > 0 ? Math.round((fboStock / avgDailyOrders) * 10) / 10 : null
          const conversionScore = Math.min(2, conversion / crMedian)
          const lowTrafficScore = Math.max(0.15, Math.min(1.5, clickMedian / Math.max(row.clicks, 1)))
          const stockScore = daysUntilOos === null ? 0 : Math.max(0, Math.min(1, daysUntilOos / 14))
          const confidenceScore = Math.min(1, row.clicks / 100)
          const potentialScore = Math.round(conversionScore * lowTrafficScore * stockScore * confidenceScore * 50)

          let recommendation = 'Увеличить рекламный трафик'
          if (daysUntilOos !== null && daysUntilOos < 10) recommendation = 'Сначала довезти ФБО'
          else if (row.clicks < clickMedian * 0.6) recommendation = 'Поднять бюджет/ставку'
          else if (row.atbs > 0 && row.orders / row.atbs < 0.25) recommendation = 'Проверить цену/карточку'

          items.push({
            entrepreneurId: ent.id,
            entrepreneurName: ent.name,
            nmId: row.nmId,
            article: String(row.nmId),
            title: row.name || String(row.nmId),
            subject: '',
            opens: row.clicks,
            carts: row.atbs,
            orders: row.orders,
            orderSum: row.orderSum,
            ctrToCart: row.clicks > 0 ? row.atbs / row.clicks : 0,
            conversion,
            fboStock,
            daysUntilOos,
            potentialScore,
            recommendation,
            dataSource: 'promotion',
            spend: row.spend,
            views: row.views,
            ctr: row.views > 0 ? row.clicks / row.views : 0,
            cpc: row.clicks > 0 ? row.spend / row.clicks : 0,
          })
        }
      } catch (error: any) {
        notices.push(`${ent.name}: не удалось получить рекламную статистику WB Promotion API (${error.message || 'ошибка API'}).`)
      }
    }

    const response = {
      dateFrom,
      dateTo,
      minOpens: minClicks,
      source: 'wb-promotion-fullstats-and-fbo-stocks',
      items: items.sort((a, b) => b.potentialScore - a.potentialScore).slice(0, 100),
      errors,
      notices,
    }
    setCached(cacheKey, response)
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Growth potential API error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load growth potential' }, { status: 500 })
  }
}
