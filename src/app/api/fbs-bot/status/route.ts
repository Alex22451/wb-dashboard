import { getCurrentUser } from '@/lib/auth'
import { getFbsBotSnapshot } from '@/lib/fbs-bot-store'
import { NextResponse } from 'next/server'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

export async function GET() {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') {
    return NextResponse.json(
      { error: 'Недостаточно прав' },
      { status: 403, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const snapshot = await getFbsBotSnapshot()
    return NextResponse.json({ snapshot }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json(
      { error: 'Хранилище статуса недоступно' },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
}
