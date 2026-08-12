import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InternalRequestError,
  readInternalJsonBody,
  validateInternalSecret,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './internal-request-auth.ts'

test('internal secret validation accepts only the exact non-empty secret', () => {
  assert.equal(validateInternalSecret('correct', 'correct'), true)
  assert.equal(validateInternalSecret('wrong', 'correct'), false)
  assert.equal(validateInternalSecret('', 'correct'), false)
  assert.equal(validateInternalSecret(null, 'correct'), false)
  assert.equal(validateInternalSecret('correct', ''), false)
})

test('internal JSON reader rejects a declared oversized body before parsing', async () => {
  const request = new Request('http://localhost/internal', {
    method: 'POST',
    headers: { 'content-length': '11' },
    body: '{"ok":true}',
  })
  await assert.rejects(
    readInternalJsonBody(request, 10),
    (error: unknown) => error instanceof InternalRequestError && error.status === 413,
  )
})

test('internal JSON reader measures UTF-8 bytes and rejects malformed JSON', async () => {
  const unicodeRequest = new Request('http://localhost/internal', {
    method: 'POST',
    body: JSON.stringify({ value: 'я' }),
  })
  await assert.rejects(
    readInternalJsonBody(unicodeRequest, 10),
    (error: unknown) => error instanceof InternalRequestError && error.status === 413,
  )

  const malformedRequest = new Request('http://localhost/internal', { method: 'POST', body: '{' })
  await assert.rejects(
    readInternalJsonBody(malformedRequest),
    (error: unknown) => error instanceof InternalRequestError && error.status === 400,
  )
})
