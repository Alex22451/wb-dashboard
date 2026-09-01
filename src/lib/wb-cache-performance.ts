export const WB_FUNNEL_REQUEST_INTERVAL_MS = 21000

export function getFunnelRequestDelayMs(
  previousRequestStartedAt: number | undefined,
  now: number,
  intervalMs = WB_FUNNEL_REQUEST_INTERVAL_MS,
): number {
  if (previousRequestStartedAt === undefined) return 0
  return Math.max(0, previousRequestStartedAt + intervalMs - now)
}

export function getWbRateLimitRetryDelayMs(
  retryAfterSeconds: string | null,
  retryAttempt: number,
  fallbackIntervalMs = WB_FUNNEL_REQUEST_INTERVAL_MS,
): number {
  const parsedSeconds = Number(retryAfterSeconds)
  const headerDelayMs = Number.isFinite(parsedSeconds) && parsedSeconds > 0
    ? Math.ceil(parsedSeconds * 1000) + 250
    : 0
  const fallbackDelayMs = fallbackIntervalMs * Math.max(1, retryAttempt + 1)
  return Math.min(30 * 60_000, headerDelayMs || fallbackDelayMs)
}

export function shouldRetryWbRateLimitInRequest(delayMs: number): boolean {
  return Number.isFinite(delayMs) && delayMs >= 0 && delayMs <= 60_000
}

export function shouldContinueDailyRecovery(input: {
  requestOk: boolean
  errorCount: number
  hasDaily: boolean
}): boolean {
  return input.requestOk && input.errorCount === 0 && input.hasDaily
}

export function shouldContinueDailyFunnelLoad(error: string | undefined): boolean {
  return !error
}

export function shouldServeDailyCache(input: {
  missing: number
  requireComplete: boolean
}): boolean {
  return input.missing === 0 || !input.requireComplete
}

export function canLiveLoadDailyRange(dates: string[], maxDays = 7): boolean {
  return dates.length > 0 && dates.length <= maxDays
}

export function getDailyFunnelLoadStrategy(
  dates: string[],
  maxDays = 7,
  _historyWindow: { from: string; to: string },
): 'single-day' | 'history' | 'daily' | 'unsupported' {
  if (dates.length === 1) return 'single-day'
  if (dates.length === 0 || dates.length > maxDays) return 'unsupported'
  // The history endpoint accepts only 20 nmIds per request. Real sellers have
  // hundreds or thousands of products, so a weekly history load cannot finish
  // inside a Vercel function. Daily product snapshots bound the request count
  // by the selected date range instead of the catalog size.
  return 'daily'
}

export function getFunnelOrderMetrics(source: {
  orderCount?: unknown
  orderSum?: unknown
}): { count: number; orderSum: number; unitRevenue: number } {
  const rawCount = Number(source.orderCount)
  const rawOrderSum = Number(source.orderSum)
  const count = Number.isFinite(rawCount) ? Math.max(Math.trunc(rawCount), 0) : 0
  const orderSum = Number.isFinite(rawOrderSum) ? rawOrderSum : 0
  return {
    count,
    orderSum,
    unitRevenue: count > 0 ? orderSum / count : 0,
  }
}

export function getCacheableDailyTargetIds(results: Array<{
  entrepreneurId: number
  error?: string
  returnError?: string
}>, options: { allowReturnErrors?: boolean } = {}): number[] {
  return results
    .filter((result) => !result.error && (options.allowReturnErrors || !result.returnError))
    .map((result) => result.entrepreneurId)
}

export function splitDailyLoadIssues(results: Array<{
  entrepreneurId: number
  entrepreneurName: string
  error?: string
  returnError?: string
}>, treatReturnErrorsAsWarnings: boolean): {
  errors: Array<{ id: number; name: string; error: string }>
  warnings: Array<{ id: number; name: string; error: string }>
} {
  const errors: Array<{ id: number; name: string; error: string }> = []
  const warnings: Array<{ id: number; name: string; error: string }> = []
  for (const result of results) {
    if (result.error) errors.push({ id: result.entrepreneurId, name: result.entrepreneurName, error: result.error })
    if (result.returnError) {
      const issue = { id: result.entrepreneurId, name: result.entrepreneurName, error: result.returnError }
      if (treatReturnErrorsAsWarnings) warnings.push(issue)
      else errors.push(issue)
    }
  }
  return { errors, warnings }
}

export function shouldLiveLoadDailyRange(input: {
  dates: string[]
  cacheOnly: boolean
  maxDays?: number
}): boolean {
  return !input.cacheOnly && canLiveLoadDailyRange(input.dates, input.maxDays)
}

export function shouldRefreshDailyCache(input: {
  internalWarmRequest: boolean
  refreshRequested: boolean
  cacheOnly: boolean
}): boolean {
  return input.internalWarmRequest && input.refreshRequested && !input.cacheOnly
}

export function getMissingDailyDates(
  requestedDates: string[],
  daily: any,
  incompleteDates: string[] = [],
): string[] {
  const availableDates = new Set(
    Array.isArray(daily?.dates)
      ? daily.dates.filter((date: unknown): date is string => typeof date === 'string')
      : [],
  )
  const incomplete = new Set(incompleteDates)
  return requestedDates.filter((date) => !availableDates.has(date) || incomplete.has(date))
}

