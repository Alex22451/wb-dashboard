import { NextRequest, NextResponse } from 'next/server'

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

function getMoscowWeekRange() {
  const mskNow = new Date(Date.now() + 3 * 3600000)
  const yesterday = new Date(mskNow.getTime() - 86400000)
  const weekStart = new Date(mskNow.getTime() - 7 * 86400000)
  return {
    from: weekStart.toISOString().split('T')[0],
    to: yesterday.toISOString().split('T')[0],
  }
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

  const { from, to } = getMoscowWeekRange()
  const redisPrune = await pruneOldDailyRedisKeys()
  const url = new URL('/api/wb-data', baseUrl)
  url.searchParams.set('entrepreneurId', 'all')
  url.searchParams.set('section', 'daily')
  url.searchParams.set('dateFrom', from)
  url.searchParams.set('dateTo', to)

  const startedAt = Date.now()
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'x-wb-internal-warm': internalToken,
    },
    signal: AbortSignal.timeout(290000),
  })
  const json = await response.json().catch(() => ({}))
  const dates = Array.isArray(json?.daily?.dates) ? json.daily.dates : []
  const dailyByEntrepreneur = json?.dailyByEntrepreneur && typeof json.dailyByEntrepreneur === 'object'
    ? Object.keys(json.dailyByEntrepreneur).length
    : 0

  return NextResponse.json({
    warmedAt: new Date().toISOString(),
    moscowSchedule: '08:30',
    period: { from, to },
    section: 'daily',
    ok: response.ok,
    status: response.status,
    durationMs: Date.now() - startedAt,
    dates,
    entrepreneurs: dailyByEntrepreneur,
    rateLimitErrors: json?.rateLimitErrors || [],
    redisPrune,
  })
}
