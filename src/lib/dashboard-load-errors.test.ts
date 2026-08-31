import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDashboardDateLoadFailure,
  createDashboardLoadFailure,
  normalizeDashboardLoadErrors,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './dashboard-load-errors.ts'

test('unexpected dashboard failures become a fixed visible message without leaking details', () => {
  const failure = createDashboardLoadFailure(new Error('secret upstream URL and token'))

  assert.deepEqual(failure, {
    id: 0,
    name: 'WB Analytics',
    error: 'Не удалось загрузить аналитику. Повторите попытку.',
  })
})

test('failed date recovery ignores raw API error details', () => {
  const failure = createDashboardDateLoadFailure('2026-08-30', 'secret upstream URL and token')

  assert.deepEqual(failure, {
    id: 0,
    name: 'WB Analytics',
    error: 'Не удалось загрузить данные за 2026-08-30. Повторите попытку.',
  })
})

test('visible dashboard errors replace untrusted API details and remove duplicates', () => {
  assert.deepEqual(normalizeDashboardLoadErrors([
    { id: 11, name: 'Seller 11', error: 'secret upstream URL and token' },
    { id: 11, name: 'Seller 11', error: 'another raw upstream detail' },
    { id: 12, name: 'Seller 12', error: 'raw WB response body' },
  ]), [
    { id: 11, name: 'Seller 11', error: 'Не удалось загрузить данные WB. Повторите попытку.' },
    { id: 12, name: 'Seller 12', error: 'Не удалось загрузить данные WB. Повторите попытку.' },
  ])
})
