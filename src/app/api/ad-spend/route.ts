import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { getEntrepreneurs } from '@/lib/entrepreneurs-config'
import { redisCommand } from '@/lib/redis-cache'
import { getVercelWbTargets } from '@/lib/user-store'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

interface EntrepreneurWithPromotionKey {
  id: number
  name: string
  wbApiKey: string | null
  promotionApiKey: string | null
}

interface WbAdCostRow {
  updTime: string | null
  updSum: number
  advertId: number
  campName: string
}

interface CampaignSpend {
  advertId: number
  name: string
  spend: number
  revenue?: number
  orders?: number
  drr?: number | null
}

interface AdPeriodEntrepreneurPayload {
  id: number
  name: string
  spend: number
  campaigns: CampaignSpend[]
  cacheSource?: 'redis'
}

const AD_API_BASE = 'https://advert-api.wildberries.ru'

function apiKeyFingerprint(apiKey: string) {
  return createHash('sha256').update(apiKey.trim()).digest('hex').slice(0, 16)
}

function redisAdPeriodKey(apiKey: string, from: string, to: string) {
  return `wb:ad-period:v1:${apiKeyFingerprint(apiKey)}:${from}:${to}`
}

function redisAdPeriodTtlSeconds(to: string) {
  const mskNow = new Date(Date.now() + 3 * 3600000)
  const today = mskNow.toISOString().split('T')[0]
  const yesterday = new Date(mskNow.getTime() - 86400000).toISOString().split('T')[0]
  if (to >= today) return 15 * 60
  if (to === yesterday) return 24 * 60 * 60
  return 180 * 24 * 60 * 60
}

async function readRedisAdPeriodPayload(apiKey: string, from: string, to: string): Promise<AdPeriodEntrepreneurPayload | null> {
  const raw = await redisCommand<string>(['GET', redisAdPeriodKey(apiKey, from, to)])
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.payload || typeof parsed.payload !== 'object') return null
    return { ...parsed.payload, cacheSource: 'redis' }
  } catch {
    return null
  }
}

async function writeRedisAdPeriodPayload(apiKey: string, from: string, to: string, payload: AdPeriodEntrepreneurPayload) {
  await redisCommand([
    'SET',
    redisAdPeriodKey(apiKey, from, to),
    JSON.stringify({
      from,
      to,
      fetchedAt: new Date().toISOString(),
      source: 'wb-ad-period-v1',
      complete: true,
      payload,
    }),
    'EX',
    redisAdPeriodTtlSeconds(to),
  ])
}

function getMonthEnd(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().slice(0, 10)
}

function getAvailableMonths(year: number): number[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const maxMonth = year < currentYear ? 12 : year === currentYear ? currentMonth : 0
  return Array.from({ length: maxMonth }, (_, i) => i + 1)
}

