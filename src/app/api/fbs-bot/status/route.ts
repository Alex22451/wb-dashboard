import { getCurrentUser } from '@/lib/auth'
import { handleFbsBotStatusGet } from '@/lib/fbs-bot-route-handlers'
import { loadFbsBotSnapshot } from '@/lib/fbs-bot-store'

export function GET() {
  return handleFbsBotStatusGet({
    getCurrentUser,
    loadSnapshot: loadFbsBotSnapshot,
  })
}
