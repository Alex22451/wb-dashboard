// @ts-expect-error TS5097 is intentional for the standalone unit test command.
import { FbsBotSnapshotSchema, type FbsBotSnapshot } from './fbs-bot-contract.ts'
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
import { hasRedisConfig, redisCommand } from './redis-cache.ts'
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
import { FBS_BOT_SELLER_DISPLAY_NAMES, FBS_BOT_SELLER_IDS } from './fbs-bot-sellers.ts'

export const FBS_BOT_SNAPSHOT_KEY = 'dashboard:fbs-bot:v1:latest'

export function snapshotKey(sellerId: FbsBotSnapshot['sellerId']): string {
  return sellerId === 'zubakhina'
    ? FBS_BOT_SNAPSHOT_KEY
    : `dashboard:fbs-bot:v1:${sellerId}:latest`
}

type StoreErrorCode = 'unconfigured' | 'unavailable' | 'corrupt' | 'unexpected_result'
type StoreCommand = (command: unknown[]) => Promise<unknown>

export class FbsBotStoreError extends Error {
  readonly code: StoreErrorCode

  constructor(code: StoreErrorCode) {
    super(`FBS bot snapshot store error: ${code}`)
    this.name = 'FbsBotStoreError'
    this.code = code
  }
}

export class FbsBotStaleSnapshotError extends Error {
  readonly code = 'stale' as const

  constructor() {
    super('FBS bot snapshot is stale or already stored')
    this.name = 'FbsBotStaleSnapshotError'
  }
}

export class FbsBotFutureSnapshotError extends Error {
  readonly code = 'future' as const

  constructor() {
    super('FBS bot snapshot timestamp is too far in the future')
    this.name = 'FbsBotFutureSnapshotError'
  }
}

interface FbsBotStoreOptions {
  command?: StoreCommand
  hasConfig?: () => boolean
  now?: () => Date
}

