import { db } from '@/lib/db'
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth'
import { getEntrepreneurs, isVercel } from '@/lib/entrepreneurs-config'
import { haveSameWbSellerIdentity } from '@/lib/wb-api-key'
import { clearAdminWbApiKeyOverride, clearUserApiKey, saveAdminWbApiKeyOverride, saveUserApiKeys } from '@/lib/user-store'
import { NextRequest, NextResponse } from 'next/server'

function extractSellerName(payload: unknown): string | null {
  const root = payload && typeof payload === 'object' ? payload as Record<string, any> : null
  const source = root?.data && typeof root.data === 'object' ? root.data as Record<string, any> : root
  const value = source?.name || source?.sellerName || source?.supplierName || source?.tradeMark
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function fetchWbSellerName(apiKey: string): Promise<string | null> {
  const token = apiKey.trim()
  if (!token) return null

  const authVariants = token.toLowerCase().startsWith('bearer ')
    ? [token, token.replace(/^bearer\s+/i, '')]
    : [`Bearer ${token}`, token]

  for (const authorization of authVariants) {
    try {
      const response = await fetch('https://common-api.wildberries.ru/api/v1/seller-info', {
        headers: { Authorization: authorization },
        cache: 'no-store',
      })
      if (!response.ok) continue
      return extractSellerName(await response.json())
    } catch {
      // Try the next auth format.
    }
  }

  return null
}

async function validateWbOrdersKey(apiKey: string): Promise<{ analytics: boolean; statistics: boolean }> {
  const token = apiKey.trim().replace(/^bearer\s+/i, '').trim()
  const ping = async (url: string) => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: token },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })
      return response.ok
    } catch {
      return false
    }
  }
  const [analytics, statistics] = await Promise.all([
    ping('https://seller-analytics-api.wildberries.ru/ping'),
    ping('https://statistics-api.wildberries.ru/ping'),
  ])
  return { analytics, statistics }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // On Vercel, admin rotations are stored as server-side Redis overrides.
  if (isVercel()) {
    if (user.role === 'admin') {
      try {
        const body = await request.json()
        const entrepreneurId = Number(body?.entrepreneurId)
        const apiKey = typeof body?.apiKey === 'string'
          ? body.apiKey.trim().replace(/^bearer\s+/i, '').trim()
          : ''
        if (!Number.isFinite(entrepreneurId) || entrepreneurId <= 0 || !apiKey) {
          return NextResponse.json({ error: 'Выберите ИП и введите ключ WB' }, { status: 400 })
        }

        const entrepreneur = getEntrepreneurs().find((item) => item.id === entrepreneurId)
        if (!entrepreneur?.apiKey) {
          return NextResponse.json({ error: 'ИП не найден в админской конфигурации' }, { status: 404 })
        }
        if (!haveSameWbSellerIdentity(entrepreneur.apiKey, apiKey)) {
          return NextResponse.json({ error: 'Ключ выпущен для другого кабинета WB' }, { status: 400 })
        }

        const access = await validateWbOrdersKey(apiKey)
        if (!access.analytics || !access.statistics) {
          return NextResponse.json({
            error: 'Ключ не прошёл проверку Analytics и Statistics',
            access,
          }, { status: 400 })
        }

        await saveAdminWbApiKeyOverride(entrepreneurId, apiKey)
        return NextResponse.json({ success: true, entrepreneurId, access })
      } catch {
        console.error('Save admin WB API key override failed')
        return NextResponse.json({ error: 'Не удалось сохранить ключ WB' }, { status: 500 })
      }
    }

    try {
      const body = await request.json()
      const { apiKey, promotionApiKey } = body
      if (!apiKey && !promotionApiKey) {
        return NextResponse.json({ error: 'Введите хотя бы один API ключ' }, { status: 400 })
      }
      const normalizedApiKey = apiKey ? String(apiKey).trim() : undefined
      const normalizedPromotionApiKey = promotionApiKey ? String(promotionApiKey).trim() : undefined
      const sellerName = normalizedApiKey
        ? await fetchWbSellerName(normalizedApiKey)
        : normalizedPromotionApiKey
          ? await fetchWbSellerName(normalizedPromotionApiKey)
          : null
      await saveUserApiKeys(user.id, {
        apiKey: normalizedApiKey,
        promotionApiKey: normalizedPromotionApiKey,
        sellerName: sellerName || undefined,
      })
      return NextResponse.json({ success: true, entrepreneurId: user.id, sellerName })
    } catch (error) {
      console.error('Save Vercel API key error:', error)
      return NextResponse.json({ error: 'Ошибка сохранения API ключа' }, { status: 500 })
    }
  }

  try {
    const body = await request.json()
    const { entrepreneurId, apiKey, promotionApiKey } = body

    if (!entrepreneurId || (!apiKey && !promotionApiKey)) {
      return NextResponse.json({ error: 'entrepreneurId и хотя бы один API ключ обязательны' }, { status: 400 })
    }

    const entId = Number(entrepreneurId)

    // Verify entrepreneur exists
    const entResult = await db.$queryRawUnsafe<Array<{ id: number; userId: number | null }>>(
      `SELECT id, userId FROM Entrepreneur WHERE id = ${entId}`
    )

    if (!entResult.length) {
      return NextResponse.json({ error: 'ИП не найден' }, { status: 404 })
    }
    if (user.role !== 'admin' && entResult[0].userId !== user.id) return forbidden()

    // Update API key using parameterized query to prevent corruption and SQL injection
    if (apiKey) {
      const normalizedApiKey = String(apiKey).trim()
      const sellerName = await fetchWbSellerName(normalizedApiKey)
      if (sellerName && user.role !== 'admin') {
        await db.$executeRaw`UPDATE Entrepreneur SET name = ${sellerName}, wbApiKey = ${normalizedApiKey} WHERE id = ${entId}`
      } else {
        await db.$executeRaw`UPDATE Entrepreneur SET wbApiKey = ${normalizedApiKey} WHERE id = ${entId}`
      }
    }
    if (promotionApiKey) {
      await db.$executeRaw`UPDATE Entrepreneur SET wbPromotionApiKey = ${String(promotionApiKey).trim()} WHERE id = ${entId}`
    }

    return NextResponse.json({ success: true, entrepreneurId: entId })
  } catch (error) {
    console.error('Save API key error:', error)
    return NextResponse.json({ error: 'Ошибка сохранения API ключа' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // On Vercel, an admin DELETE reverts the Redis override to repository config.
  if (isVercel()) {
    if (user.role === 'admin') {
      const entrepreneurId = Number(request.nextUrl.searchParams.get('entrepreneurId'))
      const entrepreneur = getEntrepreneurs().find((item) => item.id === entrepreneurId)
      if (!entrepreneur) return NextResponse.json({ error: 'ИП не найден' }, { status: 404 })
      try {
        await clearAdminWbApiKeyOverride(entrepreneurId)
        return NextResponse.json({ success: true, entrepreneurId, reverted: true })
      } catch {
        console.error('Clear admin WB API key override failed')
        return NextResponse.json({ error: 'Не удалось вернуть ключ из основной конфигурации' }, { status: 500 })
      }
    }
    await clearUserApiKey(user.id)
    return NextResponse.json({ success: true, entrepreneurId: user.id })
  }

  try {
    const { searchParams } = request.nextUrl
    const entrepreneurId = searchParams.get('entrepreneurId')

    if (!entrepreneurId) {
      return NextResponse.json({ error: 'entrepreneurId обязателен' }, { status: 400 })
    }

    const entId = Number(entrepreneurId)

    const entResult = await db.$queryRawUnsafe<Array<{ id: number; userId: number | null }>>(
      `SELECT id, userId FROM Entrepreneur WHERE id = ${entId}`
    )
    if (!entResult.length) return NextResponse.json({ error: 'ИП не найден' }, { status: 404 })
    if (user.role !== 'admin' && entResult[0].userId !== user.id) return forbidden()

    await db.$executeRaw`UPDATE Entrepreneur SET wbApiKey = NULL WHERE id = ${entId}`

    return NextResponse.json({ success: true, entrepreneurId: entId })
  } catch (error) {
    console.error('Delete API key error:', error)
    return NextResponse.json({ error: 'Ошибка удаления API ключа' }, { status: 500 })
  }
}
