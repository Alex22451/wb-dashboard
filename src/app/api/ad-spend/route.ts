import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { getEntrepreneurs } from '@/lib/entrepreneurs-config'
import { getVercelWbTargets } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'

interface EntrepreneurWithPromotionKey {
  id: number
  name: string
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
}

const AD_API_BASE = 'https://advert-api.wildberries.ru'

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

async function getLocalEntrepreneurs(userId?: number): Promise<EntrepreneurWithPromotionKey[]> {
  try {
    const scope = userId ? `WHERE userId = ${userId}` : ''
    const rows = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string | null; wbPromotionApiKey: string | null }>>(
      `SELECT id, name, wbApiKey, wbPromotionApiKey FROM Entrepreneur ${scope} ORDER BY id`
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
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
      promotionApiKey: row.wbApiKey,
    }))
  }
}

function getVercelEntrepreneurs(): EntrepreneurWithPromotionKey[] {
  return getEntrepreneurs().map((e) => ({
    id: e.id,
    name: e.name,
    promotionApiKey: e.promotionApiKey || e.apiKey || null,
  }))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const year = Number(request.nextUrl.searchParams.get('year')) || 2026
    const isVercel = !!process.env.VERCEL
    const entrepreneurs = isVercel
      ? (await getVercelWbTargets(user, 'all')).map((e) => ({
          id: e.id,
          name: e.name,
          promotionApiKey: e.wbPromotionApiKey || e.wbApiKey,
        }))
      : await getLocalEntrepreneurs(user.role === 'admin' ? undefined : user.id)
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
