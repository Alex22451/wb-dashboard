import { createHash } from 'node:crypto'

export interface WbApiKeyTarget {
  id: number
  wbApiKey: string
  useCategoryMapping?: boolean
  useConfiguredOrderMapping?: boolean
  dailyCacheFallbackWbApiKey?: string
  dailyCacheFallbackUseCategoryMapping?: boolean
  dailyCacheFallbackFingerprints?: string[]
}

export interface WbApiKeyOverrideRecord {
  apiKey: string
  updatedAt?: string
  previousCacheFingerprints?: string[]
}

export function shouldUseConfiguredCategoryMapping(
  target: { useCategoryMapping?: boolean; useConfiguredOrderMapping?: boolean },
): boolean {
  return target.useCategoryMapping === true || target.useConfiguredOrderMapping === true
}

function normalizedToken(token: string): string {
  return token.trim().replace(/^bearer\s+/i, '').trim()
}

export function getWbApiKeyFingerprint(token: string): string {
  return createHash('sha256').update(normalizedToken(token)).digest('hex').slice(0, 16)
}

function normalizeCacheFingerprints(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values
    .filter((value): value is string => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value)))]
    .slice(-4)
}

export function rollWbApiKeyOverride(
  current: WbApiKeyOverrideRecord | null,
  apiKey: string,
  updatedAt = new Date().toISOString(),
): WbApiKeyOverrideRecord {
  const normalized = normalizedToken(apiKey)
  const currentFingerprint = current?.apiKey ? getWbApiKeyFingerprint(current.apiKey) : null
  const nextFingerprint = getWbApiKeyFingerprint(normalized)
  const previousCacheFingerprints = normalizeCacheFingerprints([
    ...(current?.previousCacheFingerprints || []),
    ...(currentFingerprint && currentFingerprint !== nextFingerprint ? [currentFingerprint] : []),
  ])
  return {
    apiKey: normalized,
    updatedAt,
    ...(previousCacheFingerprints.length > 0 ? { previousCacheFingerprints } : {}),
  }
}

function readJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const normalized = token.trim().replace(/^bearer\s+/i, '').trim()
    const payload = normalized.split('.')[1]
    if (!payload) return null
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function getWbSellerIdentity(token: string): string | null {
  const payload = readJwtPayload(token)
  const sellerId = typeof payload?.sid === 'string' ? payload.sid.trim() : ''
  return sellerId || null
}

export function getWbTargetIdentity(token: string): string {
  const sellerId = getWbSellerIdentity(token)
  if (sellerId) return `seller:${sellerId}`
  return `token:${token.trim().replace(/^bearer\s+/i, '').trim()}`
}

export function getWbTokenTtlSeconds(token: string, nowEpochSeconds = Math.floor(Date.now() / 1000)): number | null {
  const payload = readJwtPayload(token)
  const expiresAt = Number(payload?.exp)
  if (!Number.isFinite(expiresAt) || expiresAt <= nowEpochSeconds) return null
  return Math.floor(expiresAt - nowEpochSeconds)
}

export function haveSameWbSellerIdentity(currentToken: string, replacementToken: string): boolean {
  const currentSellerId = getWbSellerIdentity(currentToken)
  const replacementSellerId = getWbSellerIdentity(replacementToken)
  return !!currentSellerId && currentSellerId === replacementSellerId
}

export function applyWbApiKeyOverrides<T extends WbApiKeyTarget>(
  targets: T[],
  overrides: Map<number, string | WbApiKeyOverrideRecord>,
): T[] {
  return targets.map((target) => {
    const rawOverride = overrides.get(target.id)
    const override = (typeof rawOverride === 'string' ? rawOverride : rawOverride?.apiKey)?.trim()
    if (!override || !haveSameWbSellerIdentity(target.wbApiKey, override)) return target
    const fallbackFingerprints = typeof rawOverride === 'string'
      ? []
      : normalizeCacheFingerprints(rawOverride?.previousCacheFingerprints)
    return {
      ...target,
      wbApiKey: override,
      dailyCacheFallbackWbApiKey: target.dailyCacheFallbackWbApiKey || target.wbApiKey,
      dailyCacheFallbackUseCategoryMapping: target.dailyCacheFallbackWbApiKey
        ? target.dailyCacheFallbackUseCategoryMapping
        : target.useCategoryMapping,
      ...(fallbackFingerprints.length > 0
        ? { dailyCacheFallbackFingerprints: fallbackFingerprints }
        : {}),
    }
  })
}
