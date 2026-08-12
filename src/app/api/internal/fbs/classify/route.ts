import {
  FBS_BOT_CONTRACT_VERSION,
  FbsClassifyRequestSchema,
  FbsClassifyResponseSchema,
} from '@/lib/fbs-bot-contract'
import {
  InternalRequestError,
  readInternalJsonBody,
  validateInternalSecret,
} from '@/lib/internal-request-auth'
import { classifyFbsProduct, getWbMappingVersion } from '@/lib/wb-mapping'
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
    const parsed = FbsClassifyRequestSchema.safeParse(body)
    if (!parsed.success) return jsonError('Invalid classification request', 400)

    const response = FbsClassifyResponseSchema.parse({
      contractVersion: FBS_BOT_CONTRACT_VERSION,
      mappingVersion: getWbMappingVersion(),
      items: parsed.data.items.map(item => ({
        requestId: item.requestId,
        nmId: item.nmId,
        classification: classifyFbsProduct(item),
      })),
    })
    return NextResponse.json(response, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof InternalRequestError) return jsonError(error.message, error.status)
    return jsonError('Invalid classification request', 400)
  }
}
