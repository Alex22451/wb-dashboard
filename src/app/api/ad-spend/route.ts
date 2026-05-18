import { db } from '@/lib/db'
import { isVercel, getEntrepreneurs, getAdSpends } from '@/lib/entrepreneurs-config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // On Vercel, use config-based data directly (no DB)
    if (isVercel()) {
      const entrepreneurs = getEntrepreneurs().map((e) => ({ id: e.id, name: e.name }))
      const adSpendsData = getAdSpends()

      // Flatten and filter for 2026 (or latest year available)
      const grouped: Record<number, { entrepreneur: string; budget: number; months: { month: number; actual: number }[] }> = {}
      for (const [entIdStr, entries] of Object.entries(adSpendsData)) {
        const entId = Number(entIdStr)
        const ent = entrepreneurs.find((e) => e.id === entId)
        if (!ent) continue

        const yearEntries = (entries as Array<{ year: number; month: number; budget: number; actual: number }>).filter((e) => e.year === 2026)
        if (yearEntries.length === 0) continue

        grouped[entId] = {
          entrepreneur: ent.name,
          budget: yearEntries[0]?.budget || 0,
          months: yearEntries
            .filter((e) => e.actual && e.actual > 0)
            .map((e) => ({ month: e.month, actual: e.actual })),
        }
      }

      return NextResponse.json({ entrepreneurs, grouped })
    }

    // Local development: use Prisma SQLite
    const adSpends = await db.$queryRawUnsafe<Array<{
      entrepreneurId: number
      entrepreneurName: string
      year: number
      month: number
      budget: number | null
      actual: number | null
    }>>(`
      SELECT a.entrepreneurId, e.name as entrepreneurName, a.year, a.month, a.budget, a.actual
      FROM AdSpend a
      JOIN Entrepreneur e ON a.entrepreneurId = e.id
      WHERE a.year = 2026
      ORDER BY a.year, a.month
    `)

    const entrepreneurs = await db.$queryRawUnsafe<Array<{ id: number; name: string }>>(
      `SELECT id, name FROM Entrepreneur ORDER BY id`
    )

    // Group by entrepreneur
    const grouped: Record<number, { entrepreneur: string; budget: number; months: { month: number; actual: number }[] }> = {}
    adSpends.forEach((a) => {
      if (!grouped[a.entrepreneurId]) {
        grouped[a.entrepreneurId] = {
          entrepreneur: a.entrepreneurName,
          budget: a.budget || 0,
          months: [],
        }
      }
      if (a.actual && a.actual > 0) {
        grouped[a.entrepreneurId].months.push({ month: a.month, actual: a.actual })
      }
    })

    return NextResponse.json({ entrepreneurs, grouped })
  } catch (error) {
    console.error('Ad spend API error:', error)
    return NextResponse.json({ error: 'Failed to load ad spend data' }, { status: 500 })
  }
}
