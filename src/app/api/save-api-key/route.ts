import { db } from '@/lib/db'
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth'
import { isVercel } from '@/lib/entrepreneurs-config'
import { clearUserApiKey, saveUserApiKeys } from '@/lib/user-store'
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

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // On Vercel, API keys are managed via environment variables, not the database
  if (isVercel()) {
    if (user.role === 'admin') {
      return NextResponse.json({
        error: 'Админские ключи на Vercel настраиваются через ENTREPRENEURS. Пользовательские ключи сохраняются в аккаунте пользователя.',
        vercel: true,
      }, { status: 400 })
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

  // On Vercel, API keys are managed via environment variables, not the database
  if (isVercel()) {
    if (user.role === 'admin') {
      return NextResponse.json({ error: 'Админские ключи на Vercel настраиваются через ENTREPRENEURS' }, { status: 400 })
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
