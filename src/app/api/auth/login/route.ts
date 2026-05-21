import { db } from '@/lib/db'
import { normalizeUsername, setSessionCookie, validatePassword, validateUsername, verifyPassword } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = normalizeUsername(String(body.username || ''))
    const password = String(body.password || '')

    const usernameError = validateUsername(username)
    if (usernameError) return NextResponse.json({ error: 'Неверный ник или пароль' }, { status: 401 })

    const passwordError = validatePassword(password)
    if (passwordError) return NextResponse.json({ error: 'Неверный ник или пароль' }, { status: 401 })

    const rows = await db.$queryRawUnsafe<Array<{ id: number; username: string; passwordHash: string; role: string }>>(
      `SELECT id, username, passwordHash, role FROM User WHERE username = ? LIMIT 1`,
      username
    )
    const user = rows[0]
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Неверный ник или пароль' }, { status: 401 })
    }

    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role === 'admin' ? 'admin' : 'user' },
    })
    setSessionCookie(response, user.id)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Ошибка входа' }, { status: 500 })
  }
}
