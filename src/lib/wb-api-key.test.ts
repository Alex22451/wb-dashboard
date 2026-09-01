import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWbApiKeyOverrides,
  getWbSellerIdentity,
  getWbTargetIdentity,
  getWbTokenTtlSeconds,
  haveSameWbSellerIdentity,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './wb-api-key.ts'

function token(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

test('accepts a replacement token only for the same WB seller identity', () => {
  assert.equal(haveSameWbSellerIdentity(
    token({ sid: 'seller-1', oid: 10 }),
    token({ sid: 'seller-1', oid: 10 }),
  ), true)
  assert.equal(haveSameWbSellerIdentity(
    token({ sid: 'seller-1', oid: 10 }),
    token({ sid: 'seller-2', oid: 10 }),
  ), false)
  assert.equal(haveSameWbSellerIdentity('invalid', token({ sid: 'seller-1' })), false)
  assert.equal(getWbSellerIdentity(token({ sid: 'seller-1' })), 'seller-1')
  assert.equal(getWbSellerIdentity(token({ oid: 10 })), null)
})

test('bounds an override lifetime by the signed token expiry claim', () => {
  assert.equal(getWbTokenTtlSeconds(token({ exp: 2_000 }), 1_000), 1_000)
  assert.equal(getWbTokenTtlSeconds(token({ exp: 1_050 }), 1_000), 50)
  assert.equal(getWbTokenTtlSeconds(token({ exp: 1_000 }), 1_000), null)
  assert.equal(getWbTokenTtlSeconds(token({}), 1_000), null)
})

test('deduplicates rotated tokens by seller identity instead of token text', () => {
  assert.equal(
    getWbTargetIdentity(token({ sid: 'seller-1', nonce: 'old' })),
    getWbTargetIdentity(token({ sid: 'seller-1', nonce: 'new' })),
  )
  assert.notEqual(
    getWbTargetIdentity(token({ sid: 'seller-1' })),
    getWbTargetIdentity(token({ sid: 'seller-2' })),
  )
})

test('applies only non-empty API key overrides to matching configured targets', () => {
  const oldToken = token({ sid: 'seller-1', nonce: 'old' })
  const newToken = token({ sid: 'seller-1', nonce: 'new' })
  const targets = [
    { id: 1, name: 'Seller 1', wbApiKey: oldToken, wbPromotionApiKey: 'promo-1' },
    { id: 2, name: 'Seller 2', wbApiKey: 'old-2', wbPromotionApiKey: 'promo-2' },
  ]
  assert.deepEqual(applyWbApiKeyOverrides(targets, new Map([
    [1, ` ${newToken} `],
    [2, '  '],
    [3, 'new-3'],
  ])), [
    {
      id: 1,
      name: 'Seller 1',
      wbApiKey: newToken,
      wbPromotionApiKey: 'promo-1',
      useCategoryMapping: true,
      dailyCacheFallbackWbApiKey: oldToken,
      dailyCacheFallbackUseCategoryMapping: undefined,
    },
    { id: 2, name: 'Seller 2', wbApiKey: 'old-2', wbPromotionApiKey: 'promo-2' },
  ])
})

test('ignores a persisted override when the configured seller identity changed', () => {
  const configured = token({ sid: 'seller-2', nonce: 'configured' })
  const staleOverride = token({ sid: 'seller-1', nonce: 'override' })
  const targets = [{ id: 1, wbApiKey: configured }]

  assert.deepEqual(applyWbApiKeyOverrides(targets, new Map([[1, staleOverride]])), targets)
})

test('preserves an existing category mapping flag when no override is present', () => {
  const targets = [
    { id: 1, wbApiKey: 'old-1', useCategoryMapping: true as const },
    { id: 2, wbApiKey: 'old-2', useCategoryMapping: false },
  ]

  assert.deepEqual(applyWbApiKeyOverrides(targets, new Map()), targets)
})
