/**
 * Vercel-compatible database layer
 *
 * Provides a Prisma-compatible interface using environment variables
 * instead of SQLite. Used when VERCEL env var is set.
 *
 * Supported $queryRawUnsafe queries:
 * - SELECT ... FROM Entrepreneur ...
 * - SELECT ... FROM AdSpend ... JOIN Entrepreneur ...
 */

import { getEntrepreneurs, getAdSpends } from './entrepreneurs-config'

interface EntrepreneurRow {
  id: number
  name: string
  wbApiKey: string | null
  totalOrders: number
}

interface AdSpendRow {
  entrepreneurId: number
  entrepreneurName: string
  year: number
  month: number
  budget: number | null
  actual: number | null
}

/**
 * Vercel DB — implements $queryRawUnsafe and $executeRaw
 * that route SQL-like queries to in-memory config data
 */
export const db = {
  async $queryRawUnsafe<T = any>(sql: string): Promise<T[]> {
    const sqlLower = sql.toLowerCase().trim()

    // ─── SELECT from Entrepreneur ───
    if (sqlLower.includes('from entrepreneur') && !sqlLower.includes('join')) {
      const entrepreneurs = getEntrepreneurs()

      if (sqlLower.includes('wbapikey is not null') || sqlLower.includes("wbapikey != ''")) {
        // Query: entrepreneurs with API keys (used by wb-data)
        return entrepreneurs
          .filter(e => e.apiKey && e.apiKey.trim() !== '')
          .map(e => ({
            id: e.id,
            name: e.name,
            wbApiKey: e.apiKey,
          })) as T[]
      }

      if (sqlLower.includes('sum') || sqlLower.includes('count')) {
        // Query: entrepreneurs with order counts (used by entrepreneurs list)
        return entrepreneurs.map(e => ({
          id: e.id,
          name: e.name,
          wbApiKey: e.apiKey || null,
          totalOrders: BigInt(0),
        })) as T[]
      }

      // Simple SELECT: all entrepreneurs
      return entrepreneurs.map(e => ({
        id: e.id,
        name: e.name,
        wbApiKey: e.apiKey || null,
      })) as T[]
    }

    // ─── SELECT from AdSpend JOIN Entrepreneur ───
    if (sqlLower.includes('from adspend') || sqlLower.includes('join entrepreneur')) {
      const entrepreneurs = getEntrepreneurs()
      const adSpends = getAdSpends()

      // Extract year filter from SQL
      const yearMatch = sqlLower.match(/where\s+.*year\s*=\s*(\d{4})/)
      const filterYear = yearMatch ? parseInt(yearMatch[1]) : 2026

      const rows: AdSpendRow[] = []
      for (const [entIdStr, entries] of Object.entries(adSpends)) {
        const entId = Number(entIdStr)
        const ent = entrepreneurs.find(e => e.id === entId)
        if (!ent) continue

        for (const entry of entries as Array<{ year: number; month: number; budget: number; actual: number }>) {
          if (entry.year === filterYear) {
            rows.push({
              entrepreneurId: entId,
              entrepreneurName: ent.name,
              year: entry.year,
              month: entry.month,
              budget: entry.budget || null,
              actual: entry.actual || null,
            })
          }
        }
      }

      return rows as T[]
    }

    // Unknown query — return empty
    console.warn('db-vercel: unrecognized query:', sql.substring(0, 100))
    return [] as T[]
  },

  async $executeRaw(strings: TemplateStringsArray, ...values: any[]): Promise<number> {
    // On Vercel, writes are not supported (read-only env vars)
    console.warn('db-vercel: $executeRaw called but writes not supported on Vercel')
    return 0
  },
}
