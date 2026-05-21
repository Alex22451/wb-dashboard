import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'

const PASSWORD_ITERATIONS = 120000
const PASSWORD_KEYLEN = 32
const PASSWORD_DIGEST = 'sha256'

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function validateUsername(username: string): string | null {
  const value = normalizeUsername(username)
  if (value.length < 3 || value.length > 32) return 'Ник должен быть от 3 до 32 символов'
  if (!/^[a-zа-яё0-9._-]+$/iu.test(value)) return 'В нике можно использовать буквы, цифры, точку, дефис и подчёркивание'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'Пароль должен быть не короче 6 символов'
  if (password.length > 128) return 'Пароль слишком длинный'
  return null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url')
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('base64url')
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, iterationsRaw, salt, hash] = storedHash.split('$')
  if (scheme !== 'pbkdf2' || !iterationsRaw || !salt || !hash) return false
  const iterations = Number(iterationsRaw)
  if (!Number.isFinite(iterations) || iterations < 1) return false
  const candidate = pbkdf2Sync(password, salt, iterations, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('base64url')
  return safeEqual(candidate, hash)
}
