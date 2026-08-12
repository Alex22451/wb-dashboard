import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FbsBotSnapshotSchema,
  FbsClassifyRequestSchema,
  FbsClassifyResponseSchema,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './fbs-bot-contract.ts'

const classifyItem = {
  requestId: 'order-123',
  nmId: 123,
  subject: 'Гобелены',
  article: 'Гобелен_ДЮСПО',
  brand: '',
}

const snapshot = {
  contractVersion: 1,
  sellerId: 'zubakhina',
  generatedAt: '2026-08-12T12:00:00.000Z',
  phase: 'idle',
  lastRunAt: '2026-08-12T11:45:00.000Z',
  lastSuccessfulRunAt: '2026-08-12T11:45:10.000Z',
  nextDeliveryWindowAt: '2026-08-12T12:00:00.000Z',
  mappingVersion: null,
  mappingCacheUpdatedAt: null,
  counts: { new: 1, assigned: 2, ignored: 3, blocked: 4 },
  openSupplies: [{
    supplyId: 'WB-GI-1',
    name: '[AUTO] Гобелены ДЮСПО Курск 12.08 15:00',
    groupKey: 'group-1',
    orderCount: 2,
    nextDeliveryWindowAt: '2026-08-12T12:00:00.000Z',
    status: 'open',
  }],
  deliveredSupplies: [{
    supplyId: 'WB-GI-0',
    name: '[AUTO] Гобелены ДЮСПО Курск 12.08 10:00',
    orderCount: 1,
    deliveredAt: '2026-08-12T07:00:00.000Z',
  }],
  errors: [{
    code: 'MISSING_METADATA',
    reason: 'Карточка товара не содержит предмет',
    occurredAt: '2026-08-12T11:30:00.000Z',
    blocking: true,
    orderId: 456,
  }],
}

test('classification request accepts one to 100 sanitized items', () => {
  assert.equal(FbsClassifyRequestSchema.parse({ contractVersion: 1, items: [classifyItem] }).items.length, 1)
  assert.equal(FbsClassifyRequestSchema.parse({
    contractVersion: 1,
    items: Array.from({ length: 100 }, (_, index) => ({ ...classifyItem, requestId: `order-${index}` })),
  }).items.length, 100)
})

test('classification request rejects empty, oversized, and extra input', () => {
  assert.equal(FbsClassifyRequestSchema.safeParse({ contractVersion: 1, items: [] }).success, false)
  assert.equal(FbsClassifyRequestSchema.safeParse({
    contractVersion: 1,
    items: Array.from({ length: 101 }, (_, index) => ({ ...classifyItem, requestId: `order-${index}` })),
  }).success, false)
  assert.equal(FbsClassifyRequestSchema.safeParse({
    contractVersion: 1,
    items: [{ ...classifyItem, wbToken: 'must-not-cross-boundary' }],
  }).success, false)
})

test('classification response accepts every category outcome and rejects extra fields', () => {
  const response = {
    contractVersion: 1,
    mappingVersion: 'a'.repeat(64),
    items: [
      { requestId: '1', nmId: 1, classification: { kind: 'eligible', productType: 'гобелен', productDisplayName: 'Гобелены' } },
      { requestId: '2', nmId: 2, classification: { kind: 'ignored_blacklist' } },
      { requestId: '3', nmId: 3, classification: { kind: 'blocked_unknown_category' } },
    ],
  }
  assert.equal(FbsClassifyResponseSchema.parse(response).items.length, 3)
  assert.equal(FbsClassifyResponseSchema.safeParse({ ...response, wbToken: 'forbidden' }).success, false)
})

test('snapshot schema accepts the complete sanitized v1 shape', () => {
  assert.deepEqual(FbsBotSnapshotSchema.parse(snapshot), snapshot)
})

test('snapshot schema rejects PII, credentials, and unknown nested fields', () => {
  assert.equal(FbsBotSnapshotSchema.safeParse({ ...snapshot, wbToken: 'forbidden' }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    errors: [{ ...snapshot.errors[0], rawResponse: { supplierName: 'private' } }],
  }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    openSupplies: [{ ...snapshot.openSupplies[0], orders: [{ id: 1 }] }],
  }).success, false)
})

test('snapshot schema enforces collection and string bounds', () => {
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    errors: Array.from({ length: 201 }, () => snapshot.errors[0]),
  }).success, false)
  assert.equal(FbsBotSnapshotSchema.safeParse({
    ...snapshot,
    errors: [{ ...snapshot.errors[0], reason: 'x'.repeat(501) }],
  }).success, false)
})
