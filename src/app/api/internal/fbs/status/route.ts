import { FbsBotSnapshotSchema } from '@/lib/fbs-bot-contract'
import { saveFbsBotSnapshot } from '@/lib/fbs-bot-store'
import {
  InternalRequestError,
  readInternalJsonBody,
  validateInternalSecret,
} from '@/lib/internal-request-auth'
import { NextRequest, NextResponse } from 'next/server'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS })
}

export async function POST(request: NextRequest) {
  if (!validateInternalSecret(
    request.headers.get('x-fbs-bot-secret'),
    process.env.FBS_DASHBOARD_SHARED_SECRET,
  )) {
    return jsonError('Unauthorized', 401)
  }

  try {
    const body = await readInternalJsonBody(request)
    const parsed = FbsBotSnapshotSchema.safeParse(body)
    if (!parsed.success) return jsonError('Invalid status snapshot', 400)

    await saveFbsBotSnapshot(parsed.data)
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof InternalRequestError) return jsonError(error.message, error.status)
    return jsonError('Status storage is unavailable', 503)
  }
}
