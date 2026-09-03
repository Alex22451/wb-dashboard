import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWbApiKeyOverrides,
  getWbApiKeyFingerprint,
  getWbSellerIdentity,
  getWbTargetIdentity,
  getWbTokenTtlSeconds,
  haveSameWbSellerIdentity,
  rollWbApiKeyOverride,
  shouldUseConfiguredCategoryMapping,
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

test('does not alias cache identities from unverified same-sid token strings', () => {
  const first = token({ sid: 'seller-1', nonce: 'first' })
  const second = token({ sid: 'seller-1', nonce: 'second' })

  assert.notEqual(getWbApiKeyFingerprint(first), getWbApiKeyFingerprint(second))
})

test('retains bounded prior cache fingerprints without retaining prior tokens', () => {
  const first = token({ sid: 'seller-1', nonce: 'first' })
  const second = token({ sid: 'seller-1', nonce: 'second' })
  const third = token({ sid: 'seller-1', nonce: 'third' })
  const firstRotation = rollWbApiKeyOverride(null, first, '2026-09-01T00:00:00.000Z')
  const secondRotation = rollWbApiKeyOverride(firstRotation, second, '2026-09-02T00:00:00.000Z')
  const thirdRotation = rollWbApiKeyOverride(secondRotation, third, '2026-09-03T00:00:00.000Z')

  assert.deepEqual(thirdRotation.previousCacheFingerprints, [
    'd913792e82757a41',
    '0f1939421d3aba00',
  ])
  assert.equal(JSON.stringify(thirdRotation).includes(first), false)
  assert.equal(JSON.stringify(thirdRotation).includes(second), false)
  assert.equal(thirdRotation.apiKey, third)
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
      dailyCacheFallbackWbApiKey: oldToken,
      dailyCacheFallbackUseCategoryMapping: undefined,
    },
    { id: 2, name: 'Seller 2', wbApiKey: 'old-2', wbPromotionApiKey: 'promo-2' },
  ])
})

test('applies only trusted bounded cache fingerprints from an admin override record', () => {
  const oldToken = token({ sid: 'seller-1', nonce: 'configured' })
  const newToken = token({ sid: 'seller-1', nonce: 'current' })
  const targets = [{ id: 1, name: 'Seller 1', wbApiKey: oldToken }]

  const applied = applyWbApiKeyOverrides(targets, new Map([[1, {
    apiKey: newToken,
    previousCacheFingerprints: [
      '0123456789abcdef',
      'not-a-fingerprint',
      'fedcba9876543210',
      'aaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbb',
      'cccccccccccccccc',
    ],
  }]]))

  assert.deepEqual(applied[0]?.dailyCacheFallbackFingerprints, [
    'fedcba9876543210',
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'cccccccccccccccc',
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

test('keeps the same configured-seller mapping and cache policy after token rotation', () => {
  const configuredToken = token({ sid: 'seller-1', nonce: 'configured' })
  const replacementToken = token({ sid: 'seller-1', nonce: 'replacement' })
  const configuredTarget = {
    id: 5,
    wbApiKey: configuredToken,
    useConfiguredOrderMapping: true,
  }

  const beforeRotation = applyWbApiKeyOverrides([configuredTarget], new Map())[0]
  const afterRotation = applyWbApiKeyOverrides([configuredTarget], new Map([[5, replacementToken]]))[0]

  assert.equal(beforeRotation?.useCategoryMapping, undefined)
  assert.equal(afterRotation?.useCategoryMapping, undefined)
  assert.equal(beforeRotation?.dailyCacheFallbackWbApiKey, undefined)
  assert.equal(afterRotation?.dailyCacheFallbackWbApiKey, configuredToken)
  assert.equal(afterRotation?.dailyCacheFallbackUseCategoryMapping, undefined)
  assert.equal(shouldUseConfiguredCategoryMapping(beforeRotation), true)
  assert.equal(shouldUseConfiguredCategoryMapping(afterRotation), true)
})
