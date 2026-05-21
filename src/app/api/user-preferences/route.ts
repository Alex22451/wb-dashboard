import { getCurrentUser, unauthorized } from '@/lib/auth'
import { getUserPreferences, hasUserStore, saveUserPreferences } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'

const OPTIONAL_TABS = ['daily', 'production', 'supply', 'monthly', 'ads', 'growth', 'compare'] as const
const DEFAULT_VISIBLE_TABS = [...OPTIONAL_TABS]

function normalizeVisibleTabs(value: unknown, isAdmin: boolean): string[] {
  if (!Array.isArray(value)) return DEFAULT_VISIBLE_TABS.filter((tab) => isAdmin || tab !== 'compare')

  const allowed = new Set<string>(OPTIONAL_TABS)
  const result = value
    .filter((tab): tab is string => typeof tab === 'string' && allowed.has(tab))
    .filter((tab) => isAdmin || tab !== 'compare')

  return [...new Set(result)]
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const defaults = normalizeVisibleTabs(DEFAULT_VISIBLE_TABS, user.role === 'admin')
  if (!hasUserStore()) return NextResponse.json({ preferences: { visibleTabs: defaults } })

  const stored = await getUserPreferences(user.id).catch(() => null)
  return NextResponse.json({
    preferences: {
      visibleTabs: normalizeVisibleTabs(stored?.visibleTabs || defaults, user.role === 'admin'),
    },
  })
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  if (!hasUserStore()) {
    return NextResponse.json({ error: 'Постоянное хранилище настроек не настроено' }, { status: 501 })
  }

  const body = await request.json()
  const preferences = {
    visibleTabs: normalizeVisibleTabs(body.visibleTabs, user.role === 'admin'),
  }

  await saveUserPreferences(user.id, preferences)
  return NextResponse.json({ preferences })
}