const STORE_NEWER_SNAPSHOT_SCRIPT = `
local function only_keys(value, allowed, required)
  if type(value) ~= 'table' then return false end
  for key, _ in pairs(value) do
    if not allowed[key] then return false end
  end
  for _, key in ipairs(required) do
    if value[key] == nil then return false end
  end
  return true
end

local function is_non_negative_integer(value)
  return type(value) == 'number' and value >= 0 and value % 1 == 0
end

local function utf8_length(value)
  local count = 0
  for index = 1, string.len(value) do
    local byte = string.byte(value, index)
    if byte < 128 or byte >= 192 then count = count + 1 end
  end
  return count
end

local function valid_string(value, max_length)
  return type(value) == 'string' and utf8_length(value) >= 1 and utf8_length(value) <= max_length
end

local function valid_iso(value)
  return type(value) == 'string'
    and string.len(value) == 24
    and string.match(value, '^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d%.%d%d%dZ$') ~= nil
end

local function valid_nullable_iso(value)
  return value == cjson.null or valid_iso(value)
end

local function valid_array(value, max_length)
  if type(value) ~= 'table' or #value > max_length then return false end
  for key, _ in pairs(value) do
    if type(key) ~= 'number' or key % 1 ~= 0 or key < 1 or key > #value then return false end
  end
  return true
end

local function valid_current(value, expected_seller, allow_legacy_zubakhina)
  local top_allowed = {
    contractVersion=true, sellerId=true, sellerDisplayName=true, generatedAt=true, phase=true,
    lastRunAt=true, lastSuccessfulRunAt=true, nextDeliveryWindowAt=true,
    mappingVersion=true, mappingCacheUpdatedAt=true, counts=true,
    openSupplies=true, deliveredSupplies=true, errors=true
  }
  local top_required = {
    'contractVersion', 'sellerId', 'generatedAt', 'phase', 'lastRunAt',
    'lastSuccessfulRunAt', 'nextDeliveryWindowAt', 'mappingVersion',
    'mappingCacheUpdatedAt', 'counts', 'openSupplies', 'deliveredSupplies', 'errors'
  }
  if not only_keys(value, top_allowed, top_required) then return false end
  if value.contractVersion ~= 1 or value.sellerId ~= expected_seller then return false end
  local is_legacy_zubakhina = allow_legacy_zubakhina
    and expected_seller == 'zubakhina'
    and value.sellerDisplayName == nil
  local seller_names = {
    zubakhina='Зубахина',
    ['zubakhin-andrey']='Зубахин Андрей',
    ['maslyakov-aa']='Масляков А.А.',
    burago='Бураго',
    ['maslyakov-lev']='Масляков Лев'
  }
  local expected_name = seller_names[value.sellerId]
  if expected_name == nil then return false end
  if not is_legacy_zubakhina and expected_name ~= value.sellerDisplayName then return false end
  if not valid_iso(value.generatedAt) or not valid_iso(value.nextDeliveryWindowAt) then return false end
  if not valid_nullable_iso(value.lastRunAt) or not valid_nullable_iso(value.lastSuccessfulRunAt) then return false end
  if not valid_nullable_iso(value.mappingCacheUpdatedAt) then return false end
  local phases = { idle=true, loading=true, mutating=true, error=true, stopped=true }
  if not phases[value.phase] then return false end
  if value.mappingVersion ~= cjson.null then
    if type(value.mappingVersion) ~= 'string' or string.len(value.mappingVersion) ~= 64 then return false end
    if string.match(value.mappingVersion, '^[0-9a-f]+$') == nil then return false end
  end

  local count_keys = { new=true, assigned=true, ignored=true, blocked=true }
  local count_required = { 'new', 'assigned', 'ignored', 'blocked' }
  if not only_keys(value.counts, count_keys, count_required) then return false end
  for _, key in ipairs(count_required) do
    if not is_non_negative_integer(value.counts[key]) then return false end
  end

  if not valid_array(value.openSupplies, 200) then return false end
  local open_allowed = {
    supplyId=true, name=true, groupKey=true, orderCount=true,
    nextDeliveryWindowAt=true, status=true
  }
  local open_required = {
    'supplyId', 'name', 'groupKey', 'orderCount', 'nextDeliveryWindowAt', 'status'
  }
  local open_statuses = { open=true, delivery_due=true, blocked=true }
  for _, supply in ipairs(value.openSupplies) do
    if not only_keys(supply, open_allowed, open_required) then return false end
    if not valid_string(supply.supplyId, 256) or not valid_string(supply.name, 256) then return false end
    if not valid_string(supply.groupKey, 256) or not is_non_negative_integer(supply.orderCount) then return false end
    if not valid_iso(supply.nextDeliveryWindowAt) or not open_statuses[supply.status] then return false end
  end

  if not valid_array(value.deliveredSupplies, 200) then return false end
  local delivered_allowed = { supplyId=true, name=true, orderCount=true, deliveredAt=true }
  local delivered_required = { 'supplyId', 'name', 'orderCount', 'deliveredAt' }
  for _, supply in ipairs(value.deliveredSupplies) do
    if not only_keys(supply, delivered_allowed, delivered_required) then return false end
    if not valid_string(supply.supplyId, 256) or not valid_string(supply.name, 256) then return false end
    if not is_non_negative_integer(supply.orderCount) or not valid_iso(supply.deliveredAt) then return false end
  end

  if not valid_array(value.errors, 200) then return false end
  local error_allowed = {
    code=true, reason=true, occurredAt=true, blocking=true, orderId=true, supplyId=true
  }
  local error_required = { 'code', 'reason', 'occurredAt', 'blocking' }
  for _, item in ipairs(value.errors) do
    if not only_keys(item, error_allowed, error_required) then return false end
    if not valid_string(item.code, 256) or not valid_string(item.reason, 500) then return false end
    if not valid_iso(item.occurredAt) or type(item.blocking) ~= 'boolean' then return false end
    if item.orderId ~= nil and (not is_non_negative_integer(item.orderId) or item.orderId == 0) then return false end
    if item.supplyId ~= nil and not valid_string(item.supplyId, 256) then return false end
  end
  return true
end

local expected_seller = ARGV[2]
local incoming_ok, incoming = pcall(cjson.decode, ARGV[1])
if not incoming_ok or not valid_current(incoming, expected_seller, false) then return -1 end

local current_raw = redis.call('GET', KEYS[1])
if current_raw then
  local current_ok, current = pcall(cjson.decode, current_raw)
  if not current_ok or not valid_current(current, expected_seller, true) then return -1 end
  if current.generatedAt >= incoming.generatedAt then return 0 end
end

redis.call('SET', KEYS[1], ARGV[1])
return 1
`

