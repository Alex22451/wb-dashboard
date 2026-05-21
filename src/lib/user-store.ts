import type { CurrentUser } from './auth'
import { getEntrepreneurs } from './entrepreneurs-config'

export interface StoredUser {
  id: number
  username: string
  passwordHash: string
  role: 'user'
  createdAt: string
}

export interface UserApiKeys {
  apiKey: string | null
  promotionApiKey: string | null
  sellerName: string | null
}

export interface UserPreferences {
  visibleTabs: string[]
}

export interface WbTarget {
  id: number
  name: string
  wbApiKey: string
  wbPromotionApiKey?: string | null
}

export interface FunnelProductsCacheEntry {
  products: any[]
  cachedAt: string
}

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

function getEdgeConfig() {
  const edgeConfigId = process.env.WB_USERS_EDGE_CONFIG_ID || process.env.EDGE_CONFIG_ID
  const token = process.env.WB_VERCEL_API_TOKEN || process.env.VERCEL_API_TOKEN
  const teamId = process.env.WB_VERCEL_TEAM_ID || process.env.VERCEL_TEAM_ID
  if (!edgeConfigId || !token || !teamId) return null
  return { edgeConfigId, token, teamId }
}

export function hasUserStore(): boolean {
  return !!getRedisConfig() || !!getEdgeConfig()
}

