import assert from 'node:assert/strict'
import test from 'node:test'

// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
import { redisCommand } from './redis-cache.ts'

test('does not send Redis commands to a Vercel application URL', async () => {
  const previous = {
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    KV_REDIS_URL: process.env.KV_REDIS_URL,
    REDIS_URL: process.env.REDIS_URL,
    fetch: globalThis.fetch,
  }
  let fetchCalls = 0

  try {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    process.env.UPSTASH_REDIS_REST_URL = 'https://svodkasobag.vercel.app/'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    delete process.env.KV_REDIS_URL
    delete process.env.REDIS_URL
    globalThis.fetch = async () => {
      fetchCalls += 1
      return new Response(null, { status: 405 })
    }

    assert.equal(await redisCommand(['GET', 'test-key']), null)
    assert.equal(fetchCalls, 0)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (key === 'fetch') continue
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    globalThis.fetch = previous.fetch
  }
})
