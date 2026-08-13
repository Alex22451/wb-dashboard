import { z } from 'zod'

export const FBS_BOT_CONTRACT_VERSION = 1 as const

const IsoDateSchema = z.string().datetime({ offset: true })
const BoundedStringSchema = z.string().min(1).max(256)
const NonNegativeIntegerSchema = z.number().int().nonnegative()

export const FbsClassificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('eligible'),
    productType: BoundedStringSchema,
    productDisplayName: BoundedStringSchema,
  }).strict(),
  z.object({ kind: z.literal('ignored_blacklist') }).strict(),
  z.object({ kind: z.literal('blocked_unknown_category') }).strict(),
  z.object({ kind: z.literal('blocked_unknown_size') }).strict(),
])

export const FbsClassifyRequestSchema = z.object({
  contractVersion: z.literal(FBS_BOT_CONTRACT_VERSION),
  items: z.array(z.object({
    requestId: BoundedStringSchema,
    nmId: z.number().int().positive(),
    subject: BoundedStringSchema,
    article: BoundedStringSchema,
    brand: z.string().max(256),
  }).strict()).min(1).max(100),
}).strict()

export const FbsClassifyResponseSchema = z.object({
  contractVersion: z.literal(FBS_BOT_CONTRACT_VERSION),
  mappingVersion: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(z.object({
    requestId: BoundedStringSchema,
    nmId: z.number().int().positive(),
    classification: FbsClassificationSchema,
  }).strict()).max(100),
}).strict()

const FbsBotCountsSchema = z.object({
  new: NonNegativeIntegerSchema,
  assigned: NonNegativeIntegerSchema,
  ignored: NonNegativeIntegerSchema,
  blocked: NonNegativeIntegerSchema,
}).strict()

const FbsOpenSupplySchema = z.object({
  supplyId: BoundedStringSchema,
  name: BoundedStringSchema,
  groupKey: BoundedStringSchema,
  orderCount: NonNegativeIntegerSchema,
  nextDeliveryWindowAt: IsoDateSchema,
  status: z.enum(['open', 'delivery_due', 'blocked']),
}).strict()

const FbsDeliveredSupplySchema = z.object({
  supplyId: BoundedStringSchema,
  name: BoundedStringSchema,
  orderCount: NonNegativeIntegerSchema,
  deliveredAt: IsoDateSchema,
}).strict()

const FbsBotErrorSchema = z.object({
  code: BoundedStringSchema,
  reason: z.string().min(1).max(500),
  occurredAt: IsoDateSchema,
  blocking: z.boolean(),
  orderId: z.number().int().positive().optional(),
  supplyId: BoundedStringSchema.optional(),
}).strict()

const FbsBotSnapshotShape = {
  contractVersion: z.literal(FBS_BOT_CONTRACT_VERSION),
  generatedAt: IsoDateSchema,
  phase: z.enum(['idle', 'loading', 'mutating', 'error', 'stopped']),
  lastRunAt: IsoDateSchema.nullable(),
  lastSuccessfulRunAt: IsoDateSchema.nullable(),
  nextDeliveryWindowAt: IsoDateSchema,
  mappingVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  mappingCacheUpdatedAt: IsoDateSchema.nullable(),
  counts: FbsBotCountsSchema,
  openSupplies: z.array(FbsOpenSupplySchema).max(200),
  deliveredSupplies: z.array(FbsDeliveredSupplySchema).max(200),
  errors: z.array(FbsBotErrorSchema).max(200),
}

export const FbsBotSnapshotSchema = z.discriminatedUnion('sellerId', [
  z.object({
    ...FbsBotSnapshotShape,
    sellerId: z.literal('zubakhina'),
    sellerDisplayName: z.literal('Зубахина'),
  }).strict(),
  z.object({
    ...FbsBotSnapshotShape,
    sellerId: z.literal('zubakhin-andrey'),
    sellerDisplayName: z.literal('Зубахин Андрей'),
  }).strict(),
])

const LegacyZubakhinaSnapshotSchema = z.object({
  ...FbsBotSnapshotShape,
  sellerId: z.literal('zubakhina'),
}).strict()

export const FbsBotSnapshotIngressSchema = z.union([
  FbsBotSnapshotSchema,
  LegacyZubakhinaSnapshotSchema,
]).transform(snapshot => 'sellerDisplayName' in snapshot
  ? snapshot
  : { ...snapshot, sellerDisplayName: 'Зубахина' as const })

export const FbsBotFleetStatusResponseSchema = z.object({
  snapshots: z.array(FbsBotSnapshotSchema).max(2).superRefine((snapshots, context) => {
    const seenSellerIds = new Set<string>()
    for (const [index, snapshot] of snapshots.entries()) {
      if (seenSellerIds.has(snapshot.sellerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate seller snapshot',
          path: [index, 'sellerId'],
        })
      }
      seenSellerIds.add(snapshot.sellerId)
    }
  }),
}).strict()

export const FbsBotStatusResponseSchema = z.object({
  snapshot: FbsBotSnapshotSchema.nullable(),
}).strict()

export type FbsBotStatus = 'работает' | 'загрузка данных' | 'задержка' | 'ошибка' | 'остановлен'

const FBS_BOT_HEARTBEAT_TIMEOUT_MS = 30 * 60 * 1000

export function deriveFbsBotStatus(
  snapshot: FbsBotSnapshot | null | undefined,
  now = Date.now(),
  loading = false,
): FbsBotStatus {
  if (snapshot === undefined) return loading ? 'загрузка данных' : 'остановлен'
  if (!snapshot || snapshot.phase === 'stopped') return 'остановлен'
  if (snapshot.phase === 'error' || snapshot.errors.some(error => error.blocking)) return 'ошибка'
  if (now - Date.parse(snapshot.generatedAt) > FBS_BOT_HEARTBEAT_TIMEOUT_MS) return 'задержка'
  if (loading || snapshot.phase === 'loading') return 'загрузка данных'
  return 'работает'
}

export type FbsClassification = z.infer<typeof FbsClassificationSchema>
export type FbsClassifyRequest = z.infer<typeof FbsClassifyRequestSchema>
export type FbsClassifyResponse = z.infer<typeof FbsClassifyResponseSchema>
export type FbsBotSnapshot = z.infer<typeof FbsBotSnapshotSchema>
export type FbsBotFleetStatusResponse = z.infer<typeof FbsBotFleetStatusResponseSchema>
export type FbsBotStatusResponse = z.infer<typeof FbsBotStatusResponseSchema>
