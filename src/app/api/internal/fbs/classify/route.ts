import { handleFbsClassifyPost } from '@/lib/fbs-bot-route-handlers'
import { classifyFbsProduct, getWbMappingVersion } from '@/lib/wb-mapping'
import { NextRequest } from 'next/server'

export function POST(request: NextRequest) {
  return handleFbsClassifyPost(request, {
    expectedSecret: process.env.FBS_DASHBOARD_SHARED_SECRET,
    getMappingVersion: getWbMappingVersion,
    classify: classifyFbsProduct,
  })
}
