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

export const FbsBotSnapshotSchema = z.object({
  contractVersion: z.literal(FBS_BOT_CONTRACT_VERSION),
  sellerId: z.literal('zubakhina'),
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
}).strict()

export type FbsClassification = z.infer<typeof FbsClassificationSchema>
export type FbsClassifyRequest = z.infer<typeof FbsClassifyRequestSchema>
export type FbsClassifyResponse = z.infer<typeof FbsClassifyResponseSchema>
export type FbsBotSnapshot = z.infer<typeof FbsBotSnapshotSchema>
