import { PrismaClient } from '@prisma/client'
import { pbkdf2Sync, randomBytes } from 'crypto'

const db = new PrismaClient({ log: ['warn', 'error'] })
const PASSWORD_ITERATIONS = 120000
const PASSWORD_KEYLEN = 32
const PASSWORD_DIGEST = 'sha256'

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function validateUsername(username: string): string | null {
  const value = normalizeUsername(username)
  if (value.length < 3 || value.length > 32) return 'Ник должен быть от 3 до 32 символов'
  if (!/^[a-zа-яё0-9._-]+$/iu.test(value)) return 'В нике можно использовать буквы, цифры, точку, дефис и подчёркивание'
  return null
}

function validatePassword(password: string): string | null {
  if (password.length < 6) return 'Пароль должен быть не короче 6 символов'
  if (password.length > 128) return 'Пароль слишком длинный'
  return null
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url')
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('base64url')
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`
}

async function main() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME || process.argv[2] || 'admin')
  const password = process.env.ADMIN_PASSWORD || process.argv[3]

  if (!password) {
    console.error('Usage: ADMIN_PASSWORD=strong-password node --experimental-strip-types scripts/create-admin.ts [username]')
    process.exit(1)
  }

  const usernameError = validateUsername(username)
  if (usernameError) throw new Error(usernameError)
  const passwordError = validatePassword(password)
  if (passwordError) throw new Error(passwordError)

  const passwordHash = hashPassword(password)
  const existing = await db.$queryRaw<Array<{ id: number }>>`SELECT id FROM User WHERE username = ${username} LIMIT 1`

  if (existing.length) {
    await db.$executeRaw`UPDATE User SET passwordHash = ${passwordHash}, role = 'admin' WHERE username = ${username}`
    console.log(`Admin updated: ${username}`)
  } else {
    await db.$executeRaw`INSERT INTO User (username, passwordHash, role) VALUES (${username}, ${passwordHash}, 'admin')`
    console.log(`Admin created: ${username}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
