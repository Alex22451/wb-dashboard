import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { normalizeUsername } from './password'
import { isVercel } from './entrepreneurs-config'
import { getStoredUserById } from './user-store'
export { hashPassword, normalizeUsername, validatePassword, validateUsername, verifyPassword } from './password'

const SESSION_COOKIE = 'wb_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

export interface CurrentUser {
  id: number
  username: string
  role: 'admin' | 'user'
}

function getAuthSecret(): string {
  return process.env.AUTH_SECRET || 'dev-only-change-this-secret'
}

export function getEnvAdminUser(): CurrentUser | null {
  const username = normalizeUsername(process.env.ADMIN_USERNAME || 'admin')
  if (!process.env.ADMIN_PASSWORD) return null
  return { id: 0, username, role: 'admin' }
}

export function isEnvAdminCredentials(username: string, password: string): boolean {
  const envPassword = process.env.ADMIN_PASSWORD
  if (!envPassword) return false
  const envUsername = normalizeUsername(process.env.ADMIN_USERNAME || 'admin')
  return normalizeUsername(username) === envUsername && safeEqual(password, envPassword)
}

function signPayload(payload: string): string {
  return createHmac('sha256', getAuthSecret()).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export function setSessionCookie(response: NextResponse, userId: number): void {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload = `${userId}.${expiresAt}`
  const token = `${payload}.${signPayload(payload)}`
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userIdRaw, expiresRaw, signature] = parts
  const payload = `${userIdRaw}.${expiresRaw}`
  if (!safeEqual(signPayload(payload), signature)) return null
  if (Number(expiresRaw) < Date.now()) return null

  if (userIdRaw === '0') return getEnvAdminUser()

  if (isVercel()) {
    const storedUser = await getStoredUserById(Number(userIdRaw)).catch(() => null)
    if (!storedUser) return null
    return {
      id: storedUser.id,
      username: storedUser.username,
      role: storedUser.role,
    }
  }

  const rows = await db.$queryRawUnsafe<Array<{ id: number; username: string; role: string }>>(
    `SELECT id, username, role FROM User WHERE id = ? LIMIT 1`,
    Number(userIdRaw)
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    role: row.role === 'admin' ? 'admin' : 'user',
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Требуется вход в аккаунт' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
}
