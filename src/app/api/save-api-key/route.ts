import { db } from '@/lib/db'
import { isVercel } from '@/lib/entrepreneurs-config'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // On Vercel, API keys are managed via environment variables, not the database
  if (isVercel()) {
    return NextResponse.json({
      error: 'На Vercel API ключи настраиваются через переменные окружения (ENTREPRENEURS). Измените ENTREPRENEURS в настройках проекта Vercel.',
      vercel: true,
    }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { entrepreneurId, apiKey } = body

    if (!entrepreneurId || !apiKey) {
      return NextResponse.json({ error: 'entrepreneurId и apiKey обязательны' }, { status: 400 })
    }

    const entId = Number(entrepreneurId)

    // Verify entrepreneur exists
    const entResult = await db.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM Entrepreneur WHERE id = ${entId}`
    )

    if (!entResult.length) {
      return NextResponse.json({ error: 'ИП не найден' }, { status: 404 })
    }

    // Update API key using parameterized query to prevent corruption and SQL injection
    await db.$executeRaw`UPDATE Entrepreneur SET wbApiKey = ${apiKey} WHERE id = ${entId}`

    return NextResponse.json({ success: true, entrepreneurId: entId })
  } catch (error) {
    console.error('Save API key error:', error)
    return NextResponse.json({ error: 'Ошибка сохранения API ключа' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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

    await db.$executeRaw`UPDATE Entrepreneur SET wbApiKey = NULL WHERE id = ${entId}`

    return NextResponse.json({ success: true, entrepreneurId: entId })
  } catch (error) {
    console.error('Delete API key error:', error)
    return NextResponse.json({ error: 'Ошибка удаления API ключа' }, { status: 500 })
  }
}
