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
  warningCount?: number
  hasDaily: boolean
  fulfillmentComplete?: boolean
}): boolean {
  return input.requestOk
    && input.errorCount === 0
    && Number(input.warningCount || 0) === 0
    && input.hasDaily
    && input.fulfillmentComplete !== false
}

export function shouldContinueDailyFunnelLoad(error: string | undefined): boolean {
  return !error
}

export function shouldServeDailyCache(input: {
  missing: number
  incomplete?: number
  requireComplete: boolean
}): boolean {
  return (input.missing === 0 && Number(input.incomplete || 0) === 0) || !input.requireComplete
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
  incompleteTargetIdsByDate?: Record<string, unknown>
  fallbackSelection: string
}): Array<{ date: string; selection: string }> {
  const normalizeIds = (rawIds: unknown): number[] => Array.isArray(rawIds)
    ? [...new Set(rawIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0))]
    : []
  const fulfillmentIncompleteDates = input.requestedDates.filter((date) => (
    normalizeIds(input.incompleteTargetIdsByDate?.[date]).length > 0
  ))
  const missingDates = getMissingDailyDates(
    input.requestedDates,
    input.daily,
    [...new Set([...(input.incompleteDates || []), ...fulfillmentIncompleteDates])],
  )

  return missingDates.map((date) => {
    const targetIds = [...new Set([
      ...normalizeIds(input.missingTargetIdsByDate?.[date]),
      ...normalizeIds(input.incompleteTargetIdsByDate?.[date]),
    ])].sort((a, b) => a - b)
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

export function reconcileFulfillmentCounts(
  funnelTotals: Record<string, number>,
  rawFbsCounts: Record<string, number>,
): {
  fbs: Record<string, number>
  fbo: Record<string, number>
  sourceExcess: Record<string, number>
} {
  const fbs: Record<string, number> = {}
  const fbo: Record<string, number> = {}
  const sourceExcess: Record<string, number> = {}
  const keys = [...new Set([...Object.keys(funnelTotals || {}), ...Object.keys(rawFbsCounts || {})])]

  for (const key of keys) {
    const total = Math.max(0, Math.trunc(Number(funnelTotals?.[key] || 0)))
    const rawFbs = Math.max(0, Math.trunc(Number(rawFbsCounts?.[key] || 0)))
    const reconciledFbs = Math.min(rawFbs, total)
    const reconciledFbo = total - reconciledFbs
    const excess = rawFbs - reconciledFbs
    if (reconciledFbs > 0) fbs[key] = reconciledFbs
    if (reconciledFbo > 0) fbo[key] = reconciledFbo
    if (excess > 0) sourceExcess[key] = excess
  }

  return { fbs, fbo, sourceExcess }
}

export function hasCompleteFulfillmentCoverage(
  funnelTotals: Record<string, number>,
  fulfillmentTotals: Record<string, number>,
): boolean {
  const keys = new Set([...Object.keys(funnelTotals || {}), ...Object.keys(fulfillmentTotals || {})])
  return [...keys].every((key) => {
    const total = Math.max(0, Math.trunc(Number(funnelTotals?.[key] || 0)))
    const covered = Math.max(0, Math.trunc(Number(fulfillmentTotals?.[key] || 0)))
    return covered === total
  })
}

export function buildStockAnalyticsFulfillmentOrders(
  items: unknown,
  stockType: 'wb' | 'mp',
  date: string,
): { orders: any[]; error?: string } {
  if (!Array.isArray(items) || !['wb', 'mp'].includes(stockType) || getMoscowOrderDate(date) !== date) {
    return { orders: [], error: 'Некорректный ответ складской аналитики FBS/FBO' }
  }

  const orders: any[] = []
  for (const item of items) {
    const rawCount = Number(item?.metrics?.ordersCount)
    if (!Number.isInteger(rawCount) || rawCount < 0 || orders.length + rawCount > 250_000) {
      return { orders: [], error: 'Некорректный ответ складской аналитики FBS/FBO' }
    }
    for (let index = 0; index < rawCount; index += 1) {
      orders.push({
        date: `${date}T12:00:00`,
        lastChangeDate: `${date}T12:00:00`,
        supplierArticle: String(item?.vendorCode || ''),
        nmId: Number(item?.nmID) || 0,
        subject: String(item?.subjectName || ''),
        brand: String(item?.brandName || ''),
        techSize: '',
        warehouseType: stockType === 'mp' ? 'Склад продавца' : 'Склад WB',
        odid: `stock-analytics:${stockType}:${item?.nmID || item?.vendorCode || 'unknown'}:${date}:${index}`,
        isStockAnalyticsOrder: true,
      })
    }
  }
  return { orders }
}

export async function loadStockAnalyticsResponseSafely<T>(
  loader: () => Promise<T>,
): Promise<{ response: T | null; error?: string }> {
  try {
    return { response: await loader() }
  } catch {
    return { response: null, error: 'Ошибка сети складской аналитики FBS/FBO' }
  }
}

export function isStockAnalyticsPageComplete(items: any[], limit: number): boolean {
  return items.length < limit || items.some((item) => Number(item?.metrics?.ordersCount) === 0)
}

export function getMoscowOrderDate(value: unknown): string {
  const raw = String(value || '')
  if (!raw) return ''
  const sourceDate = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) return ''
  const parsedSourceDate = new Date(`${sourceDate}T00:00:00.000Z`)
  if (Number.isNaN(parsedSourceDate.getTime()) || parsedSourceDate.toISOString().slice(0, 10) !== sourceDate) return ''
  if (!raw.includes('T')) {
    return raw === sourceDate ? raw : ''
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw)) return ''
  const parsed = new Date(raw).getTime()
  if (Number.isNaN(parsed)) return ''
  return new Date(parsed + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function getMissingWarmTargetIds(
  cacheStats: any,
  dates: string[],
): number[] | null {
  const byDate = getMissingWarmTargetsByDate(cacheStats, dates)
  if (!byDate) return null
  const ids = new Set<number>()
  for (const dateIds of Object.values(byDate)) {
    for (const id of dateIds) ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}

export function getMissingWarmTargetsByDate(
  cacheStats: any,
  dates: string[],
): Record<string, number[]> | null {
  if (!cacheStats || !Array.isArray(dates)) return null
  const rawByDate = cacheStats.missingEntrepreneurIdsByDate
  const rawIncompleteByDate = cacheStats.incompleteFulfillmentEntrepreneurIdsByDate
  const expectedMissing = Math.max(0, Math.trunc(Number(cacheStats.missing || 0)))
  if (expectedMissing > 0 && (!rawByDate || typeof rawByDate !== 'object')) return null

  const byDate: Record<string, number[]> = {}
  let describedMissing = 0
  for (const date of dates) {
    const rawMissingIds = rawByDate && typeof rawByDate === 'object' ? rawByDate[date] : []
    const rawIncompleteIds = rawIncompleteByDate && typeof rawIncompleteByDate === 'object'
      ? rawIncompleteByDate[date]
      : []
    const missingIds = [...new Set((Array.isArray(rawMissingIds) ? rawMissingIds : [])
      .map((rawId: unknown) => Number(rawId))
      .filter((id: number) => Number.isInteger(id) && id > 0))]
    describedMissing += missingIds.length
    const ids = [...new Set([
      ...missingIds,
      ...(Array.isArray(rawIncompleteIds) ? rawIncompleteIds : [])
        .map((rawId: unknown) => Number(rawId))
        .filter((id: number) => Number.isInteger(id) && id > 0),
    ])]
      .sort((a, b) => a - b)
    if (ids.length > 0) byDate[date] = ids
  }
  if (describedMissing !== expectedMissing) return null
  return byDate
}

export function applyFulfillmentBreakdown(
  daily: any,
  rawFboByProductName: Record<string, number>,
  entrepreneurId: number,
): any {
  if (!daily || !Array.isArray(daily.dates) || daily.dates.length !== 1) {
    throw new Error('Fulfillment breakdown requires exactly one cached date')
  }

  const date = daily.dates[0]
  const fbsPivot: Record<number, Record<number, number>> = {}
  const fboPivot: Record<number, Record<number, number>> = {}
  const fbsProductTotals: Record<number, number> = {}
  const fboProductTotals: Record<number, number> = {}
  let fbsTotal = 0
  let fboTotal = 0

  for (const product of daily.products || []) {
    const productId = Number(product.id)
    const total = Math.max(0, Math.trunc(Number(daily.pivot?.[productId]?.[0] || 0)))
    const rawFbo = Math.max(0, Math.trunc(Number(rawFboByProductName?.[product.name] || 0)))
    const fbo = Math.min(rawFbo, total)
    const fbs = total - fbo

    if (fbs > 0) {
      fbsPivot[productId] = { 0: fbs }
      fbsProductTotals[productId] = fbs
      fbsTotal += fbs
    }
    if (fbo > 0) {
      fboPivot[productId] = { 0: fbo }
      fboProductTotals[productId] = fbo
      fboTotal += fbo
    }
  }

  return {
    ...daily,
    fulfillmentComplete: true,
    fbsPivot,
    fbsDateTotals: [fbsTotal],
    fbsProductTotals,
    fboPivot,
    fboDateTotals: [fboTotal],
    fboProductTotals,
    entrepreneurDailyFbs: { [date]: { [entrepreneurId]: fbsTotal } },
    entrepreneurDailyFbo: { [date]: { [entrepreneurId]: fboTotal } },
  }
}
