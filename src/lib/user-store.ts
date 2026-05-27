import type { CurrentUser } from './auth'
import { getEntrepreneurs } from './entrepreneurs-config'
import { hasRedisConfig, redisCommand } from './redis-cache'

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
  useCategoryMapping?: boolean
}

const REDIS_USER_ID_OFFSET = 100000

function getEdgeConfig() {
  const edgeConfigId = process.env.WB_USERS_EDGE_CONFIG_ID || process.env.EDGE_CONFIG_ID
  const token = process.env.WB_VERCEL_API_TOKEN || process.env.VERCEL_API_TOKEN
  const teamId = process.env.WB_VERCEL_TEAM_ID || process.env.VERCEL_TEAM_ID
  if (!edgeConfigId || !token || !teamId) return null
  return { edgeConfigId, token, teamId }
}

export function hasUserStore(): boolean {
  return hasRedisConfig() || !!getEdgeConfig()
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

async function edgeGet<T = unknown>(key: string): Promise<T | null> {
  const config = getEdgeConfig()
  if (!config) return null
  const item = await edgeRequest<{ value: T }>(`/v1/edge-config/${config.edgeConfigId}/item/${encodeURIComponent(key)}`)
  return item ? item.value : null
}

async function kvGet<T = string>(key: string): Promise<T | null> {
  if (hasRedisConfig()) {
    try {
      const redisValue = await redisCommand<T | null>(['GET', key])
      if (redisValue !== null && redisValue !== undefined) return redisValue
    } catch {
      // Fall back to Edge Config below.
    }
  }

  const config = getEdgeConfig()
  if (!config) return null
  const item = await edgeRequest<{ value: T }>(`/v1/edge-config/${config!.edgeConfigId}/item/${encodeURIComponent(key)}`)
  return item ? item.value : null
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasRedisConfig()) {
    try {
      const result = await redisCommand<string>(['SET', key, value])
      if (result) return
    } catch {
      // Fall back to Edge Config below.
    }
  }

  const config = getEdgeConfig()
  if (!config) throw new Error('KV_REST_API_URL/KV_REST_API_TOKEN или EDGE_CONFIG_ID/VERCEL_API_TOKEN/VERCEL_TEAM_ID не настроены')
  await edgeRequest(`/v1/edge-config/${config!.edgeConfigId}/items`, {
    method: 'PATCH',
    body: JSON.stringify({
      items: [{ operation: 'upsert', key, value }],
    }),
  })
}

async function kvSetNx(key: string, value: unknown): Promise<number> {
  if (hasRedisConfig()) {
    try {
      const result = await redisCommand<number>(['SETNX', key, value])
      if (result !== null && result !== undefined) return result
    } catch {
      // Fall back to Edge Config below.
    }
  }
  const existing = await kvGet(key)
  if (existing !== null) return 0
  await kvSet(key, value)
  return 1
}

