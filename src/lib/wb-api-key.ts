import { createHash } from 'node:crypto'

export interface WbApiKeyTarget {
  id: number
  wbApiKey: string
  useCategoryMapping?: boolean
  dailyCacheFallbackWbApiKey?: string
  dailyCacheFallbackUseCategoryMapping?: boolean
}

function normalizedToken(token: string): string {
  return token.trim().replace(/^bearer\s+/i, '').trim()
}

export function getWbApiKeyFingerprint(token: string): string {
  return createHash('sha256').update(getWbTargetIdentity(token)).digest('hex').slice(0, 16)
}

export function getWbApiKeyFingerprintCandidates(token: string): string[] {
  const stableFingerprint = getWbApiKeyFingerprint(token)
  const legacyFingerprint = createHash('sha256').update(normalizedToken(token)).digest('hex').slice(0, 16)
  return [...new Set([stableFingerprint, legacyFingerprint])]
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
  overrides: Map<number, string>,
): T[] {
  return targets.map((target) => {
    const override = overrides.get(target.id)?.trim()
    if (!override || !haveSameWbSellerIdentity(target.wbApiKey, override)) return target
    return {
      ...target,
      wbApiKey: override,
      useCategoryMapping: true,
      dailyCacheFallbackWbApiKey: target.dailyCacheFallbackWbApiKey || target.wbApiKey,
      dailyCacheFallbackUseCategoryMapping: target.dailyCacheFallbackWbApiKey
        ? target.dailyCacheFallbackUseCategoryMapping
        : target.useCategoryMapping,
    }
  })
}
