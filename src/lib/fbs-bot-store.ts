import { FbsBotSnapshotSchema, type FbsBotSnapshot } from './fbs-bot-contract'
import { redisCommand } from './redis-cache'

export const FBS_BOT_SNAPSHOT_KEY = 'dashboard:fbs-bot:v1:latest'

export async function saveFbsBotSnapshot(input: unknown): Promise<FbsBotSnapshot> {
  const snapshot = FbsBotSnapshotSchema.parse(input)
  const result = await redisCommand<string>([
    'SET',
    FBS_BOT_SNAPSHOT_KEY,
    JSON.stringify(snapshot),
  ])
  if (result !== 'OK') throw new Error('FBS bot snapshot storage is unavailable')
  return snapshot
}

export async function getFbsBotSnapshot(): Promise<FbsBotSnapshot | null> {
  const raw = await redisCommand<string>(['GET', FBS_BOT_SNAPSHOT_KEY])
  if (typeof raw !== 'string') return null

  try {
    const parsed = FbsBotSnapshotSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