async function kvIncr(key: string): Promise<number> {
  if (hasRedisConfig()) {
    try {
      const result = await redisCommand<number>(['INCR', key])
      if (result !== null && result !== undefined) return result
    } catch {
      // Fall back to Edge Config below.
    }
  }
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

export async function getStoredUserById(id: number): Promise<StoredUser | null> {
  if (id < REDIS_USER_ID_OFFSET && getEdgeConfig()) {
    const edgeRaw = await edgeGet<string | StoredUser>(userKey(id))
    if (edgeRaw) return typeof edgeRaw === 'string' ? JSON.parse(edgeRaw) : edgeRaw
  }
  const raw = await kvGet<string>(userKey(id))
  return raw ? JSON.parse(raw) : null
}

export async function getStoredUserByUsername(username: string): Promise<StoredUser | null> {
  if (getEdgeConfig()) {
    const edgeIdRaw = await edgeGet<string | number>(usernameKey(username))
    if (edgeIdRaw) return getStoredUserById(Number(edgeIdRaw))
  }
  const idRaw = await kvGet<string>(usernameKey(username))
  if (!idRaw) return null
  return getStoredUserById(Number(idRaw))
}

export async function createStoredUser(username: string, passwordHash: string): Promise<StoredUser> {
  const existing = await kvGet<string>(usernameKey(username))
  if (existing) throw new Error('USERNAME_TAKEN')

  const rawId = await kvIncr('wb_user_id')
  const id = rawId >= REDIS_USER_ID_OFFSET ? rawId : rawId + REDIS_USER_ID_OFFSET
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

function normalizeApiKey(apiKey: string) {
  return apiKey.trim().replace(/^bearer\s+/i, '').trim()
}

async function getAdminAngelinaTarget(): Promise<WbTarget | null> {
  let angelinaUser: StoredUser | null = null
  for (const username of ['Angelina', 'angelina']) {
    angelinaUser = await getStoredUserByUsername(username)
    if (angelinaUser) break
  }
  if (!angelinaUser) return null
  const keys = await getUserApiKeys(angelinaUser.id)
  if (!keys.apiKey?.trim()) return null
  return {
    id: 100000 + angelinaUser.id,
    name: keys.sellerName || angelinaUser.username,
    wbApiKey: keys.apiKey,
    wbPromotionApiKey: keys.promotionApiKey || keys.apiKey,
    useCategoryMapping: true,
  }
}

export async function getVercelEntrepreneursForUser(user: CurrentUser, options?: { includeAdminAngelina?: boolean }) {
  if (user.role === 'admin') {
    const rows = getEntrepreneurs().map((e) => ({
      id: e.id,
      name: e.name,
      wbApiKey: e.apiKey || null,
      totalOrders: 0,
      hasApiKey: !!e.apiKey,
    }))
    if (options?.includeAdminAngelina) {
      const angelinaTarget = await getAdminAngelinaTarget()
      if (angelinaTarget) {
        rows.push({
          id: angelinaTarget.id,
          name: angelinaTarget.name,
          wbApiKey: angelinaTarget.wbApiKey,
          totalOrders: 0,
          hasApiKey: true,
        })
      }
    }
    return rows
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

export async function getAllVercelWbTargets(): Promise<WbTarget[]> {
  const targets: WbTarget[] = getEntrepreneurs()
    .filter((e) => e.apiKey && e.apiKey.trim() !== '')
    .map((e) => ({
      id: e.id,
      name: e.name,
      wbApiKey: e.apiKey,
      wbPromotionApiKey: e.promotionApiKey || e.apiKey,
    }))

  const seen = new Set(targets.map((target) => normalizeApiKey(target.wbApiKey)))
  let maxUserId = 0
  try {
    maxUserId = Number(await kvGet<string | number>('wb_user_id')) || 0
  } catch {
    maxUserId = Number(await edgeGet<string | number>('wb_user_id')) || 0
  }
  for (let id = 1; id <= maxUserId; id += 1) {
    let user: StoredUser | null = null
    let keys: UserApiKeys | null = null
    try {
      user = await getStoredUserById(id)
      keys = await getUserApiKeys(id)
    } catch {
      const edgeUser = await edgeGet<string | StoredUser>(userKey(id))
      const edgeKeys = await edgeGet<string | UserApiKeys>(apiKeysKey(id))
      user = typeof edgeUser === 'string' ? JSON.parse(edgeUser) : edgeUser
      keys = typeof edgeKeys === 'string' ? JSON.parse(edgeKeys) : edgeKeys
    }
    if (!user) continue
    if (!keys?.apiKey) continue
    const normalized = normalizeApiKey(keys.apiKey)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    targets.push({
      id: 100000 + user.id,
      name: keys.sellerName || user.username,
      wbApiKey: keys.apiKey,
      wbPromotionApiKey: keys.promotionApiKey || keys.apiKey,
    })
  }

  return targets
}

export async function getVercelWbTargets(
  user: CurrentUser,
  entrepreneurId: string | null | undefined,
  options?: { includeAdminAngelina?: boolean },
): Promise<WbTarget[]> {
  if (user.role === 'admin') {
    const rows: WbTarget[] = getEntrepreneurs()
      .filter((e) => e.apiKey && e.apiKey.trim() !== '')
      .map((e) => ({
        id: e.id,
        name: e.name,
        wbApiKey: e.apiKey,
        wbPromotionApiKey: e.promotionApiKey || e.apiKey,
      }))
    if (options?.includeAdminAngelina) {
      const angelinaTarget = await getAdminAngelinaTarget()
      if (angelinaTarget) {
        const seen = new Set(rows.map((row) => normalizeApiKey(row.wbApiKey)))
        if (!seen.has(normalizeApiKey(angelinaTarget.wbApiKey))) rows.push(angelinaTarget)
      }
    }

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
