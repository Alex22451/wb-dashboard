import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await getCurrentUser()
  return NextResponse.json({ user })
}