const LOAD_SNAPSHOT_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
return value
`

function canonicalizeSnapshot(input: unknown): FbsBotSnapshot {
  const snapshot = FbsBotSnapshotSchema.parse(input)
  const iso = (value: string) => new Date(value).toISOString()
  const optionalIso = (value: string | null) => value === null ? null : iso(value)
  return {
    ...snapshot,
    generatedAt: iso(snapshot.generatedAt),
    lastRunAt: optionalIso(snapshot.lastRunAt),
    lastSuccessfulRunAt: optionalIso(snapshot.lastSuccessfulRunAt),
    nextDeliveryWindowAt: iso(snapshot.nextDeliveryWindowAt),
    mappingCacheUpdatedAt: optionalIso(snapshot.mappingCacheUpdatedAt),
    openSupplies: snapshot.openSupplies.map(supply => ({
      ...supply,
      nextDeliveryWindowAt: iso(supply.nextDeliveryWindowAt),
    })),
    deliveredSupplies: snapshot.deliveredSupplies.map(supply => ({
      ...supply,
      deliveredAt: iso(supply.deliveredAt),
    })),
    errors: snapshot.errors.map(error => ({
      ...error,
      occurredAt: iso(error.occurredAt),
    })),
  }
}

function migrateLegacySnapshot(
  input: unknown,
  sellerId: FbsBotSnapshot['sellerId'],
): unknown {
  if (
    sellerId !== 'zubakhina'
    || typeof input !== 'object'
    || input === null
    || Array.isArray(input)
    || 'sellerDisplayName' in input
  ) {
    return input
  }

  return { ...input, sellerDisplayName: FBS_BOT_SELLER_DISPLAY_NAMES[sellerId] }
}

export function createFbsBotStore(options: FbsBotStoreOptions = {}) {
  const command = options.command || (redisCommand as StoreCommand)
  const configured = options.hasConfig || hasRedisConfig
  const now = options.now || (() => new Date())

  async function run(commandParts: unknown[]): Promise<unknown> {
    try {
      return await command(commandParts)
    } catch {
      throw new FbsBotStoreError('unavailable')
    }
  }

  async function loadOne(sellerId: FbsBotSnapshot['sellerId']): Promise<FbsBotSnapshot | null> {
    const raw = await run(['EVAL', LOAD_SNAPSHOT_SCRIPT, 1, snapshotKey(sellerId)])
    if (raw === 0) return null
    if (raw === null || typeof raw !== 'string') throw new FbsBotStoreError('unavailable')

    try {
      const snapshot = FbsBotSnapshotSchema.parse(migrateLegacySnapshot(JSON.parse(raw), sellerId))
      if (snapshot.sellerId !== sellerId) throw new FbsBotStoreError('corrupt')
      if (new Date(snapshot.generatedAt).toISOString() !== snapshot.generatedAt) {
        throw new FbsBotStoreError('corrupt')
      }
      return snapshot
    } catch (error) {
      if (error instanceof FbsBotStoreError) throw error
      throw new FbsBotStoreError('corrupt')
    }
  }

  async function loadAll(): Promise<FbsBotSnapshot[]> {
    if (!configured()) throw new FbsBotStoreError('unconfigured')
    const snapshots = await Promise.all(FBS_BOT_SELLER_IDS.map(loadOne))
    return snapshots.filter((snapshot): snapshot is FbsBotSnapshot => snapshot !== null)
  }

  async function save(input: unknown): Promise<FbsBotSnapshot> {
    const snapshot = canonicalizeSnapshot(input)
    if (new Date(snapshot.generatedAt).getTime() > now().getTime() + 5 * 60 * 1000) {
      throw new FbsBotFutureSnapshotError()
    }
    if (!configured()) throw new FbsBotStoreError('unconfigured')

    const result = await run([
      'EVAL',
      STORE_NEWER_SNAPSHOT_SCRIPT,
      1,
      snapshotKey(snapshot.sellerId),
      JSON.stringify(snapshot),
      snapshot.sellerId,
    ])
    if (result === 1) return snapshot
    if (result === 0) throw new FbsBotStaleSnapshotError()
    if (result === -1) throw new FbsBotStoreError('corrupt')
    if (result === null) throw new FbsBotStoreError('unavailable')
    throw new FbsBotStoreError('unexpected_result')
  }

  return { loadAll, save }
}

const defaultStore = createFbsBotStore()

export function loadFbsBotSnapshots(): Promise<FbsBotSnapshot[]> {
  return defaultStore.loadAll()
}

export function saveFbsBotSnapshot(input: unknown): Promise<FbsBotSnapshot> {
  return defaultStore.save(input)
}
