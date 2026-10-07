/**
 * Entrepreneurs Configuration Module
 *
 * On Vercel: reads entrepreneur data from ENTREPRENEURS env var (JSON)
 * On local dev: falls back to entrepreneurs.json file, then to Prisma DB
 */

export interface EntrepreneurConfig {
  id: number
  name: string
  apiKey: string
  promotionApiKey?: string
}

export interface AdSpendEntry {
  year: number
  month: number
  budget: number
  actual: number
}

/** Check if running on Vercel */
export function isVercel(): boolean {
  return !!process.env.VERCEL
}

// Cached data
let _entrepreneursCache: EntrepreneurConfig[] | null = null
let _adSpendsCache: Record<string, AdSpendEntry[]> | null = null

function readEntrepreneursJson(): EntrepreneurConfig[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path')
    const jsonPath = path.join(process.cwd(), 'entrepreneurs.json')
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
      if (data.entrepreneurs && Array.isArray(data.entrepreneurs)) {
        return data.entrepreneurs
      }
    }
  } catch {
    // File not found or parse error, fall through
  }
  return []
}

function normalizeEntrepreneurs(items: EntrepreneurConfig[]): EntrepreneurConfig[] {
  return items.filter((item) => item.name !== 'Боев Ф.В.')
}

/** Get entrepreneurs from env var or JSON file */
export function getEntrepreneurs(): EntrepreneurConfig[] {
  if (_entrepreneursCache) return _entrepreneursCache

  const fileEntrepreneurs = readEntrepreneursJson()

  // 1. Try ENTREPRENEURS env var. The repository config is authoritative for
  // active entrepreneurs and keys; env can only fill missing values for matching names.
  const envData = process.env.ENTREPRENEURS
  if (envData) {
    try {
      const envEntrepreneurs = normalizeEntrepreneurs(JSON.parse(envData))
      if (fileEntrepreneurs.length > 0) {
        const envByName = new Map(envEntrepreneurs.map((item) => [item.name, item]))
        _entrepreneursCache = normalizeEntrepreneurs(fileEntrepreneurs).map((item) => {
          const envItem = envByName.get(item.name)
          return {
            ...item,
            apiKey: item.apiKey || envItem?.apiKey || '',
            promotionApiKey: item.promotionApiKey || envItem?.promotionApiKey,
          }
        })
      } else {
        _entrepreneursCache = envEntrepreneurs
      }
      return _entrepreneursCache
    } catch (e) {
      console.error('Failed to parse ENTREPRENEURS env var:', e)
    }
  }

  // 2. Try entrepreneurs.json (for local dev without DB)
  if (fileEntrepreneurs.length > 0) {
    _entrepreneursCache = normalizeEntrepreneurs(fileEntrepreneurs)
    return _entrepreneursCache
  }

  // 3. Empty fallback
  _entrepreneursCache = []
  return _entrepreneursCache
}

/** Get ad spend data from env var or JSON file */
export function getAdSpends(): Record<string, AdSpendEntry[]> {
  if (_adSpendsCache) return _adSpendsCache

  // 1. Try AD_SPENDS env var
  const envData = process.env.AD_SPENDS
  if (envData) {
    try {
      _adSpendsCache = JSON.parse(envData)
      return _adSpendsCache!
    } catch (e) {
      console.error('Failed to parse AD_SPENDS env var:', e)
    }
  }

  // 2. Try entrepreneurs.json
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path')
    const jsonPath = path.join(process.cwd(), 'entrepreneurs.json')
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
      if (data.adSpends) {
        _adSpendsCache = data.adSpends
        return _adSpendsCache!
      }
    }
  } catch {
    // File not found or parse error
  }

  _adSpendsCache = {}
  return _adSpendsCache
}
