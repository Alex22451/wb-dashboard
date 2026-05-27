import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { isVercel } from '@/lib/entrepreneurs-config'
import { getVercelEntrepreneursForUser } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null
  if (key.length <= 8) return '********'
  return `${key.slice(0, 4)}********${key.slice(-4)}`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    const includeAngelina = user.role === 'admin' && request.nextUrl.searchParams.get('includeAngelina') === '1'

    // On Vercel, use config-based data directly (no DB)
    if (isVercel()) {
      const entrepreneurs = await getVercelEntrepreneursForUser(user, { includeAdminAngelina: includeAngelina })
      const result = entrepreneurs.map((e) => ({
        id: e.id,
        name: e.name,
        wbApiKey: maskApiKey(e.wbApiKey),
        totalOrders: 0,
        hasApiKey: !!e.wbApiKey,
      }))
      return NextResponse.json(result)
    }

    // Local development: use Prisma SQLite
    const whereClause = user.role === 'admin' ? '' : `WHERE e.userId = ${user.id}`
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
      ${whereClause}
      GROUP BY e.id, e.name, e.wbApiKey
      ORDER BY e.id
    `)

    const result = entrepreneurs.map((e) => ({
      id: e.id,
      name: e.name,
      wbApiKey: maskApiKey(e.wbApiKey),
      totalOrders: Number(e.totalOrders),
      hasApiKey: !!e.wbApiKey,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Entrepreneurs API error:', error)
    return NextResponse.json({ error: 'Failed to load entrepreneurs' }, { status: 500 })
  }
}
