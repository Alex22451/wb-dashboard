/**
 * Database module with auto-detection
 *
 * When VERCEL env var is set → uses db-vercel (env-based, no SQLite)
 * Otherwise → uses Prisma SQLite (local development)
 */

import { isVercel } from './entrepreneurs-config'

// Lazy initialization — avoids require() at module level
let _db: any = null

function getDb() {
  if (_db) return _db

  if (isVercel()) {
    // Vercel: use env-var-based data layer (no SQLite)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { db: vercelDb } = require('./db-vercel')
    _db = vercelDb
  } else {
    // Local development: use Prisma SQLite
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client')
    const globalForPrisma = globalThis as unknown as {
      prisma: any
    }
    _db = globalForPrisma.prisma ??
      new PrismaClient({
        log: ['warn', 'error'],
      })
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db
  }

  return _db
}

// Export a proxy that lazily initializes on first access
export const db = new Proxy({} as any, {
  get(_target, prop) {
    const actualDb = getDb()
    const value = actualDb[prop]
    if (typeof value === 'function') {
      return value.bind(actualDb)
    }
    return value
  },
})
