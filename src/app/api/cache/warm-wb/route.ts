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
  })
}
