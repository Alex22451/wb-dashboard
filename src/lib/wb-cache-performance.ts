export function shouldServeDailyCache(input: {
  missing: number
  requireComplete: boolean
}): boolean {
  return input.missing === 0 || !input.requireComplete
}

export function canLiveLoadDailyRange(dates: string[], maxDays = 7): boolean {
  return dates.length > 0 && dates.length <= maxDays
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
