import { NextRequest, NextResponse } from 'next/server'
import { hasRedisConfig, redisCommand } from '@/lib/redis-cache'

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

function getMoscowDashboardWarmRange() {
  const mskNow = new Date(Date.now() + 3 * 3600000)
  const yesterday = new Date(mskNow.getTime() - 86400000)
  const warmStart = new Date(mskNow.getTime() - 14 * 86400000)
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
  const patterns = ['wb:daily:v1:*', 'wb:daily:v2:*']
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

  const { from, to } = getMoscowDashboardWarmRange()
  const warmDates = getDateRange(from, to)
  const redisPrune = await pruneOldDailyRedisKeys()
  const redisProbe = await probeRedis()

  const startedAt = Date.now()
  const warmedDates: string[] = []
  const cacheHitDates: string[] = []
  const rateLimitErrors: any[] = []
  let entrepreneurs = 0
  let ok = true
  let status = 200

  const requestDate = async (date: string) => {
    const url = new URL('/api/wb-data', baseUrl)
    url.searchParams.set('entrepreneurId', 'all')
    url.searchParams.set('section', 'daily')
    url.searchParams.set('dateFrom', date)
    url.searchParams.set('dateTo', date)

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
    return { date, ok: response.ok, status: response.status, cacheSource: json?.cacheSource || null }
  }

  const batches: Array<Array<{ date: string; ok: boolean; status: number; cacheSource: string | null }>> = []
  for (let offset = 0; offset < warmDates.length; offset += WARM_BATCH_SIZE) {
    const batchDates = warmDates.slice(offset, offset + WARM_BATCH_SIZE)
    const batch = await Promise.all(batchDates.map(requestDate))
    batches.push(batch)
    const batchFromRedis = batch.every((item) => item.cacheSource === 'redis')
    if (!batchFromRedis && offset + WARM_BATCH_SIZE < warmDates.length) {
      await sleep(WARM_BATCH_PAUSE_MS)
    }
  }

  return NextResponse.json({
    warmedAt: new Date().toISOString(),
    moscowSchedule: '08:30',
    period: { from, to },
    section: 'daily',
    ok,
    status,
    durationMs: Date.now() - startedAt,
    dates: warmedDates,
    cacheHitDates,
    entrepreneurs,
    rateLimitErrors,
    batches,
    redisPrune,
    redisProbe,
  })
}
