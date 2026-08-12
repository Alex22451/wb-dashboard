import { createHash, timingSafeEqual } from 'node:crypto'

export const MAX_INTERNAL_REQUEST_BYTES = 256 * 1024

export class InternalRequestError extends Error {
  readonly status: 400 | 413

  constructor(message: string, status: 400 | 413) {
    super(message)
    this.name = 'InternalRequestError'
    this.status = status
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function validateInternalSecret(
  receivedSecret: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  const received = receivedSecret || ''
  const expected = expectedSecret || ''
  const matches = timingSafeEqual(digest(received), digest(expected))
  return received.length > 0 && expected.length > 0 && matches
}

export async function readInternalJsonBody(
  request: Request,
  maxBytes = MAX_INTERNAL_REQUEST_BYTES,
): Promise<unknown> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new InternalRequestError('Request body is too large', 413)
  }

  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ''

  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > maxBytes) {
        await reader.cancel()
        throw new InternalRequestError('Request body is too large', 413)
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
  }

  try {
    return JSON.parse(body)
  } catch {
    throw new InternalRequestError('Request body must be valid JSON', 400)
  }
}
