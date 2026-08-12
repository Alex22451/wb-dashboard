import { getCurrentUser, unauthorized } from '@/lib/auth'
import { normalizeDashboardTabPreferences } from '@/lib/dashboard-tab-preferences'
import { getUserPreferences, hasUserStore, saveUserPreferences } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const isAdmin = user.role === 'admin'
  if (!hasUserStore()) {
    return NextResponse.json({ preferences: normalizeDashboardTabPreferences(undefined, isAdmin) })
  }

  const stored = await getUserPreferences(user.id).catch(() => null)
  return NextResponse.json({
    preferences: normalizeDashboardTabPreferences(stored, isAdmin),
  })
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  if (!hasUserStore()) {
    return NextResponse.json({ error: 'Постоянное хранилище настроек не настроено' }, { status: 501 })
  }

  const body = await request.json()
  const preferences = normalizeDashboardTabPreferences(body, user.role === 'admin')

  await saveUserPreferences(user.id, preferences)
  return NextResponse.json({ preferences })
}
