import { handleFbsStatusPost } from '@/lib/fbs-bot-route-handlers'
import { saveFbsBotSnapshot } from '@/lib/fbs-bot-store'
import { NextRequest } from 'next/server'

export function POST(request: NextRequest) {
  return handleFbsStatusPost(request, {
    expectedSecret: process.env.FBS_DASHBOARD_SHARED_SECRET,
    saveSnapshot: saveFbsBotSnapshot,
  })
}
