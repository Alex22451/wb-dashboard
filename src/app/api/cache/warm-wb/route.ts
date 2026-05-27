import { NextRequest, NextResponse } from 'next/server'
import { hasRedisConfig, redisCommand } from '@/lib/redis-cache'
import { getAllVercelWbTargets, type WbTarget } from '@/lib/user-store'

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

const WARM_BATCH_SIZE = 3
const WARM_BATCH_PAUSE_MS = 61_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

async function pruneOldDailyRedisKeys() {
  const patterns = ['wb:daily:v1:*', 'wb:daily:v2:*', 'wb:daily:v3:*']
  const deletedByPattern: Record<string, number> = {}
  let totalDeleted = 0

  for (const pattern of patterns) {
    let cursor = '0'
    let scanned = 0
    deletedByPattern[pattern] = 0

    do {
      const result = await redisCommand<[string, string[]]>(['SCAN', cursor, 'MATCH', pattern, 'COUNT', 100])
      if (!Array.isArray(result)) break
      cursor = String(result[0] || '0')
      const keys = Array.isArray(result[1]) ? result[1] : []
      scanned += keys.length
      if (keys.length) {
        const deleted = await redisCommand<number>(['DEL', ...keys])
        const count = Number(deleted || 0)
        deletedByPattern[pattern] += count
        totalDeleted += count
      }
    } while (cursor !== '0' && scanned < 1000)
  }

  return { totalDeleted, deletedByPattern }
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
  if (cronSecret) {
    const auth = request.headers.get('authorization') || ''
    const token = request.nextUrl.searchParams.get('secret') || ''
    if (auth !== `Bearer ${cronSecret}` && token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const baseUrl = getBaseUrl(request)
  const internalToken = process.env.WB_VERCEL_API_TOKEN
  if (!internalToken) {
    return NextResponse.json({ error: 'WB_VERCEL_API_TOKEN is required for cache warmup' }, { status: 500 })
  }

  const scope = request.nextUrl.searchParams.get('scope') === 'admin' ? 'admin' : 'all'
  const explicitDate = request.nextUrl.searchParams.get('date') || ''
  const requestedDays = Number(request.nextUrl.searchParams.get('periodDays') || (scope === 'all' ? 30 : 14))
  const periodDays = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.floor(requestedDays), 1), 30) : (scope === 'all' ? 30 : 14)
  const { from, to } = getMoscowDashboardWarmRange(periodDays)
  const warmDates = explicitDate ? [explicitDate] : getDateRange(from, to)
  const allTargets = scope === 'all' ? await getAllVercelWbTargets() : []
  const redisPrune = await pruneOldDailyRedisKeys()
  const redisProbe = await probeRedis()

  const startedAt = Date.now()
  const warmedDates: string[] = []
  const cacheHitDates: string[] = []
  const rateLimitErrors: any[] = []
  const adWarmups: Array<{ days: number; from: string; to: string; ok: boolean; status: number; totalSpend: number; errors: any[] }> = []
  const monthlyWarmups: Array<{ ok: boolean; status: number; cacheSource: string | null; months: number; errors: any[] }> = []
  const productionWarmups: Array<{ days: number; from: string; to: string; ok: boolean; status: number; cacheSource: string | null; dates: number; errors: any[] }> = []
  let entrepreneurs = 0
  let ok = true
  let status = 200

  const requestDate = async (date: string, target?: WbTarget) => {
    const url = new URL('/api/wb-data', baseUrl)
    url.searchParams.set('entrepreneurId', target ? String(target.id) : 'all')
    url.searchParams.set('section', 'daily')
    url.searchParams.set('dateFrom', date)
    url.searchParams.set('dateTo', date)
    if (target) {
      url.searchParams.set('warmId', String(target.id))
      url.searchParams.set('warmName', target.name)
      url.searchParams.set('warmApiKey', target.wbApiKey)
    }

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'x-wb-internal-warm': internalToken,
      },
      signal: AbortSignal.timeout(120000),
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
    if (dates.includes(date) && (!json?.rateLimitErrors || json.rateLimitErrors.length === 0)) {
      warmedDates.push(date)
    }
    if (json?.cacheSource === 'redis') {
      cacheHitDates.push(date)
    }
    const dailyByEntrepreneur = json?.dailyByEntrepreneur && typeof json.dailyByEntrepreneur === 'object'
      ? Object.keys(json.dailyByEntrepreneur).length
      : 0
    entrepreneurs = Math.max(entrepreneurs, dailyByEntrepreneur)
    return {
      date,
      target: target ? { id: target.id, name: target.name } : { id: 0, name: 'admin' },
      ok: response.ok,
      status: response.status,
      cacheSource: json?.cacheSource || null,
    }
  }

  const requestAdPeriod = async (days: number) => {
    const range = getMoscowDashboardWarmRange(days)
    const url = new URL('/api/ad-spend', baseUrl)
    url.searchParams.set('entrepreneurId', 'all')
    url.searchParams.set('scope', scope)
    url.searchParams.set('from', range.from)
    url.searchParams.set('to', range.to)

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'x-wb-internal-warm': internalToken,
      },
      signal: AbortSignal.timeout(180000),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      ok = false
      status = response.status
    }
    if (Array.isArray(json?.errors) && json.errors.length) {
      rateLimitErrors.push(...json.errors)
    }
    return {
      days,
      from: range.from,
      to: range.to,
      ok: response.ok,
      status: response.status,
      totalSpend: Number(json?.totalSpend || 0),
      errors: Array.isArray(json?.errors) ? json.errors : [],
    }
  }

  const requestMonthly = async () => {
    const url = new URL('/api/wb-data', baseUrl)
    url.searchParams.set('entrepreneurId', 'all')
    url.searchParams.set('section', 'monthly')
    url.searchParams.set('refresh', '1')

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'x-wb-internal-warm': internalToken,
      },
      signal: AbortSignal.timeout(240000),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      ok = false
      status = response.status
    }
    if (Array.isArray(json?.rateLimitErrors) && json.rateLimitErrors.length) {
      rateLimitErrors.push(...json.rateLimitErrors)
    }
    return {
      ok: response.ok,
      status: response.status,
      cacheSource: json?.cacheSource || null,
      months: Array.isArray(json?.monthly?.months) ? json.monthly.months.length : 0,
      errors: Array.isArray(json?.rateLimitErrors) ? json.rateLimitErrors : [],
    }
  }

  const requestProductionPeriod = async (days: number) => {
    const range = getMoscowDashboardWarmRange(days)
    const url = new URL('/api/wb-data', baseUrl)
    url.searchParams.set('entrepreneurId', 'all')
    url.searchParams.set('section', 'production')
    url.searchParams.set('dateFrom', range.from)
    url.searchParams.set('dateTo', range.to)
    url.searchParams.set('capacity', '2500')
    url.searchParams.set('refresh', '1')

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'x-wb-internal-warm': internalToken,
      },
      signal: AbortSignal.timeout(240000),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      ok = false
      status = response.status
    }
    if (Array.isArray(json?.rateLimitErrors) && json.rateLimitErrors.length) {
      rateLimitErrors.push(...json.rateLimitErrors)
    }
    return {
      days,
      from: range.from,
      to: range.to,
      ok: response.ok,
      status: response.status,
      cacheSource: json?.cacheSource || null,
      dates: Array.isArray(json?.production?.dates) ? json.production.dates.length : 0,
      errors: Array.isArray(json?.rateLimitErrors) ? json.rateLimitErrors : [],
    }
  }

  const batches: Array<Array<{ date: string; target: { id: number; name: string }; ok: boolean; status: number; cacheSource: string | null }>> = []
  const batchSize = scope === 'all' ? 1 : WARM_BATCH_SIZE
  for (let offset = 0; offset < warmDates.length; offset += batchSize) {
    const batchDates = warmDates.slice(offset, offset + batchSize)
    const batch = scope === 'all'
      ? (await Promise.all(batchDates.flatMap((date) => allTargets.map((target) => requestDate(date, target)))))
      : await Promise.all(batchDates.map((date) => requestDate(date)))
    batches.push(batch)
    const batchFromRedis = batch.every((item) => item.cacheSource === 'redis')
    if (!batchFromRedis && offset + batchSize < warmDates.length) {
      await sleep(WARM_BATCH_PAUSE_MS)
    }
  }

  if (!explicitDate) {
    monthlyWarmups.push(await requestMonthly())
    for (const days of [7, 14, 30]) {
      productionWarmups.push(await requestProductionPeriod(days))
    }
    for (const days of [7, 14, 30]) {
      adWarmups.push(await requestAdPeriod(days))
    }
  }

  return NextResponse.json({
    warmedAt: new Date().toISOString(),
    moscowSchedule: '08:30',
    scope,
    period: { from, to },
    section: 'daily',
    warmedSections: explicitDate ? ['daily'] : ['daily', 'monthly', 'production', 'ads'],
    ok,
    status,
    durationMs: Date.now() - startedAt,
    dates: warmedDates,
    cacheHitDates,
    entrepreneurs,
    targets: scope === 'all' ? allTargets.map((target) => ({ id: target.id, name: target.name })) : 'admin',
    rateLimitErrors,
    batches,
    monthlyWarmups,
    productionWarmups,
    adWarmups,
    redisPrune,
    redisProbe,
  })
}
