import { db } from '@/lib/db'
import { isVercel, getEntrepreneurs } from '@/lib/entrepreneurs-config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // On Vercel, use config-based data directly (no DB)
    if (isVercel()) {
      const entrepreneurs = getEntrepreneurs()
      const result = entrepreneurs.map((e) => ({
        id: e.id,
        name: e.name,
        wbApiKey: e.apiKey || null,
        totalOrders: 0,
        hasApiKey: !!e.apiKey,
      }))
      return NextResponse.json(result)
    }

    // Local development: use Prisma SQLite
    const entrepreneurs = await db.$queryRawUnsafe<Array<{
      id: number
      name: string
      wbApiKey: string | null
      totalOrders: bigint
    }>>(`
      SELECT e.id, e.name, e.wbApiKey,
        COALESCE(SUM(do_q.quantity), 0) as totalOrders
      FROM Entrepreneur e
      LEFT JOIN DailyOrder do_q ON e.id = do_q.entrepreneurId AND do_q.date >= '2026-01-01' AND do_q.date < '2027-01-01'
      GROUP BY e.id, e.name, e.wbApiKey
      ORDER BY e.id
    `)

    const result = entrepreneurs.map((e) => ({
      id: e.id,
      name: e.name,
      wbApiKey: e.wbApiKey,
      totalOrders: Number(e.totalOrders),
      hasApiKey: !!e.wbApiKey,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Entrepreneurs API error:', error)
    return NextResponse.json({ error: 'Failed to load entrepreneurs' }, { status: 500 })
  }
}
