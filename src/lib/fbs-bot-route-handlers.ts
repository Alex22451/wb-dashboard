import {
  FBS_BOT_CONTRACT_VERSION,
  FbsBotFleetStatusResponseSchema,
  FbsBotSnapshotSchema,
  FbsClassifyRequestSchema,
  FbsClassifyResponseSchema,
  type FbsBotSnapshot,
  type FbsClassification,
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
} from './fbs-bot-contract.ts'
import {
  FbsBotFutureSnapshotError,
  FbsBotStaleSnapshotError,
  FbsBotStoreError,
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
} from './fbs-bot-store.ts'
import {
  InternalRequestError,
  readInternalJsonBody,
  validateInternalSecret,
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
} from './internal-request-auth.ts'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: NO_STORE_HEADERS })
}

interface ClassifyDependencies {
  expectedSecret: string | undefined
  getMappingVersion: () => string
  classify: (input: { subject: string; article: string; brand: string }) => FbsClassification
}

interface StatusPostDependencies {
  expectedSecret: string | undefined
  saveSnapshot: (input: FbsBotSnapshot) => Promise<FbsBotSnapshot>
}

interface StatusGetDependencies {
  getCurrentUser: () => Promise<{ role: string } | null>
  loadSnapshots: () => Promise<FbsBotSnapshot[]>
}

export async function handleFbsClassifyPost(
  request: Request,
  dependencies: ClassifyDependencies,
): Promise<Response> {
  try {
    if (!validateInternalSecret(
      request.headers.get('x-fbs-bot-secret'),
      dependencies.expectedSecret,
    )) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const body = await readInternalJsonBody(request)
    const parsed = FbsClassifyRequestSchema.safeParse(body)
    if (!parsed.success) return json({ error: 'Invalid classification request' }, 400)

    const response = FbsClassifyResponseSchema.parse({
      contractVersion: FBS_BOT_CONTRACT_VERSION,
      mappingVersion: dependencies.getMappingVersion(),
      items: parsed.data.items.map(item => ({
        requestId: item.requestId,
        nmId: item.nmId,
        classification: dependencies.classify(item),
      })),
    })
    return json(response)
  } catch (error) {
    if (error instanceof InternalRequestError) return json({ error: error.message }, error.status)
    return json({ error: 'Internal server error' }, 500)
  }
}

export async function handleFbsStatusPost(
  request: Request,
  dependencies: StatusPostDependencies,
): Promise<Response> {
  try {
    if (!validateInternalSecret(
      request.headers.get('x-fbs-bot-secret'),
      dependencies.expectedSecret,
    )) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const body = await readInternalJsonBody(request)
    const parsed = FbsBotSnapshotSchema.safeParse(body)
    if (!parsed.success) return json({ error: 'Invalid status snapshot' }, 400)

    await dependencies.saveSnapshot(parsed.data)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof InternalRequestError) return json({ error: error.message }, error.status)
    if (error instanceof FbsBotStaleSnapshotError) return json({ error: 'Stale status snapshot' }, 409)
    if (error instanceof FbsBotFutureSnapshotError) return json({ error: 'Invalid status snapshot' }, 400)
    if (error instanceof FbsBotStoreError) return json({ error: 'Status storage is unavailable' }, 503)
    return json({ error: 'Internal server error' }, 500)
  }
}

export async function handleFbsBotStatusGet(
  dependencies: StatusGetDependencies,
): Promise<Response> {
  let user: { role: string } | null
  try {
    user = await dependencies.getCurrentUser()
  } catch {
    return json({ error: 'Internal server error' }, 500)
  }

  if (user?.role !== 'admin') return json({ error: 'Недостаточно прав' }, 403)

  try {
    return json(FbsBotFleetStatusResponseSchema.parse({
      snapshots: await dependencies.loadSnapshots(),
    }))
  } catch (error) {
    if (error instanceof FbsBotStoreError) {
      return json({ error: 'Status storage is unavailable' }, 503)
    }
    return json({ error: 'Internal server error' }, 500)
  }
}