export function buildDailyRecoveryPlan(input: {
  requestedDates: string[]
  daily: any
  incompleteDates?: string[]
  missingTargetIdsByDate?: Record<string, unknown>
  fallbackSelection: string
}): Array<{ date: string; selection: string }> {
  const missingDates = getMissingDailyDates(
    input.requestedDates,
    input.daily,
    input.incompleteDates || [],
  )

  return missingDates.map((date) => {
    const rawIds = input.missingTargetIdsByDate?.[date]
    const targetIds = Array.isArray(rawIds)
      ? [...new Set(rawIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0))]
      : []
    return {
      date,
      selection: targetIds.length > 0 ? targetIds.join(',') : input.fallbackSelection,
    }
  })
}

export function buildDailyRangeRecoverySelection(
  recoveryPlan: Array<{ date: string; selection: string }>,
  fallbackSelection: string,
): string {
  const targetIds = new Set<number>()
  for (const item of recoveryPlan) {
    const ids = item.selection
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length === 0) return fallbackSelection
    ids.forEach((id) => targetIds.add(id))
  }
  return targetIds.size > 0
    ? [...targetIds].sort((a, b) => a - b).join(',')
    : fallbackSelection
}

export function getMissingDailyTargetIdsByDate(input: {
  targetIds: number[]
  dates: string[]
  presentRows: boolean[]
}): Record<string, number[]> {
  return Object.fromEntries(input.dates.map((date, dateIndex) => [
    date,
    input.targetIds.filter((_, targetIndex) => (
      !input.presentRows[(targetIndex * input.dates.length) + dateIndex]
    )),
  ]))
}

export function sliceDailyPayloadByDate(daily: any, date: string): any | null {
  const sourceDateIdx = daily?.dates?.indexOf(date)
  if (sourceDateIdx === undefined || sourceDateIdx < 0) return null

  const products: Array<{ id: number; name: string }> = []
  const productMap = new Map<number, number>()
  const remapProduct = (sourceProductId: number) => {
    const existing = productMap.get(sourceProductId)
    if (existing !== undefined) return existing
    const sourceProduct = daily.products?.find((product: any) => Number(product.id) === sourceProductId)
    if (!sourceProduct) return null
    const nextId = products.length
    productMap.set(sourceProductId, nextId)
    products.push({ id: nextId, name: sourceProduct.name })
    return nextId
  }

  const slicePivot = (source: Record<number, Record<number, number>> | undefined) => {
    const target: Record<number, Record<number, number>> = {}
    for (const [sourceProductIdRaw, row] of Object.entries(source || {})) {
      const value = Number((row as Record<number, number>)[sourceDateIdx] || 0)
      if (!value) continue
      const targetProductId = remapProduct(Number(sourceProductIdRaw))
      if (targetProductId === null) continue
      target[targetProductId] = { 0: value }
    }
    return target
  }

  const pivot = slicePivot(daily.pivot)
  const fbsPivot = slicePivot(daily.fbsPivot)
  const fboPivot = slicePivot(daily.fboPivot)
  const productTotals: Record<number, number> = {}
  const fbsProductTotals: Record<number, number> = {}
  const fboProductTotals: Record<number, number> = {}
  const fillProductTotals = (
    source: Record<number, Record<number, number>>,
    target: Record<number, number>,
  ) => {
    for (const [productIdRaw, row] of Object.entries(source)) {
      target[Number(productIdRaw)] = Number(row[0] || 0)
    }
  }
  fillProductTotals(pivot, productTotals)
  fillProductTotals(fbsPivot, fbsProductTotals)
  fillProductTotals(fboPivot, fboProductTotals)

  return {
    fulfillmentComplete: daily.fulfillmentComplete !== false,
    dates: [date],
    allDates: [date],
    products,
    entrepreneurs: daily.entrepreneurs || [],
    pivot,
    previousPivot: {},
    previousFbsPivot: {},
    previousFboPivot: {},
    dateTotals: [Number(daily.dateTotals?.[sourceDateIdx] || 0)],
    revenueDateTotals: [Number(daily.revenueDateTotals?.[sourceDateIdx] || 0)],
    previousDateTotals: [0],
    productTotals,
    productRevenue: {},
    entrepreneurDailyData: { [date]: daily.entrepreneurDailyData?.[date] || {} },
    entrepreneurDailyRevenue: { [date]: daily.entrepreneurDailyRevenue?.[date] || {} },
    entrepreneurDailyFbs: { [date]: daily.entrepreneurDailyFbs?.[date] || {} },
    entrepreneurDailyFbo: { [date]: daily.entrepreneurDailyFbo?.[date] || {} },
    fbsPivot,
    fbsDateTotals: [Number(daily.fbsDateTotals?.[sourceDateIdx] || 0)],
    fbsProductTotals,
    fboPivot,
    fboDateTotals: [Number(daily.fboDateTotals?.[sourceDateIdx] || 0)],
    fboProductTotals,
  }
}
