import { db } from '@/lib/db'
import { isVercel } from '@/lib/entrepreneurs-config'
import { hashPassword, normalizeUsername, setSessionCookie, validatePassword, validateUsername } from '@/lib/auth'
import { createStoredUser, hasUserStore } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = normalizeUsername(String(body.username || ''))
    const password = String(body.password || '')

    const usernameError = validateUsername(username)
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 })

    const passwordError = validatePassword(password)
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 })

    if (isVercel()) {
      if (!hasUserStore()) {
        return NextResponse.json({
          error: 'Постоянная база пользователей не настроена. Нужны Redis KV или Edge Config переменные.',
        }, { status: 501 })
      }

      const passwordHash = hashPassword(password)
      const user = await createStoredUser(username, passwordHash)
      const response = NextResponse.json({ user: { id: user.id, username: user.username, role: user.role } })
      setSessionCookie(response, user.id)
      return response
    }

    const existing = await db.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM User WHERE username = ? LIMIT 1`,
      username
    )
    if (existing.length) return NextResponse.json({ error: 'Этот ник уже занят' }, { status: 409 })

    const passwordHash = hashPassword(password)
    await db.$executeRaw`INSERT INTO User (username, passwordHash, role) VALUES (${username}, ${passwordHash}, 'user')`
    const created = await db.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM User WHERE username = ? LIMIT 1`,
      username
    )
    const userId = created[0]?.id
    if (!userId) return NextResponse.json({ error: 'Не удалось создать пользователя' }, { status: 500 })

    await db.$executeRaw`INSERT INTO Entrepreneur (name, userId) VALUES (${username}, ${userId})`

    const response = NextResponse.json({ user: { id: userId, username, role: 'user' } })
    setSessionCookie(response, userId)
    return response
  } catch (error: any) {
    if (error?.message === 'USERNAME_TAKEN' || String(error?.message || '').includes('Unique constraint')) {
      return NextResponse.json({ error: 'Этот ник уже занят' }, { status: 409 })
    }
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Ошибка регистрации' }, { status: 500 })
  }
}
