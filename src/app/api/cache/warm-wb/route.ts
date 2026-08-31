import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/lib/redis-cache'
import { getAllVercelWbTargets, type WbTarget } from '@/lib/user-store'
import { validateInternalSecret } from '@/lib/internal-request-auth'

export const maxDuration = 240

function getBaseUrl(): string | null {
  const configured = process.env.WB_INTERNAL_ORIGIN || process.env.VERCEL_URL || ''
  if (!configured) return null
  try {
    const url = new URL(configured.includes('://') ? configured : `https://${configured}`)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null
    return url.origin
  } catch {
    return null
  }
}

const WARM_RANGE_DAYS = 7

function getMoscowDashboardWarmRange(days: number) {
  const mskNow = new Date(Date.now() + 3 * 3600000)
  const yesterday = new Date(mskNow.getTime() - 86400000)
  const warmStart = new Date(mskNow.getTime() - days * 86400000)
  return {
    from: warmStart.toISOString().split('T')[0],
    to: yesterday.toISOString().split('T')[0],
  }
}

function getDateRange(from: string, to: string) {
  const dates: string[] = []
  const current = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

async function probeRedis() {
  const key = `wb:probe:${Date.now()}`
  const value = 'ok'
  const setResult = await redisCommand<string>(['SET', key, value, 'EX', 60])
  const getResult = await redisCommand<string>(['GET', key])
  await redisCommand<number>(['DEL', key])
  return {
    configured: hasRedisConfig(),
    setResult,
    getResult,
    ok: setResult === 'OK' && getResult === value,
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is required for cache warmup' }, { status: 503 })
  }
  const auth = request.headers.get('authorization') || ''
  if (!validateInternalSecret(auth.startsWith('Bearer ') ? auth.slice(7) : '', cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    return NextResponse.json({ error: 'WB_INTERNAL_ORIGIN or VERCEL_URL is required for cache warmup' }, { status: 503 })
  }
  const internalToken = process.env.WB_VERCEL_API_TOKEN
  if (!internalToken) {
    return NextResponse.json({ error: 'WB_VERCEL_API_TOKEN is required for cache warmup' }, { status: 500 })
  }

  const scope = request.nextUrl.searchParams.get('scope') === 'admin' ? 'admin' : 'all'
  const requestedMetric = request.nextUrl.searchParams.get('metric')
  const metricMode: 'orders' | 'sales' = requestedMetric === 'sales' ? 'sales' : 'orders'
  const explicitDate = request.nextUrl.searchParams.get('date') || ''
  const requestedDays = Number(request.nextUrl.searchParams.get('periodDays') || WARM_RANGE_DAYS)
  const periodDays = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.floor(requestedDays), 1), WARM_RANGE_DAYS) : WARM_RANGE_DAYS
  const { from, to } = getMoscowDashboardWarmRange(periodDays)
  const warmDates = explicitDate ? [explicitDate] : getDateRange(from, to)
  const availableTargets = scope === 'all' || metricMode !== 'orders' ? await getAllVercelWbTargets() : []
  const allTargets = scope === 'all' ? availableTargets : []
  const salesTargets = scope === 'all'
    ? allTargets
    : availableTargets.filter((target) => target.id < 100000)
  const redisProbe = await probeRedis()
  const lockToken = randomUUID()
  const lockResult = await redisCommand<string | null>(['SET', 'wb:cron:warm-wb:lock', lockToken, 'NX', 'EX', 270])
  if (lockResult !== 'OK') {
    return NextResponse.json({ error: 'Cache warmup is already running' }, { status: 409 })
  }

  const startedAt = Date.now()
  const warmedDates: string[] = []
  const warmedSalesDates: string[] = []
  const cacheHitDates: string[] = []
  const salesCacheHitDates: string[] = []
  const rateLimitErrors: any[] = []
  let entrepreneurs = 0
  let ok = true
  let status = 200

  const requestRange = async (rangeFrom: string, rangeTo: string, target?: WbTarget, metric: 'orders' | 'sales' = 'orders') => {
    const url = new URL('/api/wb-data', baseUrl)
    url.searchParams.set('entrepreneurId', target ? String(target.id) : 'all')
    url.searchParams.set('section', 'daily')
    url.searchParams.set('dateFrom', rangeFrom)
    url.searchParams.set('dateTo', rangeTo)
    url.searchParams.set('complete', '1')
    url.searchParams.set('refresh', '1')
    if (metric === 'sales') url.searchParams.set('metric', 'sales')
    if (target) {
      url.searchParams.set('warmId', String(target.id))
    }

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'x-wb-internal-warm': internalToken,
      },
      signal: AbortSignal.timeout(210000),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      ok = false
      status = response.status
    }
    if (Array.isArray(json?.rateLimitErrors) && json.rateLimitErrors.length) {
      rateLimitErrors.push(...json.rateLimitErrors)
    }
    const dates = Array.isArray(json?.daily?.dates) ? json.daily.dates : []
    if (!json?.rateLimitErrors || json.rateLimitErrors.length === 0) {
      if (metric === 'sales') warmedSalesDates.push(...dates)
      else warmedDates.push(...dates)
    }
    if (json?.cacheSource === 'redis') {
      if (metric === 'sales') salesCacheHitDates.push(...dates)
      else cacheHitDates.push(...dates)
    }
    const dailyByEntrepreneur = json?.dailyByEntrepreneur && typeof json.dailyByEntrepreneur === 'object'
      ? Object.keys(json.dailyByEntrepreneur).length
      : 0
    entrepreneurs = Math.max(entrepreneurs, dailyByEntrepreneur)
    return {
      from: rangeFrom,
      to: rangeTo,
      metric,
      target: target ? { id: target.id, name: target.name } : { id: 0, name: 'admin' },
      ok: response.ok,
      status: response.status,
      cacheSource: json?.cacheSource || null,
      refreshed: true,
    }
  }

  const salesWarmDates = metricMode === 'sales' ? warmDates : []
  const batches: Array<Array<Awaited<ReturnType<typeof requestRange>>>> = []
  const metricTargets = metricMode === 'sales' ? salesTargets : allTargets
  const batch = scope === 'all'
    ? await Promise.all(metricTargets.map((target) => requestRange(warmDates[0], warmDates[warmDates.length - 1], target, metricMode)))
    : [await requestRange(warmDates[0], warmDates[warmDates.length - 1], undefined, metricMode)]
  batches.push(batch)

  await redisCommand<number>([
    'EVAL',
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    '1',
    'wb:cron:warm-wb:lock',
    lockToken,
  ])

  return NextResponse.json({
    warmedAt: new Date().toISOString(),
    moscowSchedule: '07:00',
    scope,
    metricMode,
    period: { from, to },
    section: 'daily',
    warmedSections: metricMode === 'sales' ? ['daily-sales'] : ['daily'],
    ok,
    status,
    durationMs: Date.now() - startedAt,
    dates: [...new Set(warmedDates)].sort(),
    salesDates: [...new Set(warmedSalesDates)].sort(),
    cacheHitDates: [...new Set(cacheHitDates)].sort(),
    salesCacheHitDates: [...new Set(salesCacheHitDates)].sort(),
    forceRefreshDates: warmDates,
    salesWarmDates,
    entrepreneurs,
    targets: scope === 'all' ? allTargets.map((target) => ({ id: target.id, name: target.name })) : 'admin',
    salesTargets: salesTargets.map((target) => ({ id: target.id, name: target.name })),
    rateLimitErrors,
    batches,
    redisProbe,
  })
}