async function redisCommand<T = unknown>(command: unknown[]): Promise<T> {
  const config = getRedisConfig()
  if (!config) throw new Error('KV_REST_API_URL/KV_REST_API_TOKEN не настроены')

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Redis ${response.status}: ${body.slice(0, 160)}`)
  }

  const json = await response.json()
  if (json.error) throw new Error(String(json.error))
  return json.result as T
}

async function edgeRequest<T = unknown>(path: string, init?: RequestInit): Promise<T | null> {
  const config = getEdgeConfig()
  if (!config) throw new Error('EDGE_CONFIG_ID/VERCEL_API_TOKEN/VERCEL_TEAM_ID не настроены')

  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`https://api.vercel.com${path}${separator}teamId=${config.teamId}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  if (response.status === 404 || response.status === 204) return null
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Edge Config ${response.status}: ${body.slice(0, 160)}`)
  }
  const body = await response.text()
  return body ? JSON.parse(body) : null
}

async function kvGet<T = string>(key: string): Promise<T | null> {
  if (getRedisConfig()) return redisCommand<T | null>(['GET', key])

  const config = getEdgeConfig()
  const item = await edgeRequest<{ value: T }>(`/v1/edge-config/${config!.edgeConfigId}/item/${encodeURIComponent(key)}`)
  return item ? item.value : null
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (getRedisConfig()) {
    await redisCommand(['SET', key, value])
    return
  }

  const config = getEdgeConfig()
  await edgeRequest(`/v1/edge-config/${config!.edgeConfigId}/items`, {
    method: 'PATCH',
    body: JSON.stringify({
      items: [{ operation: 'upsert', key, value }],
    }),
  })
}

async function kvSetNx(key: string, value: unknown): Promise<number> {
  if (getRedisConfig()) return redisCommand<number>(['SETNX', key, value])
  const existing = await kvGet(key)
  if (existing !== null) return 0
  await kvSet(key, value)
  return 1
}

async function kvIncr(key: string): Promise<number> {
  if (getRedisConfig()) return redisCommand<number>(['INCR', key])
  const current = Number(await kvGet<number | string>(key)) || 0
  const next = current + 1
  await kvSet(key, next)
  return next
}

function userKey(id: number) {
  return `wb_user_${id}`
}

function usernameKey(username: string) {
  const keyPart = Buffer.from(username).toString('base64url')
  return `wb_username_${keyPart}`
}

function apiKeysKey(id: number) {
  return `wb_user_${id}_api_keys`
}

function preferencesKey(id: number) {
  return `wb_user_${id}_preferences`
}

function funnelProductsKey(apiKeyFingerprint: string, date: string) {
  return `wb_funnel_products_${apiKeyFingerprint}_${date}`
}

export async function getStoredUserById(id: number): Promise<StoredUser | null> {
  const raw = await kvGet<string>(userKey(id))
  return raw ? JSON.parse(raw) : null
}

export async function getStoredUserByUsername(username: string): Promise<StoredUser | null> {
  const idRaw = await kvGet<string>(usernameKey(username))
  if (!idRaw) return null
  return getStoredUserById(Number(idRaw))
}

export async function createStoredUser(username: string, passwordHash: string): Promise<StoredUser> {
  const existing = await kvGet<string>(usernameKey(username))
  if (existing) throw new Error('USERNAME_TAKEN')

  const id = await kvIncr('wb_user_id')
  const user: StoredUser = {
    id,
    username,
    passwordHash,
    role: 'user',
    createdAt: new Date().toISOString(),
  }

  const created = await kvSetNx(usernameKey(username), String(id))
  if (created !== 1) throw new Error('USERNAME_TAKEN')

  await kvSet(userKey(id), JSON.stringify(user))
  return user
}

export async function getUserApiKeys(id: number): Promise<UserApiKeys> {
  const raw = await kvGet<string>(apiKeysKey(id))
  if (!raw) return { apiKey: null, promotionApiKey: null, sellerName: null }
  const parsed = JSON.parse(raw)
  return {
    apiKey: parsed.apiKey || null,
    promotionApiKey: parsed.promotionApiKey || null,
    sellerName: parsed.sellerName || null,
  }
}

export async function saveUserApiKeys(id: number, keys: Partial<UserApiKeys>): Promise<UserApiKeys> {
  const existing = await getUserApiKeys(id)
  const next = {
    apiKey: keys.apiKey !== undefined ? keys.apiKey : existing.apiKey,
    promotionApiKey: keys.promotionApiKey !== undefined ? keys.promotionApiKey : existing.promotionApiKey,
    sellerName: keys.sellerName !== undefined ? keys.sellerName : existing.sellerName,
  }
  await kvSet(apiKeysKey(id), JSON.stringify(next))
  return next
}

export async function clearUserApiKey(id: number): Promise<void> {
  const existing = await getUserApiKeys(id)
  await kvSet(apiKeysKey(id), JSON.stringify({ ...existing, apiKey: null, sellerName: null }))
}

export async function getUserPreferences(id: number): Promise<UserPreferences | null> {
  const raw = await kvGet<string>(preferencesKey(id))
  return raw ? JSON.parse(raw) : null
}

export async function saveUserPreferences(id: number, preferences: UserPreferences): Promise<UserPreferences> {
  await kvSet(preferencesKey(id), JSON.stringify(preferences))
  return preferences
}

export async function getCachedFunnelProducts(apiKeyFingerprint: string, date: string): Promise<FunnelProductsCacheEntry | null> {
  const raw = await kvGet<string>(funnelProductsKey(apiKeyFingerprint, date))
  return raw ? JSON.parse(raw) : null
}

export async function saveCachedFunnelProducts(apiKeyFingerprint: string, date: string, products: any[]): Promise<void> {
  await kvSet(funnelProductsKey(apiKeyFingerprint, date), JSON.stringify({
    products,
    cachedAt: new Date().toISOString(),
  }))
}

export async function getVercelEntrepreneursForUser(user: CurrentUser) {
  if (user.role === 'admin') {
    return getEntrepreneurs().map((e) => ({
      id: e.id,
      name: e.name,
      wbApiKey: e.apiKey || null,
      totalOrders: 0,
      hasApiKey: !!e.apiKey,
    }))
  }

  const keys = await getUserApiKeys(user.id)
  return [{
    id: user.id,
    name: keys.sellerName || user.username,
    wbApiKey: keys.apiKey,
    totalOrders: 0,
    hasApiKey: !!keys.apiKey,
  }]
}

export async function getVercelWbTargets(user: CurrentUser, entrepreneurId: string | null | undefined): Promise<WbTarget[]> {
  if (user.role === 'admin') {
    const rows = getEntrepreneurs()
      .filter((e) => e.apiKey && e.apiKey.trim() !== '')
      .map((e) => ({
        id: e.id,
        name: e.name,
        wbApiKey: e.apiKey,
        wbPromotionApiKey: e.promotionApiKey || e.apiKey,
      }))

    if (!entrepreneurId || entrepreneurId === 'all') return rows
    const ids = new Set(entrepreneurId.split(',').map((id) => Number(id.trim())).filter(Number.isFinite))
    return rows.filter((row) => ids.has(row.id))
  }

  const keys = await getUserApiKeys(user.id)
  if (!keys.apiKey) return []
  if (entrepreneurId && entrepreneurId !== 'all' && !entrepreneurId.split(',').includes(String(user.id))) return []
  return [{
    id: user.id,
    name: keys.sellerName || user.username,
    wbApiKey: keys.apiKey,
    wbPromotionApiKey: keys.promotionApiKey || keys.apiKey,
  }]
}
