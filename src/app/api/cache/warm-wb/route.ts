import { NextRequest, NextResponse } from 'next/server'

const WARM_SECTIONS = ['dashboard', 'supply']

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
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
  const results = await Promise.allSettled(
    WARM_SECTIONS.map(async (section) => {
      const url = new URL('/api/wb-data', baseUrl)
      url.searchParams.set('entrepreneurId', 'all')
      url.searchParams.set('section', section)
      if (section === 'supply') {
        url.searchParams.set('supplyDays', '14')
        url.searchParams.set('coefficient', '1')
      }

      const response = await fetch(url, { cache: 'no-store' })
      return { section, ok: response.ok, status: response.status }
    })
  )

  return NextResponse.json({
    warmedAt: new Date().toISOString(),
    results: results.map((result, index) => (
      result.status === 'fulfilled'
        ? result.value
        : { section: WARM_SECTIONS[index], ok: false, error: result.reason?.message || 'Warmup failed' }
    )),
  })
}