async function fetchWbAdCosts(apiKey: string, from: string, to: string): Promise<WbAdCostRow[]> {
  const url = `${AD_API_BASE}/adv/v1/upd?from=${from}&to=${to}`
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(30000),
  })

  if (response.status === 204) return []

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const detail = body ? body.slice(0, 180).replace(/\s+/g, ' ') : 'unknown error'
    throw new Error(`${response.status}: ${detail}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

function aggregateCampaignStatsNode(node: unknown, target: { revenue: number; orders: number }) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => aggregateCampaignStatsNode(item, target))
    return
  }

  const record = node as Record<string, unknown>
  const nmId = Number(record.nmId ?? record.nm_id ?? record.nm)
  if (nmId) {
    target.revenue += Number(record.sum_price ?? record.orderSum ?? record.price) || 0
    target.orders += Number(record.orders ?? record.orderCount) || 0
  }

  for (const value of Object.values(record)) aggregateCampaignStatsNode(value, target)
}

async function fetchCampaignStats(apiKey: string, advertIds: number[], from: string, to: string): Promise<Map<number, { revenue: number; orders: number }>> {
  const result = new Map<number, { revenue: number; orders: number }>()
  const uniqueIds = [...new Set(advertIds.filter(Boolean))]
  for (let offset = 0; offset < uniqueIds.length; offset += 50) {
    const chunk = uniqueIds.slice(offset, offset + 50)
    if (chunk.length === 0) continue

    const response = await fetch(
      `${AD_API_BASE}/adv/v3/fullstats?ids=${chunk.join(',')}&beginDate=${from}&endDate=${to}`,
      {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const detail = body ? body.slice(0, 180).replace(/\s+/g, ' ') : 'unknown error'
      throw new Error(`${response.status}: ${detail}`)
    }

    const data = await response.json()
    const rows = Array.isArray(data) ? data : []
    for (const row of rows) {
      const advertId = Number(row?.advertId ?? row?.advert_id ?? row?.id)
      if (!advertId) continue
      const stats = result.get(advertId) || { revenue: 0, orders: 0 }
      aggregateCampaignStatsNode(row, stats)
      result.set(advertId, stats)
    }

    if (offset + 50 < uniqueIds.length) await new Promise(resolve => setTimeout(resolve, 1100))
  }
  return result
}

async function getLocalEntrepreneurs(userId?: number): Promise<EntrepreneurWithPromotionKey[]> {
  try {
    const scope = userId ? `WHERE userId = ${userId}` : ''
    const rows = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string | null; wbPromotionApiKey: string | null }>>(
      `SELECT id, name, wbApiKey, wbPromotionApiKey FROM Entrepreneur ${scope} ORDER BY id`
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      wbApiKey: row.wbApiKey,
      promotionApiKey: row.wbPromotionApiKey || row.wbApiKey,
    }))
  } catch {
    const scope = userId ? `WHERE userId = ${userId}` : ''
    const rows = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string | null }>>(
      `SELECT id, name, wbApiKey FROM Entrepreneur ${scope} ORDER BY id`
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      wbApiKey: row.wbApiKey,
      promotionApiKey: row.wbApiKey,
    }))
  }
}

function getVercelEntrepreneurs(): EntrepreneurWithPromotionKey[] {
  return getEntrepreneurs().map((e) => ({
    id: e.id,
    name: e.name,
    wbApiKey: e.apiKey || null,
    promotionApiKey: e.promotionApiKey || e.apiKey || null,
  }))
}

function filterEntrepreneurs(rows: EntrepreneurWithPromotionKey[], entrepreneurId: string | null): EntrepreneurWithPromotionKey[] {
  if (!entrepreneurId || entrepreneurId === 'all') return rows
  const ids = new Set(entrepreneurId.split(',').map((id) => Number(id.trim())).filter(Number.isFinite))
  return rows.filter((row) => ids.has(row.id))
}

export async function GET(request: NextRequest) {
  try {
    const internalWarmRequest = !!(process.env.WB_VERCEL_API_TOKEN && request.headers.get('x-wb-internal-warm') === process.env.WB_VERCEL_API_TOKEN)
    const user = internalWarmRequest
      ? { id: 0, username: 'cron', role: 'admin' as const }
      : await getCurrentUser()
    if (!user) return unauthorized()

    const entrepreneurId = request.nextUrl.searchParams.get('entrepreneurId')
    const from = request.nextUrl.searchParams.get('from')
    const to = request.nextUrl.searchParams.get('to')
    const isVercel = !!process.env.VERCEL
    const entrepreneurs = isVercel
      ? (await getVercelWbTargets(user, entrepreneurId || 'all')).map((e) => ({
          id: e.id,
          name: e.name,
          wbApiKey: e.wbApiKey,
          promotionApiKey: e.wbPromotionApiKey || e.wbApiKey,
        }))
      : filterEntrepreneurs(await getLocalEntrepreneurs(user.role === 'admin' ? undefined : user.id), entrepreneurId)

    if (from && to) {
      const errors: Array<{ id: number; name: string; error: string }> = []
      const rows = await Promise.all(entrepreneurs.map(async (ent) => {
        if (!ent.promotionApiKey || ent.promotionApiKey.trim() === '') {
          errors.push({ id: ent.id, name: ent.name, error: 'Нет WB токена категории Продвижение' })
          return { id: ent.id, name: ent.name, spend: 0, campaigns: [] as CampaignSpend[] }
        }
        try {
          const cached = await readRedisAdPeriodPayload(ent.promotionApiKey, from, to)
          if (cached) return cached

          const costs = await fetchWbAdCosts(ent.promotionApiKey, from, to)
          const campaignTotals = new Map<number, CampaignSpend>()

          for (const cost of costs) {
            const spend = Number(cost.updSum) || 0
            if (spend <= 0) continue
            const advertId = Number(cost.advertId) || 0
            const existing = campaignTotals.get(advertId)
            campaignTotals.set(advertId, {
              advertId,
              name: existing?.name || cost.campName || `Кампания ${advertId}`,
              spend: (existing?.spend || 0) + spend,
            })
          }

          let stats = new Map<number, { revenue: number; orders: number }>()
          let statsComplete = true
          try {
            stats = await fetchCampaignStats(ent.promotionApiKey, [...campaignTotals.keys()], from, to)
          } catch (error: any) {
            statsComplete = false
            errors.push({ id: ent.id, name: ent.name, error: `Статистика кампаний: ${error.message || 'ошибка WB Promotion API'}` })
          }

          const campaigns = [...campaignTotals.values()]
            .map((campaign) => {
              const campaignStats = stats.get(campaign.advertId)
              const revenue = campaignStats?.revenue || 0
              return {
                ...campaign,
                spend: Math.round(campaign.spend),
                revenue: Math.round(revenue),
                orders: campaignStats?.orders || 0,
                drr: revenue > 0 ? Math.round((campaign.spend / revenue) * 1000) / 10 : null,
              }
            })
            .sort((a, b) => b.spend - a.spend)

          const spend = campaigns.reduce((sum, row) => sum + row.spend, 0)
          const payload = { id: ent.id, name: ent.name, spend, campaigns }
          if (statsComplete) await writeRedisAdPeriodPayload(ent.promotionApiKey, from, to, payload)
          return payload
        } catch (error: any) {
          errors.push({ id: ent.id, name: ent.name, error: error.message || 'Ошибка WB Promotion API' })
          return { id: ent.id, name: ent.name, spend: 0, campaigns: [] as CampaignSpend[] }
        }
      }))

      return NextResponse.json({
        period: { from, to },
        entrepreneurs: rows,
        totalSpend: rows.reduce((sum, row) => sum + row.spend, 0),
        source: 'wb-promotion-api',
        errors,
      })
    }

    const year = Number(request.nextUrl.searchParams.get('year')) || 2026
    const months = getAvailableMonths(year)

    const grouped: Record<number, {
      entrepreneur: string
      budget: number
      months: Array<{ month: number; actual: number; topCampaigns: CampaignSpend[] }>
    }> = {}
    const errors: Array<{ id: number; name: string; error: string }> = []

    await Promise.all(entrepreneurs.map(async (ent) => {
      if (!ent.promotionApiKey || ent.promotionApiKey.trim() === '') {
        errors.push({ id: ent.id, name: ent.name, error: 'Нет WB токена категории Продвижение' })
        return
      }

      const monthRows: Array<{ month: number; actual: number; topCampaigns: CampaignSpend[] }> = []

      for (const month of months) {
        const from = `${year}-${String(month).padStart(2, '0')}-01`
        const to = getMonthEnd(year, month)

        try {
          const costs = await fetchWbAdCosts(ent.promotionApiKey, from, to)
          const campaignTotals = new Map<number, CampaignSpend>()

          for (const cost of costs) {
            const spend = Number(cost.updSum) || 0
            if (spend <= 0) continue
            const advertId = Number(cost.advertId) || 0
            const existing = campaignTotals.get(advertId)
            campaignTotals.set(advertId, {
              advertId,
              name: existing?.name || cost.campName || `Кампания ${advertId}`,
              spend: (existing?.spend || 0) + spend,
            })
          }

          const campaigns = [...campaignTotals.values()].sort((a, b) => b.spend - a.spend)
          const topCampaigns = campaigns.slice(0, 5)
          const actual = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0)

          monthRows.push({ month, actual, topCampaigns })
        } catch (error: any) {
          errors.push({ id: ent.id, name: ent.name, error: error.message || 'Ошибка WB Promotion API' })
          break
        }

        await new Promise(resolve => setTimeout(resolve, 1100))
      }

      if (monthRows.some((row) => row.actual > 0)) {
        grouped[ent.id] = {
          entrepreneur: ent.name,
          budget: 0,
          months: monthRows.filter((row) => row.actual > 0),
        }
      }
    }))

    return NextResponse.json({
      entrepreneurs: entrepreneurs.map((e) => ({ id: e.id, name: e.name })),
      grouped,
      year,
      source: 'wb-promotion-api',
      errors,
    })
  } catch (error) {
    console.error('Ad spend API error:', error)
    return NextResponse.json({ error: 'Failed to load ad spend data' }, { status: 500 })
  }
}
