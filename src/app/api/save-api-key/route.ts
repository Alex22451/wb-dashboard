import { db } from '@/lib/db'
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth'
import { isVercel } from '@/lib/entrepreneurs-config'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  // On Vercel, API keys are managed via environment variables, not the database
  if (isVercel()) {
    return NextResponse.json({
      error: 'На Vercel API ключи настраиваются через переменные окружения (ENTREPRENEURS). Измените ENTREPRENEURS в настройках проекта Vercel.',
      vercel: true,
    }, { status: 400 })
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
      await db.$executeRaw`UPDATE Entrepreneur SET wbApiKey = ${String(apiKey).trim()} WHERE id = ${entId}`
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
    return NextResponse.json({
      error: 'На Vercel API ключи настраиваются через переменные окружения (ENTREPRENEURS). Измените ENTREPRENEURS в настройках проекта Vercel.',
      vercel: true,
    }, { status: 400 })
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
