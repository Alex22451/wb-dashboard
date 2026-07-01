'use client'

import { useState, useEffect, useCallback, Fragment, useMemo, useRef } from 'react'
import {
  LayoutDashboard,
  Table2,
  Calendar,
  Megaphone,
  TrendingUp,
  Package,
  GitCompare,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Key,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Plus,
  Download,
  Upload,
  Calculator,
  Pencil,
  Thermometer,
  Truck,
  RefreshCw,
  MapPin,
  LogOut,
  User,
  Lock,
  Settings2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

// Types
interface DashboardData {
  totalOrders: number
  yesterdayOrders: number
  dayBeforeYesterdayOrders: number
  yesterdayDate: string | null
  monthOrders: number
  prevMonthOrders: number
  latestDate: string | null
  productCount: number
  entrepreneurStats: { id: number; name: string; totalOrders: number }[]
  weekEntrepreneurStats: { id: number; name: string; totalOrders: number }[]
  weekTotalOrders: number
  weekDateFrom: string | null
  weekDateTo: string | null
  dayChange: string | null
  monthChange: string | null
  yesterdayFbsOrders: number
  yesterdayFboOrders: number
  dayBeforeYesterdayFbsOrders: number
  dayBeforeYesterdayFboOrders: number
  chartDates: string[]
  chartFbs: Record<string, number>
  chartFbo: Record<string, number>
  periodStats: {
    yesterday: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
    week: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
    twoWeeks: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
    month: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
  }
  prevPeriodStats: {
    yesterday: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
    week: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
    twoWeeks: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
    month: { total: number; fbs: number; fbo: number; revenue: number; dateFrom: string; dateTo: string }
  }
  adSpendByPeriod: Record<'yesterday' | 'week' | 'twoWeeks' | 'month', {
    totalSpend: number
    drr: number | null
    entrepreneurs: { id: number; name: string; spend: number; revenue: number; drr: number | null }[]
  }>
  productDynamics: Record<'yesterday' | 'week' | 'twoWeeks' | 'month', {
    growth: { name: string; article: string; currentOrders: number; previousOrders: number; diff: number; diffPercent: number | null }[]
    decline: { name: string; article: string; currentOrders: number; previousOrders: number; diff: number; diffPercent: number | null }[]
  }>
}

interface DailyOrdersData {
  dates: string[]
  allDates?: string[]
  products: { id: number; name: string }[]
  entrepreneurs: { id: number; name: string }[]
  pivot: Record<number, Record<number, number>>
  previousPivot?: Record<number, Record<number, number>>
  previousFbsPivot?: Record<number, Record<number, number>>
  previousFboPivot?: Record<number, Record<number, number>>
  dateTotals: number[]
  revenueDateTotals?: number[]
  previousDateTotals?: number[]
  productTotals: Record<number, number>
  productRevenue?: Record<number, number>
  entrepreneurDailyData: Record<string, Record<number, number>>
  entrepreneurDailyRevenue?: Record<string, Record<number, number>>
  entrepreneurDailyFbs?: Record<string, Record<number, number>>
  entrepreneurDailyFbo?: Record<string, Record<number, number>>
  fbsPivot: Record<number, Record<number, number>>
  fbsDateTotals: number[]
  fbsProductTotals: Record<number, number>
  fboPivot: Record<number, Record<number, number>>
  fboDateTotals: number[]
  fboProductTotals: Record<number, number>
}

type DailyResponse = {
  daily?: DailyOrdersData
  dailyByEntrepreneur?: Record<string, DailyOrdersData>
  rateLimitErrors?: RateLimitError[]
  cacheSource?: 'redis'
}

type DashboardPeriod = 'yesterday' | 'week' | 'twoWeeks' | 'month'
type DataMetric = 'orders' | 'sales'

interface EntrepreneurInfo {
  id: number
  name: string
  wbApiKey: string | null
  totalOrders: number
  hasApiKey: boolean
}

interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user'
}

type UnitFulfillment = 'fbs' | 'fbo'

interface UnitEconomicsRow {
  id: string
  fulfillment: UnitFulfillment
  productName: string
  category?: string
  entrepreneurName: string
  nmId?: number | null
  vendorCode?: string | null
  excelProductKey?: string | null
  wbSubject?: string | null
  wbBrand?: string | null
  wbSyncedAt?: string | null
  costRub: number
  priceBeforeDiscountRub: number
  discountPct: number
  sppPct: number
  walletPct: number
  commissionPct: number
  avgDeliveryDays: number
  warehouse: string
  fixedWarehouseCoeff: number
  buyoutPct: number
  localizationIndex: number
  returnLogisticsRub: number
  deliveryLogisticsRub: number
  logisticsTotalRub: number
  taxAcquiringPct: number
  drrPct: number
  minProfitRub: number
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  boxQty: number
  source?: 'excel' | 'manual' | 'wb'
  updatedAt?: string
  priceAfterDiscountRub: number
  priceAfterSppRub: number
  priceWithWalletRub: number
  commissionRub: number
  extraCommissionPct: number
  extraCommissionRub: number
  taxAcquiringRub: number
  adSpendRub: number
  profitRub: number
  profitWithAdsRub: number
  profitabilityPct: number
  volumeLiters: number
  status: 'ok' | 'below-min-profit' | 'loss' | 'incomplete'
}

interface UnitEconomicsSummary {
  totalRows: number
  activeRows: number
  lossRows: number
  belowMinRows: number
  profitableRows: number
  avgProfitRub: number
  avgProfitabilityPct: number
  updatedAt: string | null
}

function getClientDateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end && dates.length < 120) {
    dates.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const DAILY_REQUEST_BATCH_SIZE = 3
const DAILY_REQUEST_BATCH_PAUSE_MS = 61000
const DAILY_REQUEST_RETRY_PAUSE_MS = 61000
const DAILY_BROWSER_CACHE_VERSION = 'v11'
const REPORT_BROWSER_CACHE_VERSION = 'v3'
const DAILY_TABLE_ROW_HOVER = 'transition-colors hover:bg-sky-50/70 hover:[&>td]:shadow-[inset_0_0_0_9999px_rgba(14,165,233,0.10)] dark:hover:bg-sky-950/20 dark:hover:[&>td]:shadow-[inset_0_0_0_9999px_rgba(56,189,248,0.10)]'

function nextMoscowWarmupIso() {
  const mskOffset = 3 * 60 * 60 * 1000
  const nowUtc = Date.now()
  const nowMsk = new Date(nowUtc + mskOffset)
  const warmMsk = new Date(nowMsk)
  warmMsk.setUTCHours(8, 30, 0, 0)
  if (nowMsk >= warmMsk) warmMsk.setUTCDate(warmMsk.getUTCDate() + 1)
  return new Date(warmMsk.getTime() - mskOffset).toISOString()
}

function reportCacheKey(section: string, scope: string, params: string) {
  return `wb-report-cache-${REPORT_BROWSER_CACHE_VERSION}:${section}:${scope}:${params}`
}

function latestReportCacheKey(section: string) {
  return `wb-report-cache-${REPORT_BROWSER_CACHE_VERSION}:latest:${section}`
}

function readReportCache<T>(section: string, scope: string, params: string): T | null {
  try {
    const raw = window.localStorage.getItem(reportCacheKey(section, scope, params))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.expiresAt && Date.now() > new Date(parsed.expiresAt).getTime()) {
      window.localStorage.removeItem(reportCacheKey(section, scope, params))
      return null
    }
    return parsed.data || null
  } catch {
    return null
  }
}

function readLatestReportCache<T>(section: string, scope: string): { params: string; data: T } | null {
  try {
    const raw = window.localStorage.getItem(latestReportCacheKey(section))
    if (!raw) return null
    const latest = JSON.parse(raw)
    if (!latest?.params || latest.scope !== scope) return null
    const data = readReportCache<T>(section, scope, latest.params)
    return data ? { params: latest.params, data } : null
  } catch {
    return null
  }
}

function writeReportCache<T>(section: string, scope: string, params: string, data: T) {
  try {
    const key = reportCacheKey(section, scope, params)
    window.localStorage.setItem(key, JSON.stringify({
      cachedAt: new Date().toISOString(),
      expiresAt: nextMoscowWarmupIso(),
      data,
    }))
    window.localStorage.setItem(latestReportCacheKey(section), JSON.stringify({
      scope,
      params,
      key,
      cachedAt: new Date().toISOString(),
    }))
  } catch {
    // Browser storage can be full or disabled; live loading still works.
  }
}

function appendAngelinaParam(params: URLSearchParams, includeAngelina: boolean) {
  if (includeAngelina) params.set('includeAngelina', '1')
}

function appendMetricParam(params: URLSearchParams, dataMetric: DataMetric) {
  if (dataMetric === 'sales') params.set('metric', 'sales')
}

function getMetricLabel(dataMetric: DataMetric) {
  return dataMetric === 'sales' ? 'Выкупы' : 'Заказы'
}

function getMetricRevenueLabel(dataMetric: DataMetric) {
  return dataMetric === 'sales' ? 'Выручка выкупов' : 'Выручка заказов'
}

function getDailyCacheScope(selection: string, entrepreneurs: EntrepreneurInfo[], user: AuthUser | null, includeAngelina = false, dataMetric: DataMetric = 'orders') {
  const selectedIds = selection === ALL_ENTREPRENEURS
    ? entrepreneurs.filter((ent) => ent.hasApiKey).map((ent) => String(ent.id))
    : selection.split(',').map((id) => id.trim()).filter(Boolean)
  const byId = new Map(entrepreneurs.map((ent) => [String(ent.id), ent]))
  const userScope = user ? `${user.role}:${user.id}` : 'anonymous'
  return selectedIds
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => {
      const ent = byId.get(id)
      return `${id}:${ent?.name || ''}:${ent?.wbApiKey || ''}`
    })
    .join('|')
    .concat(`::${userScope}${includeAngelina ? '::with-angelina' : ''}::${dataMetric}`)
}

function dailyCacheKey(scope: string, date: string) {
  return `wb-daily-cache-${DAILY_BROWSER_CACHE_VERSION}:${scope}:${date}`
}

function adPeriodCacheKey(scope: string, from: string, to: string) {
  return `wb-ad-period-cache-v1:${scope}:${from}:${to}`
}

function endOfMonthIso(date: string) {
  const [year, month] = date.split('-').map(Number)
  if (!year || !month) return null
  return new Date(Date.UTC(year, month, 1)).toISOString()
}

function readDailyCache(scope: string, date: string): DailyOrdersData | null {
  try {
    const raw = window.localStorage.getItem(dailyCacheKey(scope, date))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.expiresAt && Date.now() > new Date(parsed.expiresAt).getTime()) {
      window.localStorage.removeItem(dailyCacheKey(scope, date))
      return null
    }
    return parsed.data || null
  } catch {
    return null
  }
}

function writeDailyCache(scope: string, date: string, data: DailyOrdersData) {
  try {
    const expiresAt = endOfMonthIso(date)
    window.localStorage.setItem(dailyCacheKey(scope, date), JSON.stringify({
      cachedAt: new Date().toISOString(),
      expiresAt,
      data,
    }))
  } catch {
    // Browser storage can be full or disabled; live loading still works.
  }
}

function removeDailyCache(scope: string, date: string) {
  try {
    window.localStorage.removeItem(dailyCacheKey(scope, date))
  } catch {
    // Browser storage can be disabled; live loading still works.
  }
}

function readAdPeriodCache(scope: string, from: string, to: string): Record<number, number> | null {
  try {
    const raw = window.localStorage.getItem(adPeriodCacheKey(scope, from, to))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.expiresAt && Date.now() > new Date(parsed.expiresAt).getTime()) {
      window.localStorage.removeItem(adPeriodCacheKey(scope, from, to))
      return null
    }
    return parsed.spendByEntrepreneur || null
  } catch {
    return null
  }
}

function writeAdPeriodCache(scope: string, from: string, to: string, spendByEntrepreneur: Record<number, number>) {
  try {
    const expiresAt = endOfMonthIso(to)
    window.localStorage.setItem(adPeriodCacheKey(scope, from, to), JSON.stringify({
      cachedAt: new Date().toISOString(),
      expiresAt,
      spendByEntrepreneur,
    }))
  } catch {
    // Browser storage can be full or disabled; live loading still works.
  }
}

function writeDailyResponseCache(
  cacheScope: string,
  selection: string,
  entrepreneurs: EntrepreneurInfo[],
  user: AuthUser | null,
  date: string,
  response: DailyResponse,
  includeAngelina = false,
  dataMetric: DataMetric = 'orders',
  options: { skipAggregate?: boolean; excludeEntrepreneurIds?: Set<number> } = {},
) {
  if (response.daily && !options.skipAggregate) writeDailyCache(cacheScope, date, response.daily)
  if (!response.dailyByEntrepreneur) return

  for (const [entId, daily] of Object.entries(response.dailyByEntrepreneur)) {
    if (options.excludeEntrepreneurIds?.has(Number(entId))) continue
    const ent = entrepreneurs.find((item) => String(item.id) === String(entId))
    if (!ent) continue
    const singleScope = getDailyCacheScope(String(ent.id), entrepreneurs, user, includeAngelina, dataMetric)
    writeDailyCache(singleScope, date, daily)
  }

  if (selection !== ALL_ENTREPRENEURS && selection.includes(',')) {
    const selectedIds = selection.split(',').map((id) => id.trim()).filter(Boolean)
    for (const entId of selectedIds) {
      if (options.excludeEntrepreneurIds?.has(Number(entId))) continue
      const daily = response.dailyByEntrepreneur[String(entId)]
      if (!daily) continue
      const singleScope = getDailyCacheScope(String(entId), entrepreneurs, user, includeAngelina, dataMetric)
      writeDailyCache(singleScope, date, daily)
    }
  }
}

function sumDailyTotal(data: DailyOrdersData | null): number {
  return data?.dateTotals?.reduce((sum, value) => sum + Number(value || 0), 0) || 0
}

function sumDailyFbs(data: DailyOrdersData | null): number {
  return data?.fbsDateTotals?.reduce((sum, value) => sum + Number(value || 0), 0) || 0
}

function sumDailyFbo(data: DailyOrdersData | null): number {
  return data?.fboDateTotals?.reduce((sum, value) => sum + Number(value || 0), 0) || 0
}

function sumDailyRevenue(data: DailyOrdersData | null): number {
  return data?.revenueDateTotals?.reduce((sum, value) => sum + Number(value || 0), 0) || 0
}

function getDailyProductIdByName(data: DailyOrdersData | null): Map<string, number> {
  return new Map((data?.products || []).map((product) => [product.name, product.id]))
}

function getDailyProductTotalByName(data: DailyOrdersData | null, productName: string, fulfillmentFilter: 'all' | 'fbs' | 'fbo' = 'all'): number {
  const productId = getDailyProductIdByName(data).get(productName)
  if (productId === undefined) return 0
  const totals = fulfillmentFilter === 'fbs' ? data?.fbsProductTotals
    : fulfillmentFilter === 'fbo' ? data?.fboProductTotals
    : data?.productTotals
  return Number(totals?.[productId] || 0)
}

function getDailyProductDateValueByName(data: DailyOrdersData | null, productName: string, dateIdx: number, fulfillmentFilter: 'all' | 'fbs' | 'fbo' = 'all'): number {
  const productId = getDailyProductIdByName(data).get(productName)
  if (productId === undefined) return 0
  const pivot = fulfillmentFilter === 'fbs' ? data?.fbsPivot
    : fulfillmentFilter === 'fbo' ? data?.fboPivot
    : data?.pivot
  return Number(pivot?.[productId]?.[dateIdx] || 0)
}

function getDailyDateTotals(data: DailyOrdersData | null, fulfillmentFilter: 'all' | 'fbs' | 'fbo' = 'all'): number[] {
  if (!data) return []
  if (fulfillmentFilter === 'fbs') return data.fbsDateTotals || []
  if (fulfillmentFilter === 'fbo') return data.fboDateTotals || []
  return data.dateTotals || []
}

function cloneDashboard(data: DashboardData): DashboardData {
  return JSON.parse(JSON.stringify(data))
}

function createDashboardShell(selectedIds: string[], entrepreneurs: EntrepreneurInfo[]): DashboardData {
  const mskNow = new Date(Date.now() + 3 * 3600000)
  const yesterday = new Date(mskNow.getTime() - 86400000).toISOString().split('T')[0]
  const dayBefore = new Date(mskNow.getTime() - 2 * 86400000).toISOString().split('T')[0]
  const selected = selectedIds.includes(ALL_ENTREPRENEURS)
    ? entrepreneurs.filter((ent) => ent.hasApiKey)
    : entrepreneurs.filter((ent) => selectedIds.includes(String(ent.id)))

  const period = (days: number) => ({
    total: 0,
    fbs: 0,
    fbo: 0,
    revenue: 0,
    dateFrom: new Date(mskNow.getTime() - days * 86400000).toISOString().split('T')[0],
    dateTo: yesterday,
  })
  const prevPeriod = (days: number) => ({
    total: 0,
    fbs: 0,
    fbo: 0,
    revenue: 0,
    dateFrom: new Date(mskNow.getTime() - days * 2 * 86400000).toISOString().split('T')[0],
    dateTo: new Date(mskNow.getTime() - (days + 1) * 86400000).toISOString().split('T')[0],
  })
  const emptyAd = { totalSpend: 0, drr: null, entrepreneurs: selected.map((ent) => ({ id: ent.id, name: ent.name, spend: 0, revenue: 0, drr: null })) }
  const emptyDynamics = { growth: [], decline: [] }
  const week = period(7)

  return {
    totalOrders: 0,
    yesterdayOrders: 0,
    dayBeforeYesterdayOrders: 0,
    yesterdayDate: yesterday,
    monthOrders: 0,
    prevMonthOrders: 0,
    latestDate: null,
    productCount: 0,
    entrepreneurStats: selected.map((ent) => ({ id: ent.id, name: ent.name, totalOrders: 0 })),
    weekEntrepreneurStats: selected.map((ent) => ({ id: ent.id, name: ent.name, totalOrders: 0 })),
    weekTotalOrders: 0,
    weekDateFrom: week.dateFrom,
    weekDateTo: week.dateTo,
    dayChange: null,
    monthChange: null,
    yesterdayFbsOrders: 0,
    yesterdayFboOrders: 0,
    dayBeforeYesterdayFbsOrders: 0,
    dayBeforeYesterdayFboOrders: 0,
    chartDates: [],
    chartFbs: {},
    chartFbo: {},
    periodStats: {
      yesterday: period(1),
      week,
      twoWeeks: period(14),
      month: period(30),
    },
    prevPeriodStats: {
      yesterday: prevPeriod(1),
      week: prevPeriod(7),
      twoWeeks: prevPeriod(14),
      month: prevPeriod(30),
    },
    adSpendByPeriod: {
      yesterday: emptyAd,
      week: emptyAd,
      twoWeeks: emptyAd,
      month: emptyAd,
    },
    productDynamics: {
      yesterday: emptyDynamics,
      week: emptyDynamics,
      twoWeeks: emptyDynamics,
      month: emptyDynamics,
    },
  }
}

const OPTIONAL_TAB_IDS = ['daily', 'production', 'supply', 'monthly', 'ads', 'growth', 'unit', 'compare'] as const
type OptionalTabId = typeof OPTIONAL_TAB_IDS[number]

const DEFAULT_VISIBLE_OPTIONAL_TABS: OptionalTabId[] = [...OPTIONAL_TAB_IDS]

const OPTIONAL_TAB_LABELS: Record<OptionalTabId, string> = {
  daily: 'Ежедневные',
  production: 'Нагрузка на производство',
  supply: 'Поставки',
  monthly: 'Динамика',
  ads: 'Реклама',
  growth: 'Рост',
  unit: 'Юнит экономика',
  compare: 'API vs Excel',
}

interface MonthlyData {
  entrepreneurs: { id: number; name: string }[]
  products: { id: number; name: string }[]
  months: string[]
  monthlyData: Record<string, Record<number, number>>
  monthlyRevenue: Record<string, Record<number, number>>
  productMonthlyData: Record<string, Record<number, number>>
  productMonthlyRevenue: Record<string, Record<number, number>>
  adSpendByMonth: Record<string, Record<number, number>>
  entrepreneurMonthly: Record<string, Record<number, { orders: number; revenue: number; adSpend: number; drr: number | null }>>
  monthStats: { month: string; orders: number; revenue: number; adSpend: number; drr: number | null; momOrdersPct: number | null; yoyOrdersPct: number | null }[]
  productDynamics: {
    growth: { id: number; name: string; currentOrders: number; previousOrders: number; diff: number; diffPercent: number | null }[]
    decline: { id: number; name: string; currentOrders: number; previousOrders: number; diff: number; diffPercent: number | null }[]
  }
  seasonality: { id: number; name: string; peakMonth: string; peakOrders: number; avgOrders: number; uplift: number }[]
}

interface AdSpendData {
  year?: number
  period?: { from: string; to: string }
  totalSpend?: number
  totalRevenue?: number
  totalBuyoutRevenue?: number
  buyoutDrr?: number | null
  drr?: number | null
  source?: string
  entrepreneurs: {
    id: number
    name: string
    spend?: number
    revenue?: number
    buyoutRevenue?: number
    buyoutDrr?: number | null
    drr?: number | null
    campaigns?: { advertId: number; name: string; spend: number; revenue?: number; orders?: number; drr?: number | null }[]
  }[]
  grouped: Record<number, { entrepreneur: string; budget: number; months: { month: number; actual: number; topCampaigns?: { advertId: number; name: string; spend: number }[] }[] }>
  errors?: RateLimitError[]
}

interface CompareData {
  entrepreneur: { id: number; name: string }
  dateRange: { from: string; to: string }
  dataSource: string
  wbError: string | null
  totals: {
    excelTotal: number
    wbTotal: number
    matchedExcelTotal: number
    matchedWbTotal: number
    totalDiff: number
    matchedDiff: number
  }
  productSummary: Array<{
    productId: number | null
    productName: string
    excelSize: string
    wbSize: string
    wbBySize: Record<string, number>
    wbSubject: string
    wbCategory: string
    excelTotal: number
    wbTotal: number
    diff: number
    diffPercent: string
    isMatched: boolean
    wbArticleCount: number
    matchMethod: string
  }>
  unmatchedBySubject: Array<{
    subject: string
    articleCount: number
    totalOrders: number
    examples: string[]
  }>
}

interface RateLimitError {
  id: number
  name: string
  error: string
}

interface ProductionLoadData {
  capacity: number
  dates: string[]
  products: { id: number; name: string; multiplier: number }[]
  pivot: Record<number, Record<number, number>>
  ordersPivot: Record<number, Record<number, number>>
  dateItems: number[]
  dateOrders: number[]
  dateLoadPct: number[]
  previousDateItems: number[]
  previousDateOrders: number[]
  previousDateLoadPct: number[]
  productItems: Record<number, number>
  productOrders: Record<number, number>
  forecast: { date: string; predictedItems: number; loadPct: number }[]
  seasonalityAlerts: { product: string; peakMonthDay: string; peakDate: string; daysToPeak: number; avg: number; peakAvg: number; uplift: number }[]
  summary: {
    yesterday: { date: string; items: number; loadPct: number; orders: number }
    week: { dateFrom: string; dateTo: string; totalItems: number; avgLoadPct: number; previousTotalItems: number; previousAvgLoadPct: number; days: number }
    month: { dateFrom: string; dateTo: string; totalItems: number; avgLoadPct: number; previousTotalItems: number; previousAvgLoadPct: number; days: number }
  }
}

interface SupplyData {
  dateFrom: string
  dateTo: string
  daysInRange: number
  supplyDays: number
  coefficient: number
  totalArticles: number
  totalSupplyQty: number
  totalFboStock: number
  criticalArticles: number
  articles: Array<{
    article: string
    subject: string
    brand: string
    totalOrders: number
    fbsOrders: number
    fboOrders: number
    avgDaily: number
    fboStock: number
    daysUntilOos: number | null
    warehouses: Array<{
      warehouse: string
      orders: number
      avgDaily: number
      stock: number
      recommendedQty: number
      daysUntilOos: number | null
    }>
    supplyQty: number
  }>
}

interface GrowthPotentialData {
  dateFrom: string
  dateTo: string
  minOpens: number
  source: string
  items: Array<{
    entrepreneurId: number
    entrepreneurName: string
    nmId: number
    article: string
    title: string
    subject: string
    opens: number
    carts: number
    orders: number
    orderSum: number
    ctrToCart: number
    conversion: number
    fboStock: number
    daysUntilOos: number | null
    potentialScore: number
    recommendation: string
    dataSource: 'promotion'
    spend: number
    views: number
    ctr: number
    cpc: number
  }>
  errors?: RateLimitError[]
  notices?: string[]
}

const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-')
  return `${MONTH_SHORT[Number(monthNum) - 1] || monthNum} ${year?.slice(2) || ''}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU')
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDateShort(dateStr: string): string {
  try {
    const d = parseISO(dateStr)
    return format(d, 'd MMM', { locale: ru })
  } catch {
    return dateStr
  }
}

function formatDateFull(dateStr: string): string {
  try {
    const d = parseISO(dateStr)
    return format(d, 'd MMMM yyyy', { locale: ru })
  } catch {
    return dateStr
  }
}

// --- Rate Limit Errors Alert ---
function RateLimitAlert({ errors }: { errors: RateLimitError[] }) {
  if (!errors || errors.length === 0) return null
  return (
    <Alert className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Данные загружаются с задержкой</AlertTitle>
      <AlertDescription>
        Для некоторых ИП WB API отвечает медленнее из-за лимитов: {errors.map(e => e.name).join(', ')}. Уже загруженные данные отображаются, остальные подтянутся позже.
      </AlertDescription>
    </Alert>
  )
}

// --- Empty State ---
function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
        <p className="text-muted-foreground text-lg font-medium">{message}</p>
      </CardContent>
    </Card>
  )
}

function AuthScreen({ onAuth }: { onAuth: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Ошибка авторизации')
        return
      }
      onAuth(json.user)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center mb-2">
            <Package className="h-5 w-5 text-white" />
          </div>
          <CardTitle>{mode === 'login' ? 'Вход в WB Отчёты' : 'Создать аккаунт'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Ник</Label>
            <div className="relative">
              <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                className="pl-9"
                autoComplete="username"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Пароль</Label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                className="pl-9"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>
          <Button onClick={submit} disabled={loading || !username.trim() || !password} className="w-full">
            {loading ? 'Проверка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError(null)
            }}
          >
            {mode === 'login' ? 'Создать новый аккаунт' : 'Уже есть аккаунт'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

const ALL_ENTREPRENEURS = 'all'

function selectionToParam(selectedIds: string[]): string {
  if (selectedIds.length === 0 || selectedIds.includes(ALL_ENTREPRENEURS)) return ALL_ENTREPRENEURS
  return selectedIds.join(',')
}

function selectionLabel(selectedIds: string[], entrepreneurs: EntrepreneurInfo[], placeholder = 'Выберите ИП'): string {
  if (selectedIds.length === 0) return placeholder
  if (selectedIds.includes(ALL_ENTREPRENEURS)) return 'Все ИП'
  if (selectedIds.length === 1) {
    return entrepreneurs.find((e) => String(e.id) === selectedIds[0])?.name || placeholder
  }
  return `Выбрано ИП: ${selectedIds.length}`
}

function MultiEntrepreneurSelect({
  entrepreneurs,
  selectedIds,
  onChange,
  className = '',
  onlyWithApi = false,
  placeholder = 'Выберите ИП',
  allowAll = true,
  maxSelected,
}: {
  entrepreneurs: EntrepreneurInfo[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  className?: string
  onlyWithApi?: boolean
  placeholder?: string
  allowAll?: boolean
  maxSelected?: number
}) {
  const options = onlyWithApi ? entrepreneurs.filter((e) => e.hasApiKey) : entrepreneurs
  const hasAll = selectedIds.includes(ALL_ENTREPRENEURS)

  const toggleId = (id: string) => {
    if (id === ALL_ENTREPRENEURS) {
      if (!allowAll) return
      onChange([ALL_ENTREPRENEURS])
      return
    }

    const current = selectedIds.filter((v) => v !== ALL_ENTREPRENEURS)
    let next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    if (maxSelected && next.length > maxSelected) next = [id]
    onChange(next.length > 0 ? next : (allowAll ? [ALL_ENTREPRENEURS] : []))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`h-10 justify-between gap-2 px-3 font-normal ${className}`}>
          <span className="truncate">{selectionLabel(selectedIds, options, placeholder)}</span>
          {selectedIds.length > 0 && !hasAll && (
            <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{selectedIds.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,320px)] p-2">
        <div className="space-y-1">
          {allowAll && (
            <>
              <div
                role="button"
                tabIndex={0}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                onClick={() => toggleId(ALL_ENTREPRENEURS)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleId(ALL_ENTREPRENEURS) }}
              >
                <Checkbox checked={hasAll} />
                <span className="font-medium">Все ИП</span>
              </div>
              <div className="my-1 h-px bg-border" />
            </>
          )}
          <ScrollArea className="max-h-64">
            <div className="space-y-1 pr-2">
              {options.map((e) => {
                const id = String(e.id)
                const checked = !hasAll && selectedIds.includes(id)
                return (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => toggleId(id)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleId(id) }}
                  >
                    <Checkbox checked={checked} />
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    {e.hasApiKey && <Badge variant="secondary" className="text-[10px]">API</Badge>}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- Dashboard Tab ---
function DashboardTab({ data, buyoutData, showBuyouts, entrepreneurs, selectedEnt, onSelectEnt, dashboardPeriod, onDashboardPeriodChange, onShowBuyoutsChange, dataSource, onLoad, loading, rateLimitErrors }: {
  data: DashboardData | null
  buyoutData: DashboardData | null
  showBuyouts: boolean
  entrepreneurs: EntrepreneurInfo[]
  selectedEnt: string[]
  onSelectEnt: (ids: string[]) => void
  dashboardPeriod: DashboardPeriod
  onDashboardPeriodChange: (period: DashboardPeriod) => void
  onShowBuyoutsChange: (enabled: boolean) => void
  dataSource?: 'excel' | 'wbapi'
  onLoad: () => void
  loading: boolean
  rateLimitErrors: RateLimitError[]
}) {
  const [showChart, setShowChart] = useState(false)

  // Period change is purely client-side — periodStats for all periods are already in data
  const handlePeriodChange = (v: string) => {
    if (v) onDashboardPeriodChange(v as DashboardPeriod)
  }

  // Current period stats
  const periodLabel: Record<string, string> = {
    yesterday: 'Вчера',
    week: 'Неделя',
    twoWeeks: '2 недели',
    month: 'Месяц',
  }
  const prevPeriodLabel: Record<string, string> = {
    yesterday: 'Позавчера',
    week: 'Пред. неделя',
    twoWeeks: 'Пред. 2 нед',
    month: 'Пред. месяц',
  }

  const currentPeriod = data ? data.periodStats[dashboardPeriod] : null
  const prevPeriod = data ? data.prevPeriodStats[dashboardPeriod] : null
  const currentAd = data ? data.adSpendByPeriod[dashboardPeriod] : null
  const currentDynamics = data ? data.productDynamics[dashboardPeriod] : null
  const periodChange = currentPeriod && prevPeriod && prevPeriod.total > 0
    ? ((currentPeriod.total - prevPeriod.total) / prevPeriod.total * 100).toFixed(1)
    : null

  // Chart data for recharts — filtered by selected period
  const chartData = data ? data.chartDates
    .filter(d => d >= data.periodStats[dashboardPeriod].dateFrom && d <= data.periodStats[dashboardPeriod].dateTo)
    .map(d => ({
      date: d.slice(5),
      fbs: data.chartFbs[d] || 0,
      fbo: data.chartFbo[d] || 0,
    }))
    : []

  const comparisonChartData = data && currentPeriod && prevPeriod ? (() => {
    const currentDates = data.chartDates.filter(d => d >= currentPeriod.dateFrom && d <= currentPeriod.dateTo)
    const previousDates = data.chartDates.filter(d => d >= prevPeriod.dateFrom && d <= prevPeriod.dateTo)
    const len = Math.max(currentDates.length, previousDates.length)
    return Array.from({ length: len }, (_, index) => {
      const currentDate = currentDates[index]
      const previousDate = previousDates[index]
      return {
        date: currentDate ? currentDate.slice(5) : String(index + 1),
        current: currentDate ? (data.chartFbs[currentDate] || 0) + (data.chartFbo[currentDate] || 0) : 0,
        previous: previousDate ? (data.chartFbs[previousDate] || 0) + (data.chartFbo[previousDate] || 0) : 0,
      }
    })
  })() : []

  const displayProductName = (row: { name: string; article: string }) => {
    const name = row.name.trim()
    const article = row.article.trim()
    return article && name === article ? article : name
  }

  return (
    <div className="space-y-6">
      {/* Rate limit errors */}
      <RateLimitAlert errors={rateLimitErrors} />

      {/* ИП Selector + Period + Load Button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={onSelectEnt}
          className="w-full sm:w-64"
          placeholder="Выберите ИП"
        />
        <ToggleGroup type="single" value={dashboardPeriod} onValueChange={handlePeriodChange} className="w-full justify-start overflow-x-auto rounded-md border sm:w-auto">
          <ToggleGroupItem value="yesterday" className="text-xs px-2 py-1">Вчера</ToggleGroupItem>
          <ToggleGroupItem value="week" className="text-xs px-2 py-1">Неделя</ToggleGroupItem>
          <ToggleGroupItem value="twoWeeks" className="text-xs px-2 py-1">2 нед</ToggleGroupItem>
          <ToggleGroupItem value="month" className="text-xs px-2 py-1">Месяц</ToggleGroupItem>
        </ToggleGroup>
        <label className="flex w-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-xs sm:w-auto">
          <span className="whitespace-nowrap font-medium">Выкупы</span>
          <Switch checked={showBuyouts} onCheckedChange={onShowBuyoutsChange} />
        </label>
        <Button onClick={() => onLoad()} disabled={loading || selectedEnt.length === 0} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Загрузка...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Загрузить
            </>
          )}
        </Button>
        {data && (
          <Badge variant={dataSource === 'wbapi' ? 'default' : 'secondary'} className={`text-xs ${dataSource === 'wbapi' ? 'bg-emerald-600' : ''}`}>
            {dataSource === 'wbapi' ? 'WB API' : 'Excel'}
          </Badge>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && !data && <DashboardSkeleton />}

      {/* Empty state when no data and not loading */}
      {!loading && !data && (
        <EmptyState
          message={selectedEnt.length > 0 ? 'Нажмите "Загрузить" для получения данных' : 'Выберите ИП и нажмите "Загрузить"'}
          icon={<LayoutDashboard className="h-12 w-12" />}
        />
      )}

      {/* Data display — keep visible even during re-fetch so period switch feels instant */}
      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{periodLabel[dashboardPeriod]}</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(currentPeriod?.total || 0)}</div>
	                <p className="text-xs text-muted-foreground mt-1">
	                  {formatDateShort(currentPeriod?.dateFrom || '')} — {formatDateShort(currentPeriod?.dateTo || '')}
	                </p>
                  {showBuyouts && <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(buyoutData?.periodStats[dashboardPeriod]?.total || 0)}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{prevPeriodLabel[dashboardPeriod]}</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {periodChange !== null ? (
                    <span className={Number(periodChange) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {Number(periodChange) >= 0 ? '+' : ''}{periodChange}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">было: {formatNumber(prevPeriod?.total || 0)}</p>
              </CardContent>
            </Card>

            <Card className="border-violet-200 dark:border-violet-900">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-violet-700 dark:text-violet-400">ДРР</CardTitle>
                <Megaphone className="h-4 w-4 text-violet-700 dark:text-violet-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-violet-700 dark:text-violet-400">
                  {currentAd?.drr === null || currentAd?.drr === undefined ? '—' : `${currentAd.drr}%`}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  реклама {formatNumber(currentAd?.totalSpend || 0)} ₽ / заказы {formatNumber(currentPeriod?.revenue || 0)} ₽
                </p>
                {showBuyouts && (
                  <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    по выкупам: {buyoutData?.periodStats[dashboardPeriod]?.revenue ? `${Math.round(((currentAd?.totalSpend || 0) / buyoutData.periodStats[dashboardPeriod].revenue) * 1000) / 10}%` : '—'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {currentAd && currentAd.entrepreneurs.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ДРР по кабинетам</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {currentAd.entrepreneurs.map((row) => (
                    <div key={row.id} className="rounded-md border p-3">
                      <div className="truncate text-sm font-medium">{row.name}</div>
                      <div className="mt-1 flex items-end justify-between gap-2">
                        <span className="text-lg font-bold">{row.drr === null ? '—' : `${row.drr}%`}</span>
                        <span className="text-xs text-muted-foreground">{formatNumber(row.spend)} ₽</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Динамика заказов{showBuyouts ? ' и выкупов' : ''}: {periodLabel[dashboardPeriod]} vs {prevPeriodLabel[dashboardPeriod]}</CardTitle>
            </CardHeader>
            <CardContent>
              {comparisonChartData.length > 0 ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="current" name={periodLabel[dashboardPeriod]} stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="previous" name={prevPeriodLabel[dashboardPeriod]} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Нет данных для графика</p>
              )}
            </CardContent>
          </Card>

          {/* FBS / FBO breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <CardTitle className="text-base">Заказы FBS / FBO{showBuyouts ? ' + выкупы' : ''}</CardTitle>
                  <ToggleGroup type="single" value={dashboardPeriod} onValueChange={handlePeriodChange} className="justify-start overflow-x-auto rounded-md border">
                    <ToggleGroupItem value="yesterday" className="text-xs px-2 py-1">Вчера</ToggleGroupItem>
                    <ToggleGroupItem value="week" className="text-xs px-2 py-1">Неделя</ToggleGroupItem>
                    <ToggleGroupItem value="twoWeeks" className="text-xs px-2 py-1">2 нед</ToggleGroupItem>
                    <ToggleGroupItem value="month" className="text-xs px-2 py-1">Месяц</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="chart-toggle" className="text-xs text-muted-foreground cursor-pointer">График</Label>
                  <Switch id="chart-toggle" checked={showChart} onCheckedChange={setShowChart} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!showChart ? (
                /* Card view */
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Card className="border-border">
                    <CardContent className="pt-3 pb-3">
	                      <div className="text-xs text-muted-foreground mb-1">Всего</div>
	                      <div className="text-xl font-bold">{formatNumber(data.periodStats[dashboardPeriod].total)}</div>
                        {showBuyouts && <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(buyoutData?.periodStats[dashboardPeriod]?.total || 0)}</div>}
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 dark:border-amber-800">
                    <CardContent className="pt-3 pb-3">
	                      <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">FBS</div>
	                      <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatNumber(data.periodStats[dashboardPeriod].fbs)}</div>
                        {showBuyouts && <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(buyoutData?.periodStats[dashboardPeriod]?.fbs || 0)}</div>}
                      <div className="text-xs text-muted-foreground">
                        {data.periodStats[dashboardPeriod].total > 0 ? (data.periodStats[dashboardPeriod].fbs / data.periodStats[dashboardPeriod].total * 100).toFixed(1) : 0}%
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-sky-200 dark:border-sky-800">
                    <CardContent className="pt-3 pb-3">
	                      <div className="text-xs text-sky-700 dark:text-sky-400 mb-1">FBO</div>
	                      <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{formatNumber(data.periodStats[dashboardPeriod].fbo)}</div>
                        {showBuyouts && <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(buyoutData?.periodStats[dashboardPeriod]?.fbo || 0)}</div>}
                      <div className="text-xs text-muted-foreground">
                        {data.periodStats[dashboardPeriod].total > 0 ? (data.periodStats[dashboardPeriod].fbo / data.periodStats[dashboardPeriod].total * 100).toFixed(1) : 0}%
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* Line chart FBS vs FBO using recharts */
                chartData.length > 0 ? (
                  <div className="w-full h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          interval={dashboardPeriod === 'month' ? 2 : dashboardPeriod === 'twoWeeks' ? 1 : 0}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          labelStyle={{ fontWeight: 600 }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="fbs" name="FBS" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="fbo" name="FBO" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет данных для графика</p>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Заказы по ИП за неделю{showBuyouts ? ' + выкупы' : ''}
                <Badge variant="secondary" className="text-xs">WB API</Badge>
                {data.weekDateFrom && data.weekDateTo && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({formatDateShort(data.weekDateFrom)} — {formatDateShort(data.weekDateTo)})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.weekEntrepreneurStats
                  .sort((a, b) => b.totalOrders - a.totalOrders)
                  .map((e) => {
                    const pct = data.weekTotalOrders > 0 ? (e.totalOrders / data.weekTotalOrders) * 100 : 0
                    const ent = entrepreneurs.find(en => en.id === e.id)
                    return (
                      <div key={e.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium flex items-center gap-2">
                            {e.name}
                            {ent?.hasApiKey && <Badge variant="secondary" className="text-xs">API</Badge>}
                          </span>
                          <span className="text-muted-foreground">{formatNumber(e.totalOrders)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Товары: рост и просадка</CardTitle>
              <p className="text-xs text-muted-foreground">
                Сравнение: {periodLabel[dashboardPeriod]} ({formatDateShort(currentPeriod?.dateFrom || '')} — {formatDateShort(currentPeriod?.dateTo || '')}) vs {prevPeriodLabel[dashboardPeriod]} ({formatDateShort(prevPeriod?.dateFrom || '')} — {formatDateShort(prevPeriod?.dateTo || '')})
              </p>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="product-dynamics">
                  <AccordionTrigger>
                    <span className="flex flex-wrap items-center gap-2">
                      <span>Показать детализацию</span>
                      <Badge variant="secondary" className="text-xs">
                        рост {currentDynamics?.growth.length || 0}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        просадка {currentDynamics?.decline.length || 0}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="min-w-0">
                        <div className="mb-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">Какие товары дали рост</div>
                        <div className="space-y-2 sm:hidden">
                          {(currentDynamics?.growth || []).slice(0, 10).map((row) => (
                            <div key={row.name} className="rounded-md border p-3">
                              <div className="break-words text-sm font-medium leading-snug">{displayProductName(row)}</div>
                              {row.article && row.name.trim() !== row.article.trim() && (
                                <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{row.article}</div>
                              )}
                              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">+{formatNumber(row.diff)}</span>
                                <span className="text-xs text-muted-foreground">{row.diffPercent === null ? 'новый' : `+${row.diffPercent}%`}</span>
                              </div>
                            </div>
                          ))}
                          {(!currentDynamics || currentDynamics.growth.length === 0) && (
                            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">Нет товаров с ростом</div>
                          )}
                        </div>
                        <div className="hidden overflow-x-auto rounded-md border sm:block">
                          <table className="w-full text-xs sm:text-sm">
                            <tbody>
                              {(currentDynamics?.growth || []).slice(0, 10).map((row) => (
                                <tr key={row.name} className="border-b last:border-b-0">
                                  <td className="px-3 py-2">
                                    <div className="font-medium">{displayProductName(row)}</div>
                                    {row.article && row.name.trim() !== row.article.trim() && (
                                      <div className="font-mono text-[10px] text-muted-foreground">{row.article}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-emerald-700 dark:text-emerald-400">+{formatNumber(row.diff)}</td>
                                  <td className="px-3 py-2 text-right text-muted-foreground">{row.diffPercent === null ? 'новый' : `+${row.diffPercent}%`}</td>
                                </tr>
                              ))}
                              {(!currentDynamics || currentDynamics.growth.length === 0) && (
                                <tr><td className="px-3 py-4 text-center text-muted-foreground">Нет товаров с ростом</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-2 text-sm font-medium text-red-700 dark:text-red-400">Антирейтинг / просадка</div>
                        <div className="space-y-2 sm:hidden">
                          {(currentDynamics?.decline || []).slice(0, 10).map((row) => (
                            <div key={row.name} className="rounded-md border p-3">
                              <div className="break-words text-sm font-medium leading-snug">{displayProductName(row)}</div>
                              {row.article && row.name.trim() !== row.article.trim() && (
                                <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{row.article}</div>
                              )}
                              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold text-red-700 dark:text-red-400">{formatNumber(row.diff)}</span>
                                <span className="text-xs text-muted-foreground">{row.diffPercent === null ? '—' : `${row.diffPercent}%`}</span>
                              </div>
                            </div>
                          ))}
                          {(!currentDynamics || currentDynamics.decline.length === 0) && (
                            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">Нет товаров с просадкой</div>
                          )}
                        </div>
                        <div className="hidden overflow-x-auto rounded-md border sm:block">
                          <table className="w-full text-xs sm:text-sm">
                            <tbody>
                              {(currentDynamics?.decline || []).slice(0, 10).map((row) => (
                                <tr key={row.name} className="border-b last:border-b-0">
                                  <td className="px-3 py-2">
                                    <div className="font-medium">{displayProductName(row)}</div>
                                    {row.article && row.name.trim() !== row.article.trim() && (
                                      <div className="font-mono text-[10px] text-muted-foreground">{row.article}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-red-700 dark:text-red-400">{formatNumber(row.diff)}</td>
                                  <td className="px-3 py-2 text-right text-muted-foreground">{row.diffPercent === null ? '—' : `${row.diffPercent}%`}</td>
                                </tr>
                              ))}
                              {(!currentDynamics || currentDynamics.decline.length === 0) && (
                                <tr><td className="px-3 py-4 text-center text-muted-foreground">Нет товаров с просадкой</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// --- Helper: extract base name (without size/variant) from product name ---
// Groups related product variants under a single parent name:
//   "салфетки 55х55" → "Салфетки"
//   "салфетки набор 6 шт" → "Салфетки"
//   "салфетки с вышивкой 53х53" → "Салфетки"
//   "дорожки набор" → "Дорожки"
//   "дорожки 150 см" → "Дорожки"
//   "подушка декоративная 45х45" → "Подушка декоративная"
function extractBaseName(name: string): string {
  const lower = name.toLowerCase()

  // ─── Special grouping for салфетки (including "с вышивкой") ───
  if (lower.startsWith('салфетк')) {
    return 'Салфетки'
  }

  // ─── Special grouping for дорожки ───
  if (lower.startsWith('дорожки')) {
    return 'Дорожки'
  }

  // ─── Default: strip trailing size patterns ───
  // " NxM" (e.g. "120х40") or " N см" (e.g. "150 см")
  return name.replace(/\s+\d{1,3}(х\d{1,3}| см)\s*$/, '').trim()
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
}

function getFulfillmentLabel(filter: 'all' | 'fbs' | 'fbo') {
  if (filter === 'fbs') return 'FBS'
  if (filter === 'fbo') return 'FBO'
  return 'Все'
}

// --- Data Table Component (shared) ---
function DataTable({ data, fulfillmentFilter = 'all', buyoutData = null, showBuyouts = false }: { data: DailyOrdersData; fulfillmentFilter?: 'all' | 'fbs' | 'fbo'; buyoutData?: DailyOrdersData | null; showBuyouts?: boolean }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [sortDateIdx, setSortDateIdx] = useState<number | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)

  // Select the appropriate pivot and totals based on filter
  const activePivot = fulfillmentFilter === 'fbs' ? data.fbsPivot
    : fulfillmentFilter === 'fbo' ? data.fboPivot
    : data.pivot
  const activeDateTotals = fulfillmentFilter === 'fbs' ? data.fbsDateTotals
    : fulfillmentFilter === 'fbo' ? data.fboDateTotals
    : data.dateTotals
  const activeProductTotals = fulfillmentFilter === 'fbs' ? data.fbsProductTotals
    : fulfillmentFilter === 'fbo' ? data.fboProductTotals
    : data.productTotals
  const previousPivot = fulfillmentFilter === 'fbs' ? data.previousFbsPivot || {}
    : fulfillmentFilter === 'fbo' ? data.previousFboPivot || {}
    : data.previousPivot || {}

  const { dates, products } = data
  const grandTotal = activeProductTotals ? Object.values(activeProductTotals).reduce((s, v) => s + v, 0) : 0
  const buyoutDateTotals = showBuyouts ? getDailyDateTotals(buyoutData, fulfillmentFilter) : []
  const grandBuyoutTotal = buyoutDateTotals.reduce((sum, value) => sum + Number(value || 0), 0)
  const showFulfillmentBreakdown = fulfillmentFilter === 'all'
  const maxCellValue = Math.max(1, ...Object.values(activePivot).flatMap((row) => Object.values(row)))
  const heatStyle = (value: number | undefined) => {
    const val = value || 0
    if (!val) return undefined
    const ratio = val / maxCellValue
    if (ratio >= 0.75) return { backgroundColor: 'rgba(5, 150, 105, 0.42)', color: 'rgb(6, 78, 59)', fontWeight: 700 }
    if (ratio >= 0.5) return { backgroundColor: 'rgba(16, 185, 129, 0.32)', color: 'rgb(6, 95, 70)', fontWeight: 650 }
    if (ratio >= 0.25) return { backgroundColor: 'rgba(52, 211, 153, 0.24)' }
    return { backgroundColor: 'rgba(167, 243, 208, 0.35)' }
  }

  // Build grouped structure: baseName → { hasSize, children: [product, ...] }
  const groupedProducts = (() => {
    const groups: Map<string, { baseName: string; hasSize: boolean; children: typeof products }> = new Map()

    for (const p of products) {
      const baseName = extractBaseName(p.name)
      const hasVariant = baseName.toLowerCase() !== p.name.toLowerCase() // variant was stripped → this product has a size/variant

      if (!groups.has(baseName)) {
        groups.set(baseName, { baseName, hasSize: false, children: [] })
      }
      const group = groups.get(baseName)!
      if (hasVariant) group.hasSize = true
      group.children.push(p)
    }

    // Convert to array, sort by total descending
    const result = [...groups.values()].map(group => {
      const groupTotal = group.children.reduce((s, p) => s + (activeProductTotals?.[p.id] || 0), 0)
      return { ...group, total: groupTotal }
    }).sort((a, b) => {
      if (sortDateIdx !== null) {
        const aDate = a.children.reduce((s, p) => s + (activePivot[p.id]?.[sortDateIdx] || 0), 0)
        const bDate = b.children.reduce((s, p) => s + (activePivot[p.id]?.[sortDateIdx] || 0), 0)
        return bDate - aDate
      }
      return b.total - a.total
    })

    return result
  })()

  const selectedProduct = selectedProductId !== null ? products.find((p) => p.id === selectedProductId) : null
  const selectedGroup = selectedGroupName ? groupedProducts.find((group) => group.baseName === selectedGroupName) : null
  const selectedChartTitle = selectedProduct?.name || selectedGroup?.baseName || ''
  const selectedChartData = selectedProduct ? dates.map((date, index) => ({
    date: formatDateShort(date),
    orders: activePivot[selectedProduct.id]?.[index] || 0,
    previous: previousPivot[selectedProduct.id]?.[index] || 0,
  })) : selectedGroup ? dates.map((date, index) => ({
    date: formatDateShort(date),
    orders: selectedGroup.children.reduce((sum, product) => sum + (activePivot[product.id]?.[index] || 0), 0),
    previous: selectedGroup.children.reduce((sum, product) => sum + (previousPivot[product.id]?.[index] || 0), 0),
  })) : []

  const selectProductChart = (productId: number) => {
    setSelectedProductId(productId)
    setSelectedGroupName(null)
  }

  const selectGroupChart = (baseName: string) => {
    setSelectedProductId(null)
    setSelectedGroupName(baseName)
  }

  const toggleGroup = (baseName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(baseName)) {
        next.delete(baseName)
      } else {
        next.add(baseName)
      }
      return next
    })
  }

  const exportToExcel = async () => {
    setExportingExcel(true)
    try {
      const XLSX = await import('xlsx')
      const filterName = getFulfillmentLabel(fulfillmentFilter)
      const headers = showBuyouts
        ? ['Категория', 'Товар', 'Тип строки', 'Итого заказы', 'Итого выкупы', ...dates.flatMap((date) => [`${formatDateShort(date)} заказы`, `${formatDateShort(date)} выкупы`])]
        : ['Категория', 'Товар', 'Тип строки', 'Итого', ...dates.map(formatDateShort)]
      const rows: Array<Record<string, string | number>> = []

      const buildDateCells = (productName: string | null, dateValues: number[], buyoutValues: number[]) => {
        if (showBuyouts) {
          return Object.fromEntries(dates.flatMap((date, index) => [
            [`${formatDateShort(date)} заказы`, dateValues[index] || 0],
            [`${formatDateShort(date)} выкупы`, buyoutValues[index] || 0],
          ]))
        }
        return Object.fromEntries(dates.map((date, index) => [formatDateShort(date), dateValues[index] || 0]))
      }

      rows.push(showBuyouts ? {
        Категория: 'ИТОГО',
        Товар: '',
        'Тип строки': filterName,
        'Итого заказы': grandTotal,
        'Итого выкупы': grandBuyoutTotal,
        ...buildDateCells(null, activeDateTotals, buyoutDateTotals),
      } : {
        Категория: 'ИТОГО',
        Товар: '',
        'Тип строки': filterName,
        Итого: grandTotal,
        ...buildDateCells(null, activeDateTotals, []),
      })

      for (const group of groupedProducts) {
        if (group.total === 0) continue
        const groupDateTotals = dates.map((_, index) =>
          group.children.reduce((sum, product) => sum + (activePivot[product.id]?.[index] || 0), 0)
        )
        const groupBuyoutDateTotals = showBuyouts ? dates.map((_, index) =>
          group.children.reduce((sum, product) => sum + getDailyProductDateValueByName(buyoutData, product.name, index, fulfillmentFilter), 0)
        ) : []
        const groupBuyoutTotal = group.children.reduce((sum, product) => sum + getDailyProductTotalByName(buyoutData, product.name, fulfillmentFilter), 0)

        rows.push(showBuyouts ? {
          Категория: group.baseName,
          Товар: '',
          'Тип строки': group.children.length > 1 ? 'Категория' : 'Товар',
          'Итого заказы': group.total,
          'Итого выкупы': groupBuyoutTotal,
          ...buildDateCells(null, groupDateTotals, groupBuyoutDateTotals),
        } : {
          Категория: group.baseName,
          Товар: '',
          'Тип строки': group.children.length > 1 ? 'Категория' : 'Товар',
          Итого: group.total,
          ...buildDateCells(null, groupDateTotals, []),
        })

        if (group.children.length > 1) {
          const sortedChildren = group.children
            .slice()
            .sort((a, b) => (activeProductTotals?.[b.id] || 0) - (activeProductTotals?.[a.id] || 0))

          for (const product of sortedChildren) {
            const total = activeProductTotals?.[product.id] || 0
            const productPivot = activePivot[product.id]
            if (!productPivot || total === 0) continue
            const productBuyoutDateTotals = showBuyouts ? dates.map((_, index) => getDailyProductDateValueByName(buyoutData, product.name, index, fulfillmentFilter)) : []
            const productBuyoutTotal = getDailyProductTotalByName(buyoutData, product.name, fulfillmentFilter)
            rows.push(showBuyouts ? {
              Категория: group.baseName,
              Товар: product.name,
              'Тип строки': 'Товар',
              'Итого заказы': total,
              'Итого выкупы': productBuyoutTotal,
              ...buildDateCells(product.name, dates.map((_, index) => productPivot[index] || 0), productBuyoutDateTotals),
            } : {
              Категория: group.baseName,
              Товар: product.name,
              'Тип строки': 'Товар',
              Итого: total,
              ...buildDateCells(product.name, dates.map((_, index) => productPivot[index] || 0), []),
            })
          }
        }
      }

      const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
      worksheet['!cols'] = headers.map((header, index) => ({
        wch: index === 0 ? 28 : index === 1 ? 42 : index === 2 ? 14 : 11,
      }))
      worksheet['!freeze'] = { xSplit: 4, ySplit: 1 }

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ежедневные')

      const from = dates[0] || 'period'
      const to = dates[dates.length - 1] || from
      const filename = sanitizeFilenamePart(`wb-daily-${showBuyouts ? 'Заказы-Выкупы' : 'Заказы'}-${filterName}-${from}-${to}.xlsx`)
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      console.error('Failed to export daily table to Excel', error)
    } finally {
      setExportingExcel(false)
    }
  }

  if (dates.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Нет данных за выбранный период
      </div>
    )
  }

  const filterLabel = fulfillmentFilter === 'fbs' ? ' (FBS)' : fulfillmentFilter === 'fbo' ? ' (FBO)' : ''
  const getProductFulfillmentTotal = (productId: number, type: 'fbs' | 'fbo') => {
    const totals = type === 'fbs' ? data.fbsProductTotals : data.fboProductTotals
    return Number(totals?.[productId] || 0)
  }
  const getProductFulfillmentDateValue = (productId: number, dateIdx: number, type: 'fbs' | 'fbo') => {
    const pivot = type === 'fbs' ? data.fbsPivot : data.fboPivot
    return Number(pivot?.[productId]?.[dateIdx] || 0)
  }
  const getGroupFulfillmentBreakdown = (productIds: number[], dateIdx?: number) => {
    if (!showFulfillmentBreakdown) return null
    const fbo = productIds.reduce((sum, productId) => sum + (
      dateIdx === undefined
        ? getProductFulfillmentTotal(productId, 'fbo')
        : getProductFulfillmentDateValue(productId, dateIdx, 'fbo')
    ), 0)
    const fbs = productIds.reduce((sum, productId) => sum + (
      dateIdx === undefined
        ? getProductFulfillmentTotal(productId, 'fbs')
        : getProductFulfillmentDateValue(productId, dateIdx, 'fbs')
    ), 0)
    return { fbo, fbs }
  }
  const renderOrderBuyoutValue = (orders: number, buyouts: number, fulfillment?: { fbo: number; fbs: number } | null) => (
    <div className="leading-tight">
      <div>{orders ? formatNumber(orders) : '—'}</div>
      {showFulfillmentBreakdown && fulfillment && orders > 0 && (
        <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
          <span className="text-sky-700 dark:text-sky-400">FBO {formatNumber(fulfillment.fbo)}</span>
          <span className="mx-1 text-muted-foreground/60">·</span>
          <span className="text-amber-700 dark:text-amber-400">FBS {formatNumber(fulfillment.fbs)}</span>
        </div>
      )}
      {showBuyouts && (
        <div className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          В {buyouts ? formatNumber(buyouts) : '—'}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Заказы по товарам и дням{showBuyouts ? ' + выкупы' : ''}{filterLabel}</h3>
          <p className="text-xs text-muted-foreground">Таблица построена по текущему маппингу категорий WB.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 sm:w-auto"
          onClick={exportToExcel}
          disabled={exportingExcel || grandTotal === 0}
        >
          {exportingExcel ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          В Excel
        </Button>
      </div>

      {selectedChartTitle && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Динамика: {selectedChartTitle}</CardTitle>
            <p className="text-xs text-muted-foreground">Текущий период vs предыдущий равный период</p>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selectedChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="orders" name="Текущий период" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="previous" name="Предыдущий период" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 sm:hidden">
        {groupedProducts.map((group) => {
          const groupDateTotals = dates.map((_, i) =>
            group.children.reduce((s, p) => s + ((activePivot[p.id]?.[i]) || 0), 0)
          )
          if (group.total === 0) return null
          return (
            <button
              key={group.baseName}
              type="button"
              className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/30"
              onClick={() => selectGroupChart(group.baseName)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium">{group.baseName}</div>
                  <div className="text-xs text-muted-foreground">{group.children.length > 1 ? `${group.children.length} вариантов` : filterLabel.trim()}</div>
                </div>
                <div className="text-right text-lg font-bold">
                  <div>{formatNumber(group.total)}</div>
                  {showBuyouts && <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(group.children.reduce((sum, product) => sum + getDailyProductTotalByName(buyoutData, product.name, fulfillmentFilter), 0))}</div>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {dates.map((date, index) => (
                  <div key={date} className="rounded-md border px-2 py-1.5" style={heatStyle(groupDateTotals[index])}>
                    <div className="text-[10px] text-muted-foreground">{formatDateShort(date)}</div>
                    <div className="text-sm font-semibold">
                      {renderOrderBuyoutValue(
                        groupDateTotals[index] || 0,
                        group.children.reduce((sum, product) => sum + getDailyProductDateValueByName(buyoutData, product.name, index, fulfillmentFilter), 0),
                        getGroupFulfillmentBreakdown(group.children.map((product) => product.id), index)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border bg-card sm:block">
      <div className="max-h-[min(72vh,720px)] overflow-auto">
        <table className="min-w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="sticky left-0 top-0 z-20 min-w-[170px] bg-muted px-2 py-2 text-left font-medium sm:min-w-[220px] sm:px-3">Продукт{filterLabel}</th>
              <th className="sticky top-0 z-10 min-w-[70px] bg-muted px-2 py-2 text-right font-medium sm:px-3">Итого</th>
              {dates.map((d, index) => (
                <th key={d} className="sticky top-0 z-10 min-w-[58px] whitespace-nowrap bg-muted px-2 py-2 text-right font-medium sm:px-3" title={formatDateFull(d)}>
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSortDateIdx(sortDateIdx === index ? null : index)}>
                    {formatDateShort(d)}{sortDateIdx === index ? ' ↓' : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-50 dark:bg-emerald-950/20 border-b font-semibold">
              <td className="sticky left-0 z-10 bg-emerald-50 px-2 py-2 dark:bg-emerald-950/20 sm:px-3">ИТОГО{filterLabel}</td>
              <td className="bg-emerald-50 px-2 py-2 text-right font-bold dark:bg-emerald-950/20 sm:px-3">{renderOrderBuyoutValue(grandTotal, grandBuyoutTotal, getGroupFulfillmentBreakdown(products.map((product) => product.id)))}</td>
              {dates.map((d, i) => (
                <td key={d} className="px-2 py-2 text-right sm:px-3">{renderOrderBuyoutValue(activeDateTotals[i] || 0, buyoutDateTotals[i] || 0, getGroupFulfillmentBreakdown(products.map((product) => product.id), i))}</td>
              ))}
            </tr>
            {groupedProducts.map((group) => {
              const isExpanded = expandedGroups.has(group.baseName)
              const isGrouped = group.hasSize

              // Calculate group totals per date
              const groupDateTotals = dates.map((_, i) =>
                group.children.reduce((s, p) => s + ((activePivot[p.id]?.[i]) || 0), 0)
              )

              // If group has only one child or no size variation, render as single row
              if (!isGrouped) {
                const p = group.children[0]
                const total = activeProductTotals?.[p.id] || 0
                const productPivot = activePivot[p.id]
                if (!productPivot || total === 0) return null
                return (
                  <tr key={p.id} className={`border-b ${DAILY_TABLE_ROW_HOVER}`}>
                    <td className="sticky left-0 z-10 bg-background px-2 py-2 sm:px-3">
                      <button type="button" className="text-left hover:underline" onClick={() => selectProductChart(p.id)}>{p.name}</button>
                    </td>
                    <td className="px-2 py-2 text-right font-medium sm:px-3">{renderOrderBuyoutValue(total, getDailyProductTotalByName(buyoutData, p.name, fulfillmentFilter), getGroupFulfillmentBreakdown([p.id]))}</td>
                    {dates.map((d, i) => {
                      const val = productPivot[i]
                      return (
                        <td key={d} style={heatStyle(val)} className={`px-2 py-2 text-right sm:px-3 ${val ? '' : 'text-muted-foreground'}`}>
                          {renderOrderBuyoutValue(val || 0, getDailyProductDateValueByName(buyoutData, p.name, i, fulfillmentFilter), getGroupFulfillmentBreakdown([p.id], i))}
                        </td>
                      )
                    })}
                  </tr>
                )
              }

              // Grouped row with expand/collapse
              return (
                <Fragment key={group.baseName}>
                  <tr
                    className={`border-b cursor-pointer select-none ${DAILY_TABLE_ROW_HOVER}`}
                    onClick={() => {
                      selectGroupChart(group.baseName)
                      toggleGroup(group.baseName)
                    }}
                  >
                    <td className="sticky left-0 z-10 bg-background px-2 py-2 font-medium sm:px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span>{group.baseName}</span>
                        <span className="text-xs text-muted-foreground">({group.children.length})</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold sm:px-3">{renderOrderBuyoutValue(
                      group.total,
                      group.children.reduce((sum, product) => sum + getDailyProductTotalByName(buyoutData, product.name, fulfillmentFilter), 0),
                      getGroupFulfillmentBreakdown(group.children.map((product) => product.id))
                    )}</td>
                    {dates.map((d, i) => (
                      <td key={d} style={heatStyle(groupDateTotals[i])} className="px-2 py-2 text-right font-medium sm:px-3">
                        {renderOrderBuyoutValue(
                          groupDateTotals[i] || 0,
                          group.children.reduce((sum, product) => sum + getDailyProductDateValueByName(buyoutData, product.name, i, fulfillmentFilter), 0),
                          getGroupFulfillmentBreakdown(group.children.map((product) => product.id), i)
                        )}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && group.children
                    .slice() // copy to avoid mutating
                    .sort((a, b) => (activeProductTotals?.[b.id] || 0) - (activeProductTotals?.[a.id] || 0))
                    .map((p) => {
                      const total = activeProductTotals?.[p.id] || 0
                      const productPivot = activePivot[p.id]
                      if (!productPivot || total === 0) return null
                      // Extract just the size/variant part (case-insensitive match)
                      const sizePart = p.name.replace(new RegExp('^' + group.baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim() || '(без размера)'
                      return (
                        <tr key={p.id} className={`border-b bg-muted/10 ${DAILY_TABLE_ROW_HOVER}`}>
                          <td className="sticky left-0 z-10 bg-muted/10 px-2 py-2 pl-7 sm:px-3 sm:pl-8">
                            <button type="button" className="text-left text-muted-foreground hover:underline" onClick={() => selectProductChart(p.id)}>{sizePart}</button>
                          </td>
                          <td className="px-2 py-2 text-right sm:px-3">{renderOrderBuyoutValue(total, getDailyProductTotalByName(buyoutData, p.name, fulfillmentFilter), getGroupFulfillmentBreakdown([p.id]))}</td>
                          {dates.map((d, i) => {
                            const val = productPivot[i]
                            return (
                              <td key={d} style={heatStyle(val)} className={`px-2 py-2 text-right sm:px-3 ${val ? '' : 'text-muted-foreground'}`}>
                                {renderOrderBuyoutValue(val || 0, getDailyProductDateValueByName(buyoutData, p.name, i, fulfillmentFilter), getGroupFulfillmentBreakdown([p.id], i))}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}

// --- Daily Orders Tab ---
function DailyOrdersTab({ entrepreneurs, user, includeAngelina }: { entrepreneurs: EntrepreneurInfo[]; user: AuthUser | null; includeAngelina: boolean }) {
  const [fetchedData, setFetchedData] = useState<DailyOrdersData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'all' | 'fbs' | 'fbo'>('all')
  const [showBuyouts, setShowBuyouts] = useState(false)
  const [buyoutData, setBuyoutData] = useState<DailyOrdersData | null>(null)
  const dailyLoadSeq = useRef(0)
  // Default to yesterday in Moscow timezone (последний день = yesterday, not today)
  const getYesterday = () => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    nowMsk.setDate(nowMsk.getDate() - 1)
    return nowMsk.toISOString().split('T')[0]
  }

  const [dateMode, setDateMode] = useState<'single' | 'range'>('single')
  const [singleDate, setSingleDate] = useState<string>(getYesterday())
  const [dateFrom, setDateFrom] = useState<string>(getYesterday())
  const [dateTo, setDateTo] = useState<string>(getYesterday())

  const mergeDailyResponses = useCallback((days: DailyOrdersData[], dates: string[]): DailyOrdersData => {
    const products: { id: number; name: string }[] = []
    const productIdByName = new Map<string, number>()
    const entrepreneursById = new Map<number, { id: number; name: string }>()
    const dateIndex = new Map(dates.map((date, index) => [date, index]))

    const ensureProduct = (name: string) => {
      const existing = productIdByName.get(name)
      if (existing !== undefined) return existing
      const id = products.length
      productIdByName.set(name, id)
      products.push({ id, name })
      return id
    }

    for (const day of days) {
      for (const ent of day.entrepreneurs || []) entrepreneursById.set(ent.id, ent)
    }

    const emptyPivot = (): Record<number, Record<number, number>> => ({})
    const pivot = emptyPivot()
    const fbsPivot = emptyPivot()
    const fboPivot = emptyPivot()
    const dateTotals = new Array(dates.length).fill(0)
    const revenueDateTotals = new Array(dates.length).fill(0)
    const fbsDateTotals = new Array(dates.length).fill(0)
    const fboDateTotals = new Array(dates.length).fill(0)
    const productTotals: Record<number, number> = {}
    const productRevenue: Record<number, number> = {}
    const fbsProductTotals: Record<number, number> = {}
    const fboProductTotals: Record<number, number> = {}
    const entrepreneurDailyData: Record<string, Record<number, number>> = {}
    const entrepreneurDailyRevenue: Record<string, Record<number, number>> = {}
    const entrepreneurDailyFbs: Record<string, Record<number, number>> = {}
    const entrepreneurDailyFbo: Record<string, Record<number, number>> = {}

    const addPivot = (
      targetPivot: Record<number, Record<number, number>>,
      targetDateTotals: number[],
      targetProductTotals: Record<number, number>,
      productId: number,
      targetDateIdx: number,
      value: number,
    ) => {
      if (!value) return
      if (!targetPivot[productId]) targetPivot[productId] = {}
      targetPivot[productId][targetDateIdx] = (targetPivot[productId][targetDateIdx] || 0) + value
      targetDateTotals[targetDateIdx] += value
      targetProductTotals[productId] = (targetProductTotals[productId] || 0) + value
    }

    for (const day of days) {
      for (const [date, entRows] of Object.entries(day.entrepreneurDailyData || {})) {
        entrepreneurDailyData[date] = entrepreneurDailyData[date] || {}
        for (const [entId, value] of Object.entries(entRows)) {
          entrepreneurDailyData[date][Number(entId)] = (entrepreneurDailyData[date][Number(entId)] || 0) + value
        }
      }
      for (const [date, entRows] of Object.entries(day.entrepreneurDailyRevenue || {})) {
        entrepreneurDailyRevenue[date] = entrepreneurDailyRevenue[date] || {}
        for (const [entId, value] of Object.entries(entRows)) {
          entrepreneurDailyRevenue[date][Number(entId)] = (entrepreneurDailyRevenue[date][Number(entId)] || 0) + Number(value || 0)
        }
      }
      for (const [date, entRows] of Object.entries(day.entrepreneurDailyFbs || {})) {
        entrepreneurDailyFbs[date] = entrepreneurDailyFbs[date] || {}
        for (const [entId, value] of Object.entries(entRows)) {
          entrepreneurDailyFbs[date][Number(entId)] = (entrepreneurDailyFbs[date][Number(entId)] || 0) + Number(value || 0)
        }
      }
      for (const [date, entRows] of Object.entries(day.entrepreneurDailyFbo || {})) {
        entrepreneurDailyFbo[date] = entrepreneurDailyFbo[date] || {}
        for (const [entId, value] of Object.entries(entRows)) {
          entrepreneurDailyFbo[date][Number(entId)] = (entrepreneurDailyFbo[date][Number(entId)] || 0) + Number(value || 0)
        }
      }

      for (const product of day.products || []) {
        const nextProductId = ensureProduct(product.name)
        const sourceRevenue = day.productRevenue?.[product.id] || 0
        if (sourceRevenue) productRevenue[nextProductId] = (productRevenue[nextProductId] || 0) + Number(sourceRevenue || 0)
        const sourceDateTotals = [
          { source: day.pivot, dates: day.dates, totals: dateTotals, productTotals, target: pivot },
          { source: day.fbsPivot, dates: day.dates, totals: fbsDateTotals, productTotals: fbsProductTotals, target: fbsPivot },
          { source: day.fboPivot, dates: day.dates, totals: fboDateTotals, productTotals: fboProductTotals, target: fboPivot },
        ]

        for (const group of sourceDateTotals) {
          const row = group.source?.[product.id] || {}
          for (const [sourceIdxRaw, value] of Object.entries(row)) {
            const sourceDate = group.dates[Number(sourceIdxRaw)]
            const targetDateIdx = dateIndex.get(sourceDate)
            if (targetDateIdx === undefined) continue
            addPivot(group.target, group.totals, group.productTotals, nextProductId, targetDateIdx, Number(value) || 0)
          }
        }
      }
      for (const [sourceIdxRaw, value] of Object.entries(day.revenueDateTotals || {})) {
        const sourceDate = day.dates[Number(sourceIdxRaw)]
        const targetDateIdx = dateIndex.get(sourceDate)
        if (targetDateIdx === undefined) continue
        revenueDateTotals[targetDateIdx] += Number(value || 0)
      }
    }

    return {
      dates,
      allDates: dates,
      products,
      entrepreneurs: [...entrepreneursById.values()],
      pivot,
      previousPivot: {},
      previousFbsPivot: {},
      previousFboPivot: {},
      dateTotals,
      revenueDateTotals,
      previousDateTotals: new Array(dates.length).fill(0),
      productTotals,
      productRevenue,
      entrepreneurDailyData,
      entrepreneurDailyRevenue,
      entrepreneurDailyFbs,
      entrepreneurDailyFbo,
      fbsPivot,
      fbsDateTotals,
      fbsProductTotals,
      fboPivot,
      fboDateTotals,
      fboProductTotals,
    }
  }, [])

  const fetchDailyData = useCallback(async (overrideFrom?: string, overrideTo?: string, metricMode: 'all' | DataMetric = 'all') => {
    const loadSeq = dailyLoadSeq.current + 1
    dailyLoadSeq.current = loadSeq
    const isActiveLoad = () => dailyLoadSeq.current === loadSeq
    setLoading(true)
    setRateLimitErrors([])
    if (metricMode !== 'sales') setFetchedData(null)
    if (metricMode !== 'orders') setBuyoutData(null)
    try {
      const df = overrideFrom ?? (dateMode === 'single' ? singleDate : dateFrom)
      const dt = overrideTo ?? (dateMode === 'single' ? singleDate : dateTo)
      const dates = dateMode === 'range' ? getClientDateRange(df, dt) : [df]
      const errors: RateLimitError[] = []
      const selection = selectionToParam(selectedEnt)

      const loadMetric = async (metric: DataMetric, updateData: (data: DailyOrdersData) => void) => {
        const loadedDays: DailyOrdersData[] = []
        const cacheScope = getDailyCacheScope(selection, entrepreneurs, user, includeAngelina, metric)
        const loadedDates = () => dates.filter((date) => loadedDays.some((day) => day.dates.includes(date)))
        const salesRetryIdsByDate = new Map<string, Set<number>>()
        const salesErrorsByDate = new Map<string, RateLimitError[]>()
        const requestDay = async (date: string, requestSelection = selection) => {
          const params = new URLSearchParams()
          params.set('entrepreneurId', requestSelection)
          params.set('section', 'daily')
          params.set('dateFrom', date)
          params.set('dateTo', date)
          appendAngelinaParam(params, includeAngelina)
          appendMetricParam(params, metric)

          const res = await fetch(`/api/wb-data?${params.toString()}`)
          return { date, json: await res.json() }
        }
        const trackSalesErrors = (date: string, dayErrors: RateLimitError[]) => {
          if (metric !== 'sales') return
          const ids = dayErrors.map((error) => Number(error.id)).filter((id) => Number.isFinite(id) && id > 0)
          if (ids.length) salesRetryIdsByDate.set(date, new Set(ids))
          else salesRetryIdsByDate.delete(date)
          if (dayErrors.length) salesErrorsByDate.set(date, dayErrors)
          else salesErrorsByDate.delete(date)
        }
        const appendNonSalesErrors = (dayErrors: RateLimitError[]) => {
          if (metric !== 'sales' && dayErrors.length) errors.push(...dayErrors)
        }

        const uncachedDates: string[] = []
        for (const date of dates) {
          const cached = readDailyCache(cacheScope, date)
          if (cached) {
            loadedDays.push(cached)
            updateData(mergeDailyResponses(loadedDays, loadedDates()))
            continue
          }
          uncachedDates.push(date)
        }

        const failedDates: string[] = []
        const batchSize = metric === 'sales' ? 1 : DAILY_REQUEST_BATCH_SIZE
        for (let offset = 0; offset < uncachedDates.length; offset += batchSize) {
          const batch = uncachedDates.slice(offset, offset + batchSize)
          const batchResults = await Promise.all(batch.map((date) => requestDay(date)))

          for (const { date, json } of batchResults) {
            const dayErrors = json.rateLimitErrors || []
            const failedSalesIds = new Set<number>(
              metric === 'sales'
                ? dayErrors
                  .map((error: RateLimitError) => Number(error.id))
                  .filter((id: number): id is number => Number.isFinite(id) && id > 0)
                : []
            )
            const canUseDaily = !!json.daily && (dayErrors.length === 0 || metric === 'sales')
            if (dayErrors.length) {
              appendNonSalesErrors(dayErrors)
              trackSalesErrors(date, dayErrors)
              if (!canUseDaily) {
                removeDailyCache(cacheScope, date)
                if (metric !== 'sales') failedDates.push(date)
              }
            } else {
              trackSalesErrors(date, [])
            }
            if (canUseDaily) {
              loadedDays.push(json.daily)
              if (dayErrors.length === 0) {
                writeDailyResponseCache(cacheScope, selection, entrepreneurs, user, date, json, includeAngelina, metric)
              } else if (metric === 'sales') {
                writeDailyResponseCache(cacheScope, selection, entrepreneurs, user, date, json, includeAngelina, metric, {
                  skipAggregate: true,
                  excludeEntrepreneurIds: failedSalesIds,
                })
              }
              updateData(mergeDailyResponses(loadedDays, loadedDates()))
            }
          }
          const batchFromRedis = batchResults.every(({ json }) => json.cacheSource === 'redis')
          if (!batchFromRedis && offset + batchSize < uncachedDates.length) await sleep(DAILY_REQUEST_BATCH_PAUSE_MS)
        }

        for (const date of failedDates) {
          await sleep(DAILY_REQUEST_RETRY_PAUSE_MS)
          if (!isActiveLoad()) return
          const { json } = await requestDay(date)
          const dayErrors = json.rateLimitErrors || []
          const failedSalesIds = new Set<number>(
            metric === 'sales'
              ? dayErrors
                .map((error: RateLimitError) => Number(error.id))
                .filter((id: number): id is number => Number.isFinite(id) && id > 0)
              : []
          )
          const canUseDaily = !!json.daily && (dayErrors.length === 0 || metric === 'sales')
          if (dayErrors.length) {
            appendNonSalesErrors(dayErrors)
            trackSalesErrors(date, dayErrors)
            if (!canUseDaily) {
              removeDailyCache(cacheScope, date)
              continue
            }
          } else {
            trackSalesErrors(date, [])
          }
          if (canUseDaily) {
            loadedDays.push(json.daily)
            if (dayErrors.length === 0) {
              writeDailyResponseCache(cacheScope, selection, entrepreneurs, user, date, json, includeAngelina, metric)
            } else if (metric === 'sales') {
              writeDailyResponseCache(cacheScope, selection, entrepreneurs, user, date, json, includeAngelina, metric, {
                skipAggregate: true,
                excludeEntrepreneurIds: failedSalesIds,
              })
            }
            updateData(mergeDailyResponses(loadedDays, loadedDates()))
          }
        }

        if (metric === 'sales') setRateLimitErrors([...errors, ...salesErrorsByDate.values()].flat())

        while (metric === 'sales' && salesRetryIdsByDate.size > 0 && isActiveLoad()) {
          await sleep(DAILY_REQUEST_RETRY_PAUSE_MS)
          if (!isActiveLoad()) return
          for (const [date, ids] of [...salesRetryIdsByDate.entries()]) {
            if (!isActiveLoad()) return
            const retrySelection = [...ids].join(',')
            if (!retrySelection) {
              salesRetryIdsByDate.delete(date)
              salesErrorsByDate.delete(date)
              continue
            }
            const { json } = await requestDay(date, retrySelection)
            const dayErrors = json.rateLimitErrors || []
            const failedIds: Set<number> = new Set(
              dayErrors
                .map((error: RateLimitError) => Number(error.id))
                .filter((id: number): id is number => Number.isFinite(id) && id > 0)
            )
            if (json.daily) {
              loadedDays.push(json.daily)
              writeDailyResponseCache(cacheScope, retrySelection, entrepreneurs, user, date, json, includeAngelina, metric, {
                skipAggregate: failedIds.size > 0,
                excludeEntrepreneurIds: failedIds,
              })
              updateData(mergeDailyResponses(loadedDays, loadedDates()))
            }
            if (failedIds.size > 0) {
              salesRetryIdsByDate.set(date, failedIds)
              salesErrorsByDate.set(date, dayErrors)
            } else {
              salesRetryIdsByDate.delete(date)
              salesErrorsByDate.delete(date)
            }
            setRateLimitErrors([...errors, ...salesErrorsByDate.values()].flat())
          }
        }

        if (metric === 'sales') errors.push(...[...salesErrorsByDate.values()].flat())
      }

      if (metricMode !== 'sales') await loadMetric('orders', setFetchedData)
      if (!isActiveLoad()) return
      if (showBuyouts && metricMode !== 'orders') await loadMetric('sales', setBuyoutData)
      if (!isActiveLoad()) return

      setRateLimitErrors(errors)
    } catch (e) {
      console.error(e)
    } finally {
      if (isActiveLoad()) setLoading(false)
    }
  }, [selectedEnt, dateMode, singleDate, dateFrom, dateTo, entrepreneurs, user, includeAngelina, showBuyouts, mergeDailyResponses])

  // NO auto-fetch on mount — only fetch when user clicks "Показать"
  useEffect(() => {
    if (!showBuyouts || !fetchedData || buyoutData || loading) return
    fetchDailyData(undefined, undefined, 'sales')
  }, [showBuyouts, fetchedData, buyoutData, loading, fetchDailyData])

  return (
    <div className="space-y-4">
      {/* Rate limit errors */}
      <RateLimitAlert errors={rateLimitErrors} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={(ids) => {
            dailyLoadSeq.current += 1
            setLoading(false)
            setSelectedEnt(ids)
          }}
          className="w-full sm:w-64"
        />

        <ToggleGroup type="single" value={dateMode} onValueChange={(v) => {
          if (!v) return
          dailyLoadSeq.current += 1
          setLoading(false)
          setDateMode(v as 'single' | 'range')
        }} className="justify-start rounded-md border">
          <ToggleGroupItem value="single" className="text-xs px-3">Один день</ToggleGroupItem>
          <ToggleGroupItem value="range" className="text-xs px-3">Диапазон</ToggleGroupItem>
        </ToggleGroup>

        {dateMode === 'single' ? (
          <Input type="date" value={singleDate} onChange={(e) => {
            dailyLoadSeq.current += 1
            setLoading(false)
            setSingleDate(e.target.value)
          }} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input type="date" value={dateFrom} onChange={(e) => {
              dailyLoadSeq.current += 1
              setLoading(false)
              setDateFrom(e.target.value)
            }} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
            <span className="text-sm text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={(e) => {
              dailyLoadSeq.current += 1
              setLoading(false)
              setDateTo(e.target.value)
            }} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
            {/* Quick period buttons — auto-fetch on click */}
            <ToggleGroup type="single" onValueChange={(v) => {
              if (!v) return
              const mskOffset = 3 * 60 * 60 * 1000
              const nowMsk = new Date(Date.now() + mskOffset)
              const yesterday = new Date(nowMsk.getTime() - 86400000).toISOString().split('T')[0]
              const days = v === 'week' ? 7 : v === 'twoWeeks' ? 14 : 30
              const from = new Date(nowMsk.getTime() - days * 86400000).toISOString().split('T')[0]
              setDateFrom(from)
              setDateTo(yesterday)
              fetchDailyData(from, yesterday)
            }} className="justify-start overflow-x-auto rounded-md border">
              <ToggleGroupItem value="week" className="text-xs px-2">Неделя</ToggleGroupItem>
              <ToggleGroupItem value="twoWeeks" className="text-xs px-2">2 недели</ToggleGroupItem>
              <ToggleGroupItem value="month" className="text-xs px-2">Месяц</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        <label className="flex w-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-xs sm:w-auto">
          <span className="whitespace-nowrap font-medium">Выкупы</span>
          <Switch checked={showBuyouts} onCheckedChange={(checked) => {
            if (!checked) {
              dailyLoadSeq.current += 1
              setLoading(false)
            }
            setShowBuyouts(checked)
            if (!checked) setBuyoutData(null)
            setRateLimitErrors([])
          }} />
        </label>

        <Button onClick={() => fetchDailyData()} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Загрузка...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Показать
            </>
          )}
        </Button>

        {fetchedData && (
          <ToggleGroup type="single" value={fulfillmentFilter} onValueChange={(v) => { if (v) setFulfillmentFilter(v as 'all' | 'fbs' | 'fbo') }} className="justify-start rounded-md border">
            <ToggleGroupItem value="all" className="text-xs px-3">Все</ToggleGroupItem>
            <ToggleGroupItem value="fbs" className="text-xs px-3 text-amber-700 dark:text-amber-400">FBS</ToggleGroupItem>
            <ToggleGroupItem value="fbo" className="text-xs px-3 text-sky-700 dark:text-sky-400">FBO</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : fetchedData ? (
        <div className="space-y-4">
          {/* FBS/FBO summary cards */}
          {fetchedData.dates.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-muted-foreground mb-1">Всего</div>
                  <div className="text-xl font-bold">{formatNumber(Object.values(fetchedData.productTotals).reduce((s, v) => s + v, 0))}</div>
                  {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(Object.values(buyoutData?.productTotals || {}).reduce((s, v) => s + Number(v || 0), 0))}</div>}
                </CardContent>
              </Card>
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">FBS (склад продавца)</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatNumber(Object.values(fetchedData.fbsProductTotals).reduce((s, v) => s + v, 0))}</div>
                  {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(Object.values(buyoutData?.fbsProductTotals || {}).reduce((s, v) => s + Number(v || 0), 0))}</div>}
                </CardContent>
              </Card>
              <Card className="border-sky-200 dark:border-sky-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-sky-700 dark:text-sky-400 mb-1">FBO (склад WB)</div>
                  <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{formatNumber(Object.values(fetchedData.fboProductTotals).reduce((s, v) => s + v, 0))}</div>
                  {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(Object.values(buyoutData?.fboProductTotals || {}).reduce((s, v) => s + Number(v || 0), 0))}</div>}
                </CardContent>
              </Card>
            </div>
          )}
          {fetchedData.dates.length > 0 && fetchedData.entrepreneurs.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Сравнение ИП по дням</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 sm:hidden">
                  {fetchedData.dates.map((date) => (
                    <div key={date} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-medium">
                        <span>{formatDateFull(date)}</span>
                        <span className="text-right">
                          <span className="block">{formatNumber(fetchedData.dateTotals[fetchedData.dates.indexOf(date)] || 0)}</span>
                          {showBuyouts && <span className="block text-xs text-emerald-700 dark:text-emerald-400">В {formatNumber(buyoutData?.dateTotals?.[fetchedData.dates.indexOf(date)] || 0)}</span>}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {fetchedData.entrepreneurs.map((ent) => {
                          const total = fetchedData.entrepreneurDailyData[date]?.[ent.id] || 0
                          const fbs = fetchedData.entrepreneurDailyFbs?.[date]?.[ent.id] || 0
                          const fbo = fetchedData.entrepreneurDailyFbo?.[date]?.[ent.id] || 0
                          return (
                            <div key={ent.id} className="flex items-start justify-between gap-3 text-sm">
                              <span className="truncate text-muted-foreground">{ent.name}</span>
                              <span className="text-right">
                                <span className="block font-semibold">{formatNumber(total)}</span>
                                {showBuyouts && <span className="block text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(buyoutData?.entrepreneurDailyData?.[date]?.[ent.id] || 0)}</span>}
                                <span className="block text-[11px] text-muted-foreground">
                                  <span className="text-amber-700 dark:text-amber-400">FBS {formatNumber(fbs)}</span>
                                  <span className="mx-1">/</span>
                                  <span className="text-sky-700 dark:text-sky-400">FBO {formatNumber(fbo)}</span>
                                </span>
                              </span>
                            </div>
                          )
                        })}
                        <div className="flex items-start justify-between gap-3 border-t pt-2 text-sm">
                          <span className="font-medium">Итого</span>
                          <span className="text-right">
                            <span className="block font-semibold">{formatNumber(fetchedData.dateTotals[fetchedData.dates.indexOf(date)] || 0)}</span>
                            {showBuyouts && <span className="block text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(buyoutData?.dateTotals?.[fetchedData.dates.indexOf(date)] || 0)}</span>}
                            <span className="block text-[11px] text-muted-foreground">
                              <span className="text-amber-700 dark:text-amber-400">FBS {formatNumber(fetchedData.fbsDateTotals[fetchedData.dates.indexOf(date)] || 0)}</span>
                              <span className="mx-1">/</span>
                              <span className="text-sky-700 dark:text-sky-400">FBO {formatNumber(fetchedData.fboDateTotals[fetchedData.dates.indexOf(date)] || 0)}</span>
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="min-w-[120px] px-3 py-2 text-left font-medium">Дата</th>
                        {fetchedData.entrepreneurs.map((ent) => (
                          <th key={ent.id} className="min-w-[140px] px-3 py-2 text-right font-medium">{ent.name}</th>
                        ))}
                        <th className="min-w-[130px] px-3 py-2 text-right font-medium">Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fetchedData.dates.map((date, dateIdx) => (
                        <tr key={date} className={`border-b last:border-b-0 ${DAILY_TABLE_ROW_HOVER}`}>
                          <td className="px-3 py-2 font-medium">{formatDateShort(date)}</td>
                          {fetchedData.entrepreneurs.map((ent) => {
                            const total = fetchedData.entrepreneurDailyData[date]?.[ent.id] || 0
                            const fbs = fetchedData.entrepreneurDailyFbs?.[date]?.[ent.id] || 0
                            const fbo = fetchedData.entrepreneurDailyFbo?.[date]?.[ent.id] || 0
                            return (
                              <td key={ent.id} className="px-3 py-2 text-right">
                                <div className="font-medium">{formatNumber(total)}</div>
                                {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(buyoutData?.entrepreneurDailyData?.[date]?.[ent.id] || 0)}</div>}
                                <div className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                                  <span className="text-amber-700 dark:text-amber-400">FBS {formatNumber(fbs)}</span>
                                  <span className="mx-1">/</span>
                                  <span className="text-sky-700 dark:text-sky-400">FBO {formatNumber(fbo)}</span>
                                </div>
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-right">
                            <div className="font-semibold">{formatNumber(fetchedData.dateTotals[dateIdx] || 0)}</div>
                            {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(buyoutData?.dateTotals?.[dateIdx] || 0)}</div>}
                            <div className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                              <span className="text-amber-700 dark:text-amber-400">FBS {formatNumber(fetchedData.fbsDateTotals[dateIdx] || 0)}</span>
                              <span className="mx-1">/</span>
                              <span className="text-sky-700 dark:text-sky-400">FBO {formatNumber(fetchedData.fboDateTotals[dateIdx] || 0)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <DataTable data={fetchedData} fulfillmentFilter={fulfillmentFilter} buyoutData={buyoutData} showBuyouts={showBuyouts} />
        </div>
      ) : (
        <EmptyState
          message="Выберите ИП, дату и нажмите «Показать»"
          icon={<Table2 className="h-12 w-12" />}
        />
      )}
    </div>
  )
}

// --- Monthly Tab ---
function MonthlyTab({ entrepreneurs, includeAngelina }: { entrepreneurs: EntrepreneurInfo[]; includeAngelina: boolean }) {
  const [fetchedData, setFetchedData] = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [showBuyouts, setShowBuyouts] = useState(false)
  const [buyoutData, setBuyoutData] = useState<MonthlyData | null>(null)

  const data = fetchedData
  const latestMonth = data?.monthStats[data.monthStats.length - 1]
  const periodLabel = data && data.months.length > 0
    ? `${formatMonthLabel(data.months[0])} — ${formatMonthLabel(data.months[data.months.length - 1])}`
    : ''
  const totalOrders = data?.monthStats.reduce((sum, month) => sum + month.orders, 0) || 0
  const totalRevenue = data?.monthStats.reduce((sum, month) => sum + month.revenue, 0) || 0
  const totalAdSpend = data?.monthStats.reduce((sum, month) => sum + month.adSpend, 0) || 0
  const totalDrr = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : null
  const totalBuyouts = buyoutData?.monthStats.reduce((sum, month) => sum + month.orders, 0) || 0
  const totalBuyoutRevenue = buyoutData?.monthStats.reduce((sum, month) => sum + month.revenue, 0) || 0
  const totalBuyoutDrr = totalBuyoutRevenue > 0 ? (totalAdSpend / totalBuyoutRevenue) * 100 : null
  const trendData = data ? data.monthStats.map((month) => ({
    month: formatMonthLabel(month.month),
    orders: month.orders,
    buyouts: buyoutData?.monthStats.find((row) => row.month === month.month)?.orders || undefined,
    adSpend: Math.round(month.adSpend),
    drr: month.drr === null ? undefined : Number(month.drr.toFixed(1)),
    mom: month.momOrdersPct === null ? undefined : Number(month.momOrdersPct.toFixed(1)),
  })) : []
  const drrValues = trendData.map((row) => row.drr).filter((value): value is number => typeof value === 'number')
  const drrDomain = drrValues.length
    ? [
        Math.max(0, Math.floor(Math.min(...drrValues) - 1)),
        Math.ceil(Math.max(...drrValues) + 1),
      ]
    : [0, 10]
  const entTableData = data ? data.entrepreneurs.map((ent) => {
    const total = data.months.reduce((sum, month) => sum + (data.monthlyData[month]?.[ent.id] || 0), 0)
    const revenue = data.months.reduce((sum, month) => sum + (data.monthlyRevenue[month]?.[ent.id] || 0), 0)
    const adSpend = data.months.reduce((sum, month) => sum + (data.adSpendByMonth[month]?.[ent.id] || 0), 0)
    const buyoutTotal = buyoutData?.months.reduce((sum, month) => sum + (buyoutData.monthlyData[month]?.[ent.id] || 0), 0) || 0
    const buyoutRevenue = buyoutData?.months.reduce((sum, month) => sum + (buyoutData.monthlyRevenue[month]?.[ent.id] || 0), 0) || 0
    return { ...ent, total, revenue, adSpend, drr: revenue > 0 ? (adSpend / revenue) * 100 : null, buyoutTotal, buyoutRevenue, buyoutDrr: buyoutRevenue > 0 ? (adSpend / buyoutRevenue) * 100 : null }
  }).sort((a, b) => b.total - a.total) : []

  useEffect(() => {
    const selection = selectionToParam(selectedEnt)
    const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina, 'orders')
    const latest = readLatestReportCache<{ data: MonthlyData; errors: RateLimitError[] }>('monthly', cacheScope)
    if (!latest) return
    setFetchedData(latest.data.data)
    setRateLimitErrors(latest.data.errors || [])
  }, [entrepreneurs, selectedEnt, includeAngelina])

  const fetchData = useCallback(async (metricMode: 'all' | DataMetric = 'all') => {
    setLoading(true)
    setRateLimitErrors([])
    if (metricMode !== 'orders') setBuyoutData(null)
    try {
      const selection = selectionToParam(selectedEnt)

      const loadMetric = async (metric: DataMetric, updateData: (data: MonthlyData) => void) => {
        const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina, metric)
        const cacheParams = `section=monthly:${metric}`
        const cached = readReportCache<{ data: MonthlyData; errors: RateLimitError[] }>('monthly', cacheScope, cacheParams)
        if (cached) {
          updateData(cached.data)
          return cached.errors || []
        }

        const params = new URLSearchParams()
        params.set('entrepreneurId', selection)
        params.set('section', 'monthly')
        appendAngelinaParam(params, includeAngelina)
        appendMetricParam(params, metric)
        const res = await fetch(`/api/wb-data?${params.toString()}`)
        const json = await res.json()
        const errors = json.rateLimitErrors || []
        if (json.monthly) {
          updateData(json.monthly)
          if (errors.length === 0) writeReportCache('monthly', cacheScope, cacheParams, { data: json.monthly, errors })
        }
        return errors
      }

      const errors = [
        ...(metricMode !== 'sales' ? await loadMetric('orders', setFetchedData) : []),
        ...(showBuyouts && metricMode !== 'orders' ? await loadMetric('sales', setBuyoutData) : []),
      ]
      setRateLimitErrors(errors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, entrepreneurs, includeAngelina, showBuyouts])

  // NO auto-fetch on mount — only fetch when user clicks "Загрузить"
  useEffect(() => {
    if (!showBuyouts || !fetchedData || buyoutData || loading) return
    fetchData('sales')
  }, [showBuyouts, fetchedData, buyoutData, loading, fetchData])

  return (
    <div className="space-y-6">
      <RateLimitAlert errors={rateLimitErrors} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={setSelectedEnt}
          className="w-full sm:w-64"
        />

        <Button onClick={() => fetchData()} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Загрузка...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Загрузить
            </>
          )}
        </Button>
        <label className="flex w-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-xs sm:w-auto">
          <span className="whitespace-nowrap font-medium">Выкупы</span>
          <Switch checked={showBuyouts} onCheckedChange={(checked) => {
            setShowBuyouts(checked)
            if (!checked) setBuyoutData(null)
            setRateLimitErrors([])
          }} />
        </label>
      </div>

      {loading && <Skeleton className="h-96 w-full" />}

      {!loading && !data && (
        <EmptyState
          message="Выберите ИП и нажмите «Загрузить»"
          icon={<Calendar className="h-12 w-12" />}
        />
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">Заказы за период</div>
                <div className="mt-1 text-2xl font-bold">{formatNumber(totalOrders)}</div>
                {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(totalBuyouts)}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {periodLabel}; последний месяц: {latestMonth ? formatNumber(latestMonth.orders) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">Выручка заказов</div>
                <div className="mt-1 text-2xl font-bold">{formatNumber(Math.round(totalRevenue))} ₽</div>
                {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(Math.round(totalBuyoutRevenue))} ₽</div>}
                <div className="mt-1 text-xs text-muted-foreground">Период: {periodLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">ДРР за период</div>
                <div className="mt-1 text-2xl font-bold">{totalDrr === null ? '—' : `${totalDrr.toFixed(1)}%`}</div>
                <div className="mt-1 text-xs text-muted-foreground">Реклама / заказы; {showBuyouts && totalBuyoutDrr !== null ? `выкупы: ${totalBuyoutDrr.toFixed(1)}%` : periodLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">MoM / YoY по заказам</div>
                <div className="mt-1 text-2xl font-bold">
                  {latestMonth?.momOrdersPct === null || latestMonth?.momOrdersPct === undefined ? '—' : `${latestMonth.momOrdersPct > 0 ? '+' : ''}${latestMonth.momOrdersPct.toFixed(1)}%`}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {latestMonth ? formatMonthLabel(latestMonth.month) : '—'}; YoY: {latestMonth?.yoyOrdersPct === null || latestMonth?.yoyOrdersPct === undefined ? '—' : `${latestMonth.yoyOrdersPct > 0 ? '+' : ''}${latestMonth.yoyOrdersPct.toFixed(1)}%`}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="font-medium">MoM</div>
              <div className="mt-1 text-xs text-muted-foreground">Month over Month: сравнение заказов выбранного месяца с предыдущим месяцем.</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="font-medium">YoY</div>
              <div className="mt-1 text-xs text-muted-foreground">Year over Year: сравнение заказов выбранного месяца с тем же месяцем прошлого года.</div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Месячная динамика</CardTitle>
              <p className="text-xs text-muted-foreground">Период: {periodLabel}; ДРР показан на отдельной шкале справа.</p>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 10, bottom: 8, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="orders" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="drr" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}%`} domain={drrDomain} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'ДРР') return `${value.toFixed(1)}%`
                        return formatNumber(value)
                      }}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line yAxisId="orders" type="monotone" dataKey="orders" name="Заказы" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                    {showBuyouts && <Line yAxisId="orders" type="monotone" dataKey="buyouts" name="Выкупы" stroke="#059669" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />}
                    <Line yAxisId="drr" type="monotone" dataKey="drr" name="ДРР" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {data.seasonality.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Сезонность по месяцам</CardTitle>
                <p className="text-xs text-muted-foreground">Период анализа: {periodLabel}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.seasonality.map((row) => (
                    <div key={row.id} className="rounded-md border p-3">
                      <div className="truncate text-sm font-medium">{row.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Пик: {formatMonthLabel(row.peakMonth)}, {formatNumber(row.peakOrders)} заказов
                      </div>
                      <Badge variant="secondary" className="mt-2">x{row.uplift.toFixed(1)} к среднему</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Accordion type="single" collapsible className="rounded-md border px-4">
            <AccordionItem value="details">
              <AccordionTrigger>Детализация по ИП за период: {periodLabel}</AccordionTrigger>
              <AccordionContent>
                <ScrollArea className="w-full">
                  <table className="text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">ИП</th>
                        <th className="px-3 py-2 text-right font-medium">Заказы</th>
                        <th className="px-3 py-2 text-right font-medium">Выручка</th>
                        <th className="px-3 py-2 text-right font-medium">Реклама</th>
                        <th className="px-3 py-2 text-right font-medium">ДРР</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entTableData.map((ent) => (
                        <tr key={ent.id} className="border-b">
                          <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">{ent.name}</td>
                          <td className="px-3 py-2 text-right">
                            <div>{formatNumber(ent.total)}</div>
                            {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(ent.buyoutTotal)}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div>{formatNumber(Math.round(ent.revenue))} ₽</div>
                            {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(Math.round(ent.buyoutRevenue))} ₽</div>}
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(Math.round(ent.adSpend))} ₽</td>
                          <td className="px-3 py-2 text-right">
                            <div>{ent.drr === null ? '—' : `${ent.drr.toFixed(1)}%`}</div>
                            {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {ent.buyoutDrr === null ? '—' : `${ent.buyoutDrr.toFixed(1)}%`}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  )
}

// --- Production Load Tab ---
function ProductionLoadTab({ entrepreneurs, includeAngelina }: { entrepreneurs: EntrepreneurInfo[]; includeAngelina: boolean }) {
  type ProductionRange = 'week' | 'twoWeeks' | 'month' | 'custom'
  const getPresetRange = (days: number) => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    const end = new Date(nowMsk.getTime() - 86400000)
    const start = new Date(end.getTime() - (days - 1) * 86400000)
    return {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
    }
  }
  const defaults = getPresetRange(30)
  const [fetchedData, setFetchedData] = useState<ProductionLoadData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [productionRange, setProductionRange] = useState<ProductionRange>('month')
  const [capacityInput, setCapacityInput] = useState('2500')
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)

  const fetchData = useCallback(async (
    entIds?: string[],
    range?: { from: string; to: string },
    capacityOverride?: string
  ) => {
    setLoading(true)
    setRateLimitErrors([])
    try {
      const activeRange = range || { from: dateFrom, to: dateTo }
      const selection = selectionToParam(entIds || selectedEnt)
      const capacity = capacityOverride || capacityInput
      const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina)
      const cacheParams = `${activeRange.from}:${activeRange.to}:capacity=${capacity}`
      const cached = readReportCache<{ data: ProductionLoadData; errors: RateLimitError[] }>('production', cacheScope, cacheParams)
      if (cached) {
        setFetchedData(cached.data)
        setRateLimitErrors(cached.errors || [])
        return
      }

      const params = new URLSearchParams()
      params.set('entrepreneurId', selection)
      params.set('section', 'production')
      params.set('dateFrom', activeRange.from)
      params.set('dateTo', activeRange.to)
      params.set('capacity', capacity)
      appendAngelinaParam(params, includeAngelina)
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      const errors = json.rateLimitErrors || []
      if (json.production) {
        setFetchedData(json.production)
        if (errors.length === 0) writeReportCache('production', cacheScope, cacheParams, { data: json.production, errors })
      }
      setRateLimitErrors(errors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, capacityInput, dateFrom, dateTo, entrepreneurs, includeAngelina])

  useEffect(() => {
    const savedCapacity = window.localStorage.getItem('productionCapacity')
    if (savedCapacity) setCapacityInput(savedCapacity)
  }, [])

  // Helper: get load color
  const getLoadColor = (pct: number) => {
    if (pct >= 90) return 'red'
    if (pct >= 70) return 'orange'
    return 'emerald'
  }

  // Helper: get load color classes
  const getLoadColorClasses = (pct: number) => {
    if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-950/20' }
    if (pct >= 70) return { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800', bg: 'bg-orange-50 dark:bg-orange-950/20' }
    return { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', bg: 'bg-emerald-50 dark:bg-emerald-950/20' }
  }

  // Helper: load label
  const getLoadLabel = (pct: number) => {
    if (pct >= 90) return 'Пиковая / перегруз'
    if (pct >= 70) return 'Повышенная'
    return 'Нормальная'
  }

  const getLoadCellClass = (pct: number) => {
    if (pct >= 100) return 'bg-red-600 text-white'
    if (pct >= 90) return 'bg-red-500 text-white'
    if (pct >= 70) return 'bg-amber-400 text-amber-950'
    if (pct >= 40) return 'bg-emerald-300 text-emerald-950'
    if (pct > 0) return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    return 'bg-muted text-muted-foreground'
  }

  const applyCapacity = () => {
    const nextCapacity = Math.max(1, Math.round(Number(capacityInput) || 2500))
    const normalized = String(nextCapacity)
    setCapacityInput(normalized)
    window.localStorage.setItem('productionCapacity', normalized)
  }

  const setQuickRange = (rangeKey: ProductionRange) => {
    const days = rangeKey === 'week' ? 7 : rangeKey === 'twoWeeks' ? 14 : 30
    const range = getPresetRange(days)
    setProductionRange(rangeKey)
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  const productionChartData = useMemo(() => {
    if (!fetchedData) return []
    const history = fetchedData.dates.map((date, realIdx) => {
      return {
        date: formatDateShort(date),
        dateRaw: date,
        items: fetchedData.dateItems[realIdx] || 0,
        previousItems: fetchedData.previousDateItems?.[realIdx] || 0,
        loadPct: fetchedData.dateLoadPct[realIdx] || 0,
        previousLoadPct: fetchedData.previousDateLoadPct?.[realIdx] || 0,
      }
    })
    const forecast = (fetchedData.forecast || []).map((row) => ({
      date: formatDateShort(row.date),
      dateRaw: row.date,
      forecastItems: row.predictedItems,
      forecastLoadPct: row.loadPct,
    }))
    return [...history, ...forecast]
  }, [fetchedData])

  const calendarDays = useMemo(() => {
    if (!fetchedData) return []
    return fetchedData.dates.map((date, realIdx) => {
      return {
        date,
        items: fetchedData.dateItems[realIdx] || 0,
        orders: fetchedData.dateOrders[realIdx] || 0,
        loadPct: fetchedData.dateLoadPct[realIdx] || 0,
      }
    })
  }, [fetchedData])

  const totalProductionItems = fetchedData ? Object.values(fetchedData.productItems).reduce((s, v) => s + v, 0) : 0
  const productionProductsByItems = useMemo(() => {
    if (!fetchedData) return []
    return fetchedData.products
      .slice()
      .sort((a, b) => (fetchedData.productItems[b.id] || 0) - (fetchedData.productItems[a.id] || 0))
  }, [fetchedData])

  // Thermometer component
  function ThermometerGauge({ pct, label, sublabel }: { pct: number; label: string; sublabel?: string }) {
    const colors = getLoadColorClasses(pct)
    const clampedPct = Math.min(pct, 120) // cap visual at 120%
    return (
      <Card className={`${colors.border}`}>
        <CardContent className="pt-6 pb-4">
          <div className="text-center mb-3">
            <div className={`text-3xl font-bold ${colors.text}`}>{pct.toFixed(1)}%</div>
            <div className="text-sm font-medium text-muted-foreground mt-1">{label}</div>
            {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
          </div>
          {/* Progress bar thermometer */}
          <div className="h-4 bg-muted rounded-full overflow-hidden relative">
            {/* 70% threshold marker */}
            <div className="absolute top-0 bottom-0 left-[70%] w-0.5 bg-orange-400/50 z-10" />
            {/* 90% threshold marker */}
            <div className="absolute top-0 bottom-0 left-[90%] w-0.5 bg-red-400/50 z-10" />
            <div
              className={`h-full ${colors.bar} rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(clampedPct, 100)}%` }}
            />
          </div>
          {/* Scale labels */}
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>0%</span>
            <span className="text-orange-500">70%</span>
            <span className="text-red-500">90%</span>
            <span>100%</span>
          </div>
          {/* Status badge */}
          <div className="text-center mt-3">
            <Badge variant="secondary" className={`${colors.text} ${colors.bg} border ${colors.border}`}>
              {getLoadLabel(pct)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <RateLimitAlert errors={rateLimitErrors} />

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={(ids) => { setSelectedEnt(ids); setFetchedData(null); setRateLimitErrors([]) }}
          className="w-full sm:w-64"
        />

        <div className="flex w-full flex-col gap-2 rounded-md border bg-muted/20 p-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
            <Thermometer className="h-4 w-4" />
            Мощность
          </div>
          <div className="flex gap-2">
            <Input
              id="production-capacity"
              aria-label="Мощность производства, изделий в день"
              inputMode="numeric"
              value={capacityInput}
              onChange={(event) => setCapacityInput(event.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(event) => { if (event.key === 'Enter') applyCapacity() }}
              className="h-9 w-full sm:w-32"
            />
            <Button type="button" variant="outline" onClick={applyCapacity} disabled={loading} className="h-9 shrink-0 px-3" title="Сохранить мощность">
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 rounded-md border bg-muted/20 p-2 lg:w-auto lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Период
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setProductionRange('custom') }} className="h-9 w-full sm:w-40" />
            <span className="text-sm text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setProductionRange('custom') }} className="h-9 w-full sm:w-40" />
          </div>
          <ToggleGroup type="single" value={productionRange === 'custom' ? '' : productionRange} onValueChange={(value) => {
            if (value === 'week' || value === 'twoWeeks' || value === 'month') setQuickRange(value)
          }} className="justify-start overflow-x-auto rounded-md border bg-background">
            <ToggleGroupItem value="week" className="text-xs px-2">Неделя</ToggleGroupItem>
            <ToggleGroupItem value="twoWeeks" className="text-xs px-2">2 недели</ToggleGroupItem>
            <ToggleGroupItem value="month" className="text-xs px-2">Месяц</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Button onClick={() => fetchData()} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Загрузка...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Загрузить
            </>
          )}
        </Button>
      </div>

      {loading && !fetchedData && <Skeleton className="h-96 w-full" />}

      {!loading && !fetchedData && (
        <EmptyState
          message="Выберите период и нажмите «Загрузить»"
          icon={<Thermometer className="h-12 w-12" />}
        />
      )}

      {fetchedData && (
        <>
          {/* Loading overlay when switching ИП */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Обновление данных...
            </div>
          )}

          {/* Capacity info */}
          <Card className="border-dashed">
            <CardContent className="py-3">
              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span>Максимальная производительность: <strong className="text-foreground">{formatNumber(fetchedData.capacity)}</strong> изделий/день (FBS)</span>
                </div>
                <span>Заказы и изделия считаются отдельно: нагрузка строится по изделиям с учетом множителей.</span>
              </div>
            </CardContent>
          </Card>

          {/* Thermometer Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ThermometerGauge
              pct={fetchedData.summary.yesterday.loadPct}
              label="Последний день периода"
              sublabel={`${formatNumber(fetchedData.summary.yesterday.items)} изделий / ${formatNumber(fetchedData.summary.yesterday.orders)} заказов`}
            />
            <ThermometerGauge
              pct={fetchedData.summary.week.avgLoadPct}
              label="Средняя за 7 дней"
              sublabel={`${formatNumber(fetchedData.summary.week.totalItems)} изделий за ${fetchedData.summary.week.days} дн. (${formatDateShort(fetchedData.summary.week.dateFrom)} — ${formatDateShort(fetchedData.summary.week.dateTo)})`}
            />
            <ThermometerGauge
              pct={fetchedData.summary.month.avgLoadPct}
              label="Средняя за 30 дней"
              sublabel={`${formatNumber(fetchedData.summary.month.totalItems)} изделий за ${fetchedData.summary.month.days} дн. (${formatDateShort(fetchedData.summary.month.dateFrom)} — ${formatDateShort(fetchedData.summary.month.dateTo)})`}
            />
          </div>

          {fetchedData.seasonalityAlerts.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Сезонный пик в ближайшие 14 дней</AlertTitle>
              <AlertDescription>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {fetchedData.seasonalityAlerts.slice(0, 6).map((alert) => (
                    <div key={`${alert.product}-${alert.peakDate}`} className="rounded-md border border-amber-200 bg-background/70 p-3 text-sm dark:border-amber-900">
                      <div className="font-medium">{alert.product}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Пик {formatDateShort(alert.peakDate)} через {alert.daysToPeak} дн.; исторически x{alert.uplift.toFixed(1)} к среднему
                      </div>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Динамика и прогноз нагрузки</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={productionChartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis yAxisId="items" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="load" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name.includes('%')) return `${value.toFixed(1)}%`
                        return formatNumber(value)
                      }}
                      contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="items" type="monotone" dataKey="items" name="Изделия" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line yAxisId="items" type="monotone" dataKey="previousItems" name="Изделия, пред. период" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    <Line yAxisId="items" type="monotone" dataKey="forecastItems" name="Прогноз изделий" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
                    <Line yAxisId="load" type="monotone" dataKey="loadPct" name="Нагрузка %" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">7 дней к предыдущим 7 дням</div>
                  <div className="mt-1 font-semibold">
                    {fetchedData.summary.week.avgLoadPct.toFixed(1)}% vs {fetchedData.summary.week.previousAvgLoadPct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">30 дней к предыдущим 30 дням</div>
                  <div className="mt-1 font-semibold">
                    {fetchedData.summary.month.avgLoadPct.toFixed(1)}% vs {fetchedData.summary.month.previousAvgLoadPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {calendarDays.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Календарь нагрузки за выбранный период</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
                  {calendarDays.map((day) => (
                    <div key={day.date} className={`rounded-md p-2 text-center ${getLoadCellClass(day.loadPct)}`} title={`${formatDateFull(day.date)}: ${day.loadPct.toFixed(1)}%, ${formatNumber(day.items)} изделий`}>
                      <div className="text-[11px] font-medium">{formatDateShort(day.date)}</div>
                      <div className="mt-1 text-sm font-bold">{day.loadPct.toFixed(0)}%</div>
                      <div className="text-[10px] opacity-80">{formatNumber(day.items)} шт</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">до 40%</span>
                  <span className="rounded bg-emerald-300 px-2 py-1 text-emerald-950">40-70%</span>
                  <span className="rounded bg-amber-400 px-2 py-1 text-amber-950">70-90%</span>
                  <span className="rounded bg-red-500 px-2 py-1 text-white">90%+</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* View mode toggle */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Разбивка:</span>
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => { if (v) setViewMode(v as 'day' | 'week' | 'month') }} className="border rounded-md">
              <ToggleGroupItem value="day" className="text-xs px-3">По дням</ToggleGroupItem>
              <ToggleGroupItem value="week" className="text-xs px-3">За неделю</ToggleGroupItem>
              <ToggleGroupItem value="month" className="text-xs px-3">За месяц</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Daily load table — last 7 days, newest first */}
          {viewMode === 'day' && fetchedData.dates.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Нагрузка по дням (7 дней)
                  <Badge variant="secondary" className="text-xs">FBS изделия</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 md:hidden">
                  {[...fetchedData.dates]
                    .map((date, i) => ({ date, i }))
                    .slice(-7)
                    .reverse()
                    .map(({ date, i }) => {
                      const loadPct = fetchedData.dateLoadPct[i]
                      const colors = getLoadColorClasses(loadPct)
                      return (
                        <div key={date} className={`rounded-md border p-3 ${colors.border} ${colors.bg}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{formatDateFull(date)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatNumber(fetchedData.dateOrders[i])} заказов / {formatNumber(fetchedData.dateItems[i])} изделий
                              </div>
                            </div>
                            <div className={`text-lg font-bold ${colors.text}`}>{loadPct.toFixed(1)}%</div>
                          </div>
                          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-background/80">
                            <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(loadPct, 100)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="text-sm w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                        <th className="text-right px-3 py-2.5 font-medium min-w-[80px]">Заказов</th>
                        <th className="text-right px-3 py-2.5 font-medium min-w-[80px]">Изделий</th>
                        <th className="text-right px-3 py-2.5 font-medium min-w-[80px]">Нагрузка</th>
                        <th className="text-right px-4 py-2.5 font-medium min-w-[140px]">Шкала</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...fetchedData.dates]
                        .map((date, i) => ({ date, i }))
                        .slice(-7)
                        .reverse()
                        .map(({ date, i }) => {
                          const loadPct = fetchedData.dateLoadPct[i]
                          const colors = getLoadColorClasses(loadPct)
                          return (
                            <tr key={date} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2 font-medium">{formatDateFull(date)}</td>
                              <td className="text-right px-3 py-2">{formatNumber(fetchedData.dateOrders[i])}</td>
                              <td className="text-right px-3 py-2 font-medium">{formatNumber(fetchedData.dateItems[i])}</td>
                              <td className={`text-right px-3 py-2 font-bold ${colors.text}`}>
                                {loadPct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2">
                                <div className="h-2.5 bg-muted rounded-full overflow-hidden w-full">
                                  <div
                                    className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                                    style={{ width: `${Math.min(loadPct, 100)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weekly summary */}
          {viewMode === 'week' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Сводка за 7 дней (скользящее окно)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Период</div>
                    <div className="text-sm font-medium">{formatDateShort(fetchedData.summary.week.dateFrom)} — {formatDateShort(fetchedData.summary.week.dateTo)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Дней с данными</div>
                    <div className="text-sm font-medium">{fetchedData.summary.week.days} из 7</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Всего изделий</div>
                    <div className="text-sm font-bold">{formatNumber(fetchedData.summary.week.totalItems)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Средняя нагрузка</div>
                    <div className={`text-sm font-bold ${getLoadColorClasses(fetchedData.summary.week.avgLoadPct).text}`}>
                      {fetchedData.summary.week.avgLoadPct.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">пред. период: {fetchedData.summary.week.previousAvgLoadPct.toFixed(1)}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly summary */}
          {viewMode === 'month' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Сводка за 30 дней (скользящее окно)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Период</div>
                    <div className="text-sm font-medium">{formatDateShort(fetchedData.summary.month.dateFrom)} — {formatDateShort(fetchedData.summary.month.dateTo)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Дней с данными</div>
                    <div className="text-sm font-medium">{fetchedData.summary.month.days} из 30</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Всего изделий</div>
                    <div className="text-sm font-bold">{formatNumber(fetchedData.summary.month.totalItems)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Средняя нагрузка</div>
                    <div className={`text-sm font-bold ${getLoadColorClasses(fetchedData.summary.month.avgLoadPct).text}`}>
                      {fetchedData.summary.month.avgLoadPct.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">пред. период: {fetchedData.summary.month.previousAvgLoadPct.toFixed(1)}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product breakdown - all products by items */}
          {productionProductsByItems.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Разбивка по продуктам (все товары)
                  <Badge variant="secondary" className="text-xs">FBS изделия</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 md:hidden">
                  {productionProductsByItems.map((p) => {
                    const items = fetchedData.productItems[p.id] || 0
                    const orders = fetchedData.productOrders[p.id] || 0
                    const share = totalProductionItems > 0 ? (items / totalProductionItems * 100).toFixed(1) : '0'
                    return (
                      <div key={p.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium leading-snug">{p.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatNumber(orders)} заказов / {p.multiplier > 1 ? `x${p.multiplier}` : 'x1'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatNumber(items)}</div>
                            <div className="text-xs text-muted-foreground">{share}%</div>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(Number(share), 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="text-sm w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-4 py-2.5 font-medium">Продукт</th>
                        <th className="text-right px-3 py-2.5 font-medium min-w-[60px]">Множ.</th>
                        <th className="text-right px-3 py-2.5 font-medium min-w-[80px]">Заказов</th>
                        <th className="text-right px-3 py-2.5 font-medium min-w-[80px]">Изделий</th>
                        <th className="text-right px-4 py-2.5 font-medium min-w-[60px]">Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionProductsByItems.map((p) => {
                          const items = fetchedData.productItems[p.id] || 0
                          const orders = fetchedData.productOrders[p.id] || 0
                          const share = totalProductionItems > 0 ? (items / totalProductionItems * 100).toFixed(1) : '0'
                          return (
                            <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2">
                                <span className="font-medium">{p.name}</span>
                              </td>
                              <td className="text-right px-3 py-2 text-muted-foreground">
                                {p.multiplier > 1 ? (
                                  <Badge variant="secondary" className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                                    ×{p.multiplier}
                                  </Badge>
                                ) : '×1'}
                              </td>
                              <td className="text-right px-3 py-2">{formatNumber(orders)}</td>
                              <td className="text-right px-3 py-2 font-medium">{formatNumber(items)}</td>
                              <td className="text-right px-4 py-2 text-muted-foreground">{share}%</td>
                            </tr>
                          )
                        })}
                      <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-semibold">
                        <td className="px-4 py-2">ИТОГО</td>
                        <td className="text-right px-3 py-2">—</td>
                        <td className="text-right px-3 py-2">{formatNumber(Object.values(fetchedData.productOrders).reduce((s, v) => s + v, 0))}</td>
                        <td className="text-right px-3 py-2 font-bold">{formatNumber(totalProductionItems)}</td>
                        <td className="text-right px-4 py-2">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// --- Supply Tab (Поставки) ---
function SupplyTab({ entrepreneurs, includeAngelina }: { entrepreneurs: EntrepreneurInfo[]; includeAngelina: boolean }) {
  const [fetchedData, setFetchedData] = useState<SupplyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [supplyDays, setSupplyDays] = useState<number>(14)
  const [coefficient, setCoefficient] = useState<number>(1)
  const [sortBy, setSortBy] = useState<'supplyQty' | 'avgDaily' | 'oos' | 'article'>('supplyQty')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // Default date range: last 30 days ending yesterday
  const getDefaultDates = () => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    const yesterday = new Date(nowMsk.getTime() - 86400000).toISOString().split('T')[0]
    const monthAgo = new Date(nowMsk.getTime() - 31 * 86400000).toISOString().split('T')[0]
    return { from: monthAgo, to: yesterday }
  }
  const defaults = getDefaultDates()
  const [dateFrom, setDateFrom] = useState<string>(defaults.from)
  const [dateTo, setDateTo] = useState<string>(defaults.to)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setRateLimitErrors([])
    setPage(0)
    try {
      const selection = selectionToParam(selectedEnt)
      const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina)
      const cacheParams = `${dateFrom}:${dateTo}:days=${supplyDays}:coef=${coefficient}`
      const cached = readReportCache<{ data: SupplyData; errors: RateLimitError[] }>('supply', cacheScope, cacheParams)
      if (cached) {
        setFetchedData(cached.data)
        setRateLimitErrors(cached.errors || [])
        return
      }

      const params = new URLSearchParams()
      params.set('entrepreneurId', selection)
      params.set('section', 'supply')
      params.set('dateFrom', dateFrom)
      params.set('dateTo', dateTo)
      params.set('supplyDays', String(supplyDays))
      params.set('coefficient', String(coefficient))
      appendAngelinaParam(params, includeAngelina)
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      const errors = json.rateLimitErrors || []
      if (json.supply) {
        setFetchedData(json.supply)
        if (errors.length === 0) writeReportCache('supply', cacheScope, cacheParams, { data: json.supply, errors })
      }
      setRateLimitErrors(errors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, dateFrom, dateTo, supplyDays, coefficient, entrepreneurs, includeAngelina])

  const supplyPeriods = [
    { label: '7 дней', value: 7 },
    { label: '2 недели', value: 14 },
    { label: 'Месяц', value: 30 },
    { label: '2 месяца', value: 60 },
  ]

  // Sort + filter articles
  const sortedArticles = fetchedData
    ? [...fetchedData.articles].sort((a, b) => {
        if (sortBy === 'supplyQty') return b.supplyQty - a.supplyQty
        if (sortBy === 'avgDaily') return b.avgDaily - a.avgDaily
        if (sortBy === 'oos') return (a.daysUntilOos ?? 9999) - (b.daysUntilOos ?? 9999)
        return a.article.localeCompare(b.article)
      })
    : []

  const filteredArticles = searchQuery
    ? sortedArticles.filter(a =>
        a.article.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.subject.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedArticles

  const totalPages = Math.ceil(filteredArticles.length / PAGE_SIZE)
  const paginatedArticles = filteredArticles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <RateLimitAlert errors={rateLimitErrors} />

      {/* Controls row 1: ИП + Date range */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground mb-1">ИП</Label>
          <MultiEntrepreneurSelect
            entrepreneurs={entrepreneurs}
            selectedIds={selectedEnt}
            onChange={setSelectedEnt}
            className="w-full sm:w-64"
          />
        </div>

        <div className="w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground mb-1">Период анализа (от)</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div className="w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground mb-1">Период анализа (до)</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
        </div>

        <Button onClick={fetchData} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Расчёт...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Рассчитать
            </>
          )}
        </Button>
      </div>

      {/* Controls row 2: Supply period + Coefficient */}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-sm font-medium text-muted-foreground">Загрузить склад на:</span>
          <ToggleGroup type="single" value={String(supplyDays)} onValueChange={(v) => { if (v) setSupplyDays(Number(v)) }} className="justify-start overflow-x-auto rounded-md border">
            {supplyPeriods.map((p) => (
              <ToggleGroupItem key={p.value} value={String(p.value)} className="text-xs px-3">{p.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-sm font-medium text-muted-foreground">Коэффициент:</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={1.5}
              step={0.05}
              value={coefficient}
              onChange={(e) => setCoefficient(Number(e.target.value))}
              className="h-2 w-full min-w-40 accent-amber-500 cursor-pointer sm:w-32"
            />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400 min-w-[40px] text-center">{coefficient.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {loading && <Skeleton className="h-96 w-full" />}

      {!loading && !fetchedData && (
        <EmptyState
          message="Выберите ИП, период анализа и нажмите «Рассчитать»"
          icon={<Truck className="h-12 w-12" />}
        />
      )}

      {!loading && fetchedData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Артикулов</div>
                <div className="text-xl font-bold">{formatNumber(fetchedData.totalArticles)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Дней в периоде</div>
                <div className="text-xl font-bold">{fetchedData.daysInRange}</div>
              </CardContent>
            </Card>
            <Card className="border-sky-200 dark:border-sky-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-sky-700 dark:text-sky-400 mb-1">Остаток на ФБО</div>
                <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{formatNumber(fetchedData.totalFboStock)} шт</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Итого к поставке</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{formatNumber(fetchedData.totalSupplyQty)} шт</div>
              </CardContent>
            </Card>
            <Card className="border-red-200 dark:border-red-900">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-red-700 dark:text-red-400 mb-1">Риск OOS ≤ 7 дней</div>
                <div className="text-xl font-bold text-red-700 dark:text-red-400">{formatNumber(fetchedData.criticalArticles)}</div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">Коэффициент</div>
                <div className="text-xl font-bold text-amber-700 dark:text-amber-400">×{fetchedData.coefficient}</div>
                <div className="text-[10px] text-muted-foreground">увеличение для учёта FBO продаж</div>
              </CardContent>
            </Card>
          </div>

          {/* Formula explanation */}
          <Card className="border-dashed">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4 shrink-0" />
                <span>Формула: <strong>Шт к поставке</strong> = (заказов / {fetchedData.daysInRange} дней) × {fetchedData.supplyDays} дней × {fetchedData.coefficient} − остаток ФБО</span>
                <span className="text-xs">| Период: {formatDateShort(fetchedData.dateFrom)} — {formatDateShort(fetchedData.dateTo)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Search + Sort controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Поиск по артикулу или категории..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
              className="w-72"
            />
            <span className="text-sm font-medium text-muted-foreground">Сортировка:</span>
            <ToggleGroup type="single" value={sortBy} onValueChange={(v) => { if (v) setSortBy(v as 'supplyQty' | 'avgDaily' | 'oos' | 'article') }} className="border rounded-md">
              <ToggleGroupItem value="supplyQty" className="text-xs px-3">К поставке</ToggleGroupItem>
              <ToggleGroupItem value="avgDaily" className="text-xs px-3">Среднее/день</ToggleGroupItem>
              <ToggleGroupItem value="oos" className="text-xs px-3">OOS</ToggleGroupItem>
              <ToggleGroupItem value="article" className="text-xs px-3">Артикул</ToggleGroupItem>
            </ToggleGroup>
            {searchQuery && (
              <Badge variant="secondary" className="text-xs">
                Найдено: {filteredArticles.length} из {fetchedData.totalArticles}
              </Badge>
            )}
          </div>

          {/* Articles table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Расчёт поставки по артикулам
                <Badge variant="secondary" className="text-xs">{fetchedData.totalArticles} артикулов</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="text-sm w-full">
                  <thead>
                    <tr className="bg-muted/50 border-b sticky top-0 z-10">
                      <th className="text-left px-4 py-2.5 font-medium min-w-[180px]">Артикул поставщика</th>
                      <th className="text-left px-3 py-2.5 font-medium min-w-[160px]">Категория</th>
                      <th className="text-right px-3 py-2.5 font-medium min-w-[90px]">Всего заказов</th>
                      <th className="text-right px-3 py-2.5 font-medium min-w-[70px]">FBS</th>
                      <th className="text-right px-3 py-2.5 font-medium min-w-[70px]">FBO</th>
                      <th className="text-right px-3 py-2.5 font-medium min-w-[90px]">Среднее/день</th>
                      <th className="text-right px-3 py-2.5 font-medium min-w-[100px]">Остаток ФБО</th>
                      <th className="text-right px-3 py-2.5 font-medium min-w-[90px]">До OOS</th>
                      <th className="text-left px-3 py-2.5 font-medium min-w-[240px]">Склады к поставке</th>
                      <th className="text-right px-4 py-2.5 font-medium min-w-[110px]">Шт к поставке</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Totals row */}
                    <tr className="bg-emerald-50 dark:bg-emerald-950/20 border-b font-semibold sticky top-[41px] z-10">
                      <td className="px-4 py-2.5" colSpan={2}>ИТОГО</td>
                      <td className="text-right px-3 py-2.5">{formatNumber(fetchedData.articles.reduce((s, a) => s + a.totalOrders, 0))}</td>
                      <td className="text-right px-3 py-2.5">{formatNumber(fetchedData.articles.reduce((s, a) => s + a.fbsOrders, 0))}</td>
                      <td className="text-right px-3 py-2.5">{formatNumber(fetchedData.articles.reduce((s, a) => s + a.fboOrders, 0))}</td>
                      <td className="text-right px-3 py-2.5">—</td>
                      <td className="text-right px-3 py-2.5 text-sky-700 dark:text-sky-400">{formatNumber(fetchedData.totalFboStock)}</td>
                      <td className="text-right px-3 py-2.5">—</td>
                      <td className="px-3 py-2.5">—</td>
                      <td className="text-right px-4 py-2.5 font-bold text-emerald-700 dark:text-emerald-400">{formatNumber(fetchedData.totalSupplyQty)}</td>
                    </tr>
                    {paginatedArticles.map((a, i) => (
                      <tr key={`${a.article}-${i}`} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 font-medium font-mono text-xs">{a.article}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs max-w-[200px] truncate" title={a.subject}>{a.subject}</td>
                        <td className="text-right px-3 py-2">{formatNumber(a.totalOrders)}</td>
                        <td className="text-right px-3 py-2 text-amber-600 dark:text-amber-400">{a.fbsOrders}</td>
                        <td className="text-right px-3 py-2 text-sky-600 dark:text-sky-400">{a.fboOrders}</td>
                        <td className="text-right px-3 py-2">{a.avgDaily.toFixed(2)}</td>
                        <td className="text-right px-3 py-2 text-sky-700 dark:text-sky-400 font-medium">{formatNumber(a.fboStock)}</td>
                        <td className={`text-right px-3 py-2 font-medium ${a.daysUntilOos !== null && a.daysUntilOos <= 7 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>
                          {a.daysUntilOos === null ? '-' : `${a.daysUntilOos} дн.`}
                        </td>
                        <td className="px-3 py-2">
                          {a.warehouses.length > 0 ? (
                            <div className="flex max-w-[320px] flex-wrap gap-1">
                              {a.warehouses.slice(0, 3).map((w) => (
                                <Badge key={w.warehouse} variant="outline" className="max-w-full gap-1 text-[10px] font-normal">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{w.warehouse}</span>
                                  <span className="font-semibold">+{formatNumber(w.recommendedQty)}</span>
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Запаса хватает</span>
                          )}
                        </td>
                        <td className="text-right px-4 py-2 font-bold text-emerald-700 dark:text-emerald-400">{formatNumber(a.supplyQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Показано {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredArticles.length)} из {filteredArticles.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  ← Назад
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i
                  } else if (page < 3) {
                    pageNum = i
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 5 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === page ? 'default' : 'outline'}
                      size="sm"
                      className="w-9"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum + 1}
                    </Button>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Вперёд →
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// --- Growth Potential Tab ---
function GrowthPotentialTab({ entrepreneurs, includeAngelina }: { entrepreneurs: EntrepreneurInfo[]; includeAngelina: boolean }) {
  const [data, setData] = useState<GrowthPotentialData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([])
  const [periodDays, setPeriodDays] = useState(30)
  const [minOpens, setMinOpens] = useState(20)

  const getDates = useCallback(() => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    const to = new Date(nowMsk.getTime() - 86400000).toISOString().split('T')[0]
    const from = new Date(nowMsk.getTime() - (periodDays + 1) * 86400000).toISOString().split('T')[0]
    return { from, to }
  }, [periodDays])

  const fetchData = useCallback(async () => {
    if (selectedEnt.length === 0) return
    setLoading(true)
    try {
      const dates = getDates()
      const selection = selectionToParam(selectedEnt)
      const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina)
      const cacheParams = `${dates.from}:${dates.to}:minOpens=${minOpens}`
      const cached = readReportCache<GrowthPotentialData>('growth', cacheScope, cacheParams)
      if (cached) {
        setData(cached)
        return
      }

      const params = new URLSearchParams()
      params.set('entrepreneurId', selection)
      params.set('dateFrom', dates.from)
      params.set('dateTo', dates.to)
      params.set('minOpens', String(minOpens))
      appendAngelinaParam(params, includeAngelina)
      const res = await fetch(`/api/growth-potential?${params.toString()}`)
      const json = await res.json()
      setData(json)
      if (!json?.errors?.length) writeReportCache('growth', cacheScope, cacheParams, json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [getDates, selectedEnt, minOpens, entrepreneurs, includeAngelina])

  const totalPotential = data?.items.filter((item) => item.potentialScore >= 50).length || 0
  const avgConversion = data?.items.length
    ? data.items.reduce((sum, item) => sum + item.conversion, 0) / data.items.length
    : 0

  return (
    <div className="space-y-4">
      {data?.errors && data.errors.length > 0 && <RateLimitAlert errors={data.errors} />}
      {data?.notices && data.notices.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Расчет выполнен в резервном режиме</AlertTitle>
          <AlertDescription>{data.notices.join(' ')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground mb-1">ИП</Label>
          <MultiEntrepreneurSelect
            entrepreneurs={entrepreneurs}
            selectedIds={selectedEnt}
            onChange={setSelectedEnt}
            onlyWithApi
            placeholder="Выберите ИП"
            allowAll={false}
            maxSelected={1}
            className="w-full sm:w-64"
          />
        </div>
        <div className="w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground mb-1">Период</Label>
          <ToggleGroup type="single" value={String(periodDays)} onValueChange={(v) => { if (v) setPeriodDays(Number(v)) }} className="justify-start rounded-md border">
            <ToggleGroupItem value="14" className="text-xs px-3">14 дней</ToggleGroupItem>
            <ToggleGroupItem value="30" className="text-xs px-3">30 дней</ToggleGroupItem>
            <ToggleGroupItem value="60" className="text-xs px-3">60 дней</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground mb-1">Мин. кликов рекламы</Label>
          <Input
            type="number"
            min={1}
            value={minOpens}
            onChange={(e) => setMinOpens(Math.max(1, Number(e.target.value) || 1))}
            className="w-full sm:w-32"
          />
        </div>
        <Button onClick={fetchData} disabled={loading || selectedEnt.length === 0} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Расчёт...
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4" />
              Найти рост
            </>
          )}
        </Button>
      </div>

      {loading && <Skeleton className="h-96 w-full" />}

      {!loading && !data && (
        <EmptyState
          message="Выберите ИП и нажмите «Найти рост»"
          icon={<TrendingUp className="h-12 w-12" />}
        />
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Кандидатов</div>
                <div className="text-xl font-bold">{formatNumber(data.items.length)}</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Сильный потенциал</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{formatNumber(totalPotential)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Средняя конверсия</div>
                <div className="text-xl font-bold">{formatPct(avgConversion)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Период</div>
                <div className="text-sm font-semibold">{formatDateShort(data.dateFrom)} — {formatDateShort(data.dateTo)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Рейтинг товаров по потенциалу роста
                <Badge variant="secondary" className="text-xs">WB Promotion API + ФБО</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Нет товаров, которые прошли фильтры по конверсии, трафику и ФБО-остатку</p>
              ) : (
                <ScrollArea className="w-full">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="sticky left-0 z-10 min-w-[210px] bg-muted/50 px-3 py-2 text-left font-medium">Товар</th>
                        <th className="min-w-[140px] px-3 py-2 text-left font-medium">ИП</th>
                        <th className="min-w-[80px] px-3 py-2 text-right font-medium">Показы</th>
                        <th className="min-w-[80px] px-3 py-2 text-right font-medium">Клики</th>
                        <th className="min-w-[80px] px-3 py-2 text-right font-medium">Корзина</th>
                        <th className="min-w-[80px] px-3 py-2 text-right font-medium">Заказы</th>
                        <th className="min-w-[90px] px-3 py-2 text-right font-medium">CR</th>
                        <th className="min-w-[100px] px-3 py-2 text-right font-medium">Расход</th>
                        <th className="min-w-[90px] px-3 py-2 text-right font-medium">ФБО</th>
                        <th className="min-w-[90px] px-3 py-2 text-right font-medium">До OOS</th>
                        <th className="min-w-[100px] px-3 py-2 text-right font-medium">Потенциал</th>
                        <th className="min-w-[170px] px-3 py-2 text-left font-medium">Рекомендация</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => (
                        <tr key={`${item.entrepreneurId}-${item.nmId}`} className="border-b hover:bg-muted/30">
                          <td className="sticky left-0 z-10 bg-background px-3 py-2">
                            <div className="max-w-[260px] truncate font-medium" title={item.title || item.article}>{item.title || item.article}</div>
                            <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                              <span className="font-mono">{item.article || item.nmId}</span>
                              {item.subject && <span>{item.subject}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{item.entrepreneurName}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(item.views)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(item.opens)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(item.carts)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatNumber(item.orders)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatPct(item.conversion)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(Math.round(item.spend))} ₽</td>
                          <td className="px-3 py-2 text-right text-sky-700 dark:text-sky-400">{formatNumber(item.fboStock)}</td>
                          <td className={`px-3 py-2 text-right ${item.daysUntilOos !== null && item.daysUntilOos < 10 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                            {item.daysUntilOos === null ? '-' : `${item.daysUntilOos} дн.`}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant={item.potentialScore >= 50 ? 'default' : 'secondary'}>{item.potentialScore}</Badge>
                          </td>
                          <td className="px-3 py-2">{item.recommendation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// --- Ad Spend Tab ---
function AdSpendTab({ entrepreneurs, includeAngelina }: { entrepreneurs: EntrepreneurInfo[]; includeAngelina: boolean }) {
  const [data, setData] = useState<AdSpendData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [showBuyouts, setShowBuyouts] = useState(false)

  const getYesterday = () => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    nowMsk.setDate(nowMsk.getDate() - 1)
    return nowMsk.toISOString().split('T')[0]
  }

  const getRangeFromYesterday = (days: number) => {
    const yesterday = getYesterday()
    const from = new Date(`${yesterday}T00:00:00Z`)
    from.setUTCDate(from.getUTCDate() - days + 1)
    return { from: from.toISOString().split('T')[0], to: yesterday }
  }

  const defaultRange = getRangeFromYesterday(7)
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)

  useEffect(() => {
    const selection = selectionToParam(selectedEnt)
    const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina, 'orders')
    const latest = readLatestReportCache<{ data: AdSpendData; errors: RateLimitError[] }>('ads', cacheScope)
    if (!latest) return
    const [from, to] = latest.params.split(':')
    if (from && to) {
      setDateFrom(from)
      setDateTo(to)
    }
    setData(latest.data.data)
    setRateLimitErrors(latest.data.errors || [])
  }, [entrepreneurs, selectedEnt, includeAngelina])

  const periodLabel = data?.period ? `${formatDateShort(data.period.from)} — ${formatDateShort(data.period.to)}` : ''
  const entRows = data?.entrepreneurs || []
  const campaignRows = entRows.flatMap((ent) => (ent.campaigns || []).map((campaign) => ({
    ...campaign,
    entrepreneur: ent.name,
  })))
  const chartData = entRows.map((ent) => ({
    name: ent.name,
    spend: Math.round(ent.spend || 0),
    revenue: Math.round(ent.revenue || 0),
    buyoutRevenue: Math.round(ent.buyoutRevenue || 0),
  }))

  const fetchData = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    const from = overrideFrom || dateFrom
    const to = overrideTo || dateTo
    const selection = selectionToParam(selectedEnt)
    const cacheScope = getDailyCacheScope(selection, entrepreneurs, null, includeAngelina, showBuyouts ? 'sales' : 'orders')
    const cacheParams = `${from}:${to}:${showBuyouts ? 'with-buyouts' : 'orders'}`
    const cached = readReportCache<{ data: AdSpendData; errors: RateLimitError[] }>('ads', cacheScope, cacheParams)
    if (cached) {
      setData(cached.data)
      setRateLimitErrors(cached.errors || [])
      setLoading(false)
      return
    }

    setLoading(true)
    setRateLimitErrors([])
    setData(null)
    try {
      const adParams = new URLSearchParams()
      adParams.set('entrepreneurId', selection)
      adParams.set('from', from)
      adParams.set('to', to)
      appendAngelinaParam(adParams, includeAngelina)

      const dailyParams = new URLSearchParams()
      dailyParams.set('entrepreneurId', selection)
      dailyParams.set('section', 'daily')
      dailyParams.set('dateFrom', from)
      dailyParams.set('dateTo', to)
      appendAngelinaParam(dailyParams, includeAngelina)
      const buyoutParams = new URLSearchParams(dailyParams)
      appendMetricParam(buyoutParams, 'sales')

      const [adRes, dailyRes, buyoutRes] = await Promise.all([
        fetch(`/api/ad-spend?${adParams.toString()}`),
        fetch(`/api/wb-data?${dailyParams.toString()}`),
        showBuyouts ? fetch(`/api/wb-data?${buyoutParams.toString()}`) : Promise.resolve(null),
      ])
      const [adJson, dailyJson, buyoutJson] = await Promise.all([
        adRes.json(),
        dailyRes.json(),
        buyoutRes ? buyoutRes.json() : Promise.resolve(null),
      ])
      const dailyRevenueByEntrepreneur: Record<number, number> = {}
      const buyoutRevenueByEntrepreneur: Record<number, number> = {}

      for (const [date, rows] of Object.entries(dailyJson.daily?.entrepreneurDailyRevenue || {})) {
        if (date < from || date > to) continue
        for (const [entId, revenue] of Object.entries(rows as Record<string, number>)) {
          dailyRevenueByEntrepreneur[Number(entId)] = (dailyRevenueByEntrepreneur[Number(entId)] || 0) + Number(revenue || 0)
        }
      }
      for (const [date, rows] of Object.entries(buyoutJson?.daily?.entrepreneurDailyRevenue || {})) {
        if (date < from || date > to) continue
        for (const [entId, revenue] of Object.entries(rows as Record<string, number>)) {
          buyoutRevenueByEntrepreneur[Number(entId)] = (buyoutRevenueByEntrepreneur[Number(entId)] || 0) + Number(revenue || 0)
        }
      }

      const enrichedEntrepreneurs = (adJson.entrepreneurs || []).map((ent: AdSpendData['entrepreneurs'][number]) => {
        const revenue = dailyRevenueByEntrepreneur[ent.id] || 0
        const buyoutRevenue = buyoutRevenueByEntrepreneur[ent.id] || 0
        const spend = Number(ent.spend || 0)
        return {
          ...ent,
          revenue,
          buyoutRevenue,
          drr: revenue > 0 ? Math.round((spend / revenue) * 1000) / 10 : null,
          buyoutDrr: buyoutRevenue > 0 ? Math.round((spend / buyoutRevenue) * 1000) / 10 : null,
        }
      })
      const totalSpend = enrichedEntrepreneurs.reduce((sum: number, ent: AdSpendData['entrepreneurs'][number]) => sum + Number(ent.spend || 0), 0)
      const totalRevenue = enrichedEntrepreneurs.reduce((sum: number, ent: AdSpendData['entrepreneurs'][number]) => sum + Number(ent.revenue || 0), 0)
      const totalBuyoutRevenue = enrichedEntrepreneurs.reduce((sum: number, ent: AdSpendData['entrepreneurs'][number]) => sum + Number(ent.buyoutRevenue || 0), 0)

      const nextData = {
        ...adJson,
        period: { from, to },
        entrepreneurs: enrichedEntrepreneurs,
        grouped: adJson.grouped || {},
        totalSpend,
        totalRevenue,
        totalBuyoutRevenue,
        drr: totalRevenue > 0 ? Math.round((totalSpend / totalRevenue) * 1000) / 10 : null,
        buyoutDrr: totalBuyoutRevenue > 0 ? Math.round((totalSpend / totalBuyoutRevenue) * 1000) / 10 : null,
      }
      const errors = [...(adJson.errors || []), ...(dailyJson.rateLimitErrors || []), ...(buyoutJson?.rateLimitErrors || [])]
      setData(nextData)
      setRateLimitErrors(errors)
      if (errors.length === 0) writeReportCache('ads', cacheScope, cacheParams, { data: nextData, errors })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selectedEnt, entrepreneurs, includeAngelina, showBuyouts])

  const applyQuickRange = (days: number) => {
    const range = getRangeFromYesterday(days)
    setDateFrom(range.from)
    setDateTo(range.to)
    fetchData(range.from, range.to)
  }

  return (
    <div className="space-y-6">
      <RateLimitAlert errors={rateLimitErrors} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={setSelectedEnt}
          className="w-full sm:w-64"
        />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
        <span className="hidden text-sm text-muted-foreground sm:inline">—</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
        <ToggleGroup type="single" onValueChange={(value) => {
          if (value === 'week') applyQuickRange(7)
          if (value === 'twoWeeks') applyQuickRange(14)
          if (value === 'month') applyQuickRange(30)
        }} className="justify-start rounded-md border">
          <ToggleGroupItem value="week" className="text-xs px-3">Неделя</ToggleGroupItem>
          <ToggleGroupItem value="twoWeeks" className="text-xs px-3">2 недели</ToggleGroupItem>
          <ToggleGroupItem value="month" className="text-xs px-3">Месяц</ToggleGroupItem>
        </ToggleGroup>
        <label className="flex w-full items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-xs sm:w-auto">
          <span className="whitespace-nowrap font-medium">Выкупы</span>
          <Switch checked={showBuyouts} onCheckedChange={(checked) => {
            setShowBuyouts(checked)
            setData(null)
            setRateLimitErrors([])
          }} />
        </label>
        <Button onClick={() => fetchData()} disabled={loading} className="w-full gap-2 sm:w-auto">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Загрузка...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Загрузить
            </>
          )}
        </Button>
      </div>

      {loading && <Skeleton className="h-96 w-full" />}

      {!loading && !data && (
        <EmptyState
          message="Выберите ИП, период и нажмите «Загрузить»"
          icon={<Megaphone className="h-12 w-12" />}
        />
      )}

      {!loading && data && (
        <>
          {rateLimitErrors.length > 0 && entRows.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>WB Promotion API</AlertTitle>
              <AlertDescription>Нет доступных данных рекламы. Нужны WB API токены с категорией «Продвижение».</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">Расходы на рекламу</div>
                <div className="mt-1 text-2xl font-bold">{formatNumber(Math.round(data.totalSpend || 0))} ₽</div>
                <div className="mt-1 text-xs text-muted-foreground">{periodLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">Выручка заказов</div>
                <div className="mt-1 text-2xl font-bold">{formatNumber(Math.round(data.totalRevenue || 0))} ₽</div>
                <div className="mt-1 text-xs text-muted-foreground">Тот же период</div>
                {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Выкупы: {formatNumber(Math.round(data.totalBuyoutRevenue || 0))} ₽</div>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">ДРР</div>
                <div className="mt-1 text-2xl font-bold">{data.drr === null || data.drr === undefined ? '—' : `${data.drr}%`}</div>
                <div className="mt-1 text-xs text-muted-foreground">Реклама / выручка</div>
                {showBuyouts && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">По выкупам: {data.buyoutDrr === null || data.buyoutDrr === undefined ? '—' : `${data.buyoutDrr}%`}</div>}
              </CardContent>
            </Card>
          </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Расходы на рекламу по кабинетам
              <Badge variant="secondary" className="text-xs">WB Promotion API</Badge>
            </CardTitle>
          </CardHeader>
        <CardContent>
          {entRows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Нет данных о расходах на рекламу за выбранный период</p>
          ) : (
            <div className="h-[300px] sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(value: number) => `${formatNumber(value)} ₽`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
	                  <Legend wrapperStyle={{ fontSize: '12px' }} />
	                  <Bar dataKey="spend" name="Реклама" fill="#f59e0b" radius={[2, 2, 0, 0]} />
	                  <Bar dataKey="revenue" name="Выручка" fill="#10b981" radius={[2, 2, 0, 0]} />
	                  {showBuyouts && <Bar dataKey="buyoutRevenue" name="Выручка выкупов" fill="#059669" radius={[2, 2, 0, 0]} />}
	                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      {entRows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Расходы на рекламу — детализация ({periodLabel})</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50 z-10">ИП</th>
                    <th className="text-right px-3 py-2 font-medium min-w-[110px]">Реклама</th>
                    <th className="text-right px-3 py-2 font-medium min-w-[110px]">Выручка</th>
                    <th className="text-right px-3 py-2 font-medium min-w-[80px]">ДРР</th>
                  </tr>
                </thead>
                <tbody>
                  {entRows.map((ent) => (
                    <tr key={ent.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">{ent.name}</td>
                      <td className="text-right px-3 py-2">{formatNumber(Math.round(ent.spend || 0))} ₽</td>
	                      <td className="text-right px-3 py-2">
                            <div>{formatNumber(Math.round(ent.revenue || 0))} ₽</div>
                            {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(Math.round(ent.buyoutRevenue || 0))} ₽</div>}
                          </td>
	                      <td className="text-right px-3 py-2 font-medium">
                            <div>{ent.drr === null || ent.drr === undefined ? '—' : `${ent.drr}%`}</div>
                            {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {ent.buyoutDrr === null || ent.buyoutDrr === undefined ? '—' : `${ent.buyoutDrr}%`}</div>}
                          </td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-emerald-50 dark:bg-emerald-950/20 z-10">ИТОГО</td>
                    <td className="text-right px-3 py-2">{formatNumber(Math.round(data.totalSpend || 0))} ₽</td>
	                    <td className="text-right px-3 py-2">
                        <div>{formatNumber(Math.round(data.totalRevenue || 0))} ₽</div>
                        {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {formatNumber(Math.round(data.totalBuyoutRevenue || 0))} ₽</div>}
                      </td>
	                    <td className="text-right px-3 py-2 font-bold">
                        <div>{data.drr === null || data.drr === undefined ? '—' : `${data.drr}%`}</div>
                        {showBuyouts && <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">В {data.buyoutDrr === null || data.buyoutDrr === undefined ? '—' : `${data.buyoutDrr}%`}</div>}
                      </td>
                  </tr>
                </tbody>
              </table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {entRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Кампании по затратам ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Нет затрат по кампаниям за выбранный период</div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {entRows.map((ent) => {
                  const campaigns = [...(ent.campaigns || [])].sort((a, b) => b.spend - a.spend)
                  const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0)
                  const revenue = campaigns.reduce((sum, campaign) => sum + Number(campaign.revenue || 0), 0)
                  const drr = revenue > 0 ? Math.round((spend / revenue) * 1000) / 10 : null

                  return (
                    <AccordionItem key={ent.id} value={String(ent.id)} className="rounded-md border px-3">
                      <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                        <div className="grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto] sm:items-center">
                          <div className="font-medium">{ent.name}</div>
                          <div className="text-xs text-muted-foreground sm:text-right">{campaigns.length} камп.</div>
                          <div className="text-xs sm:text-right">
                            <span className="text-muted-foreground">Затраты </span>
                            <span className="font-semibold">{formatNumber(Math.round(spend))} ₽</span>
                          </div>
                          <div className="text-xs sm:text-right">
                            <span className="text-muted-foreground">Выручка </span>
                            <span className="font-semibold">{formatNumber(Math.round(revenue))} ₽</span>
                          </div>
                          <div className="text-xs sm:text-right">
                            <span className="text-muted-foreground">ДРР </span>
                            <span className="font-semibold">{drr === null ? '—' : `${drr}%`}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {campaigns.length === 0 ? (
                          <div className="pb-3 text-sm text-muted-foreground">Нет затрат по кампаниям за выбранный период</div>
                        ) : (
                          <ScrollArea className="w-full">
                            <table className="min-w-full text-xs sm:text-sm">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="min-w-[60px] px-3 py-2 text-right font-medium">#</th>
                                  <th className="min-w-[260px] px-3 py-2 text-left font-medium">Кампания</th>
                                  <th className="min-w-[90px] px-3 py-2 text-right font-medium">ID</th>
                                  <th className="min-w-[120px] px-3 py-2 text-right font-medium">Затраты</th>
                                  <th className="min-w-[120px] px-3 py-2 text-right font-medium">Выручка</th>
                                  <th className="min-w-[80px] px-3 py-2 text-right font-medium">ДРР</th>
                                </tr>
                              </thead>
                              <tbody>
                                {campaigns.map((campaign, index) => (
                                  <tr key={`${ent.id}-${campaign.advertId}-${index}`} className="border-b last:border-b-0 hover:bg-muted/30">
                                    <td className="px-3 py-2 text-right text-muted-foreground">{index + 1}</td>
                                    <td className="px-3 py-2">{campaign.name}</td>
                                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{campaign.advertId || '-'}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{formatNumber(campaign.spend)} ₽</td>
                                    <td className="px-3 py-2 text-right">{formatNumber(Math.round(campaign.revenue || 0))} ₽</td>
                                    <td className="px-3 py-2 text-right">{campaign.drr === null || campaign.drr === undefined ? '—' : `${campaign.drr}%`}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <ScrollBar orientation="horizontal" />
                          </ScrollArea>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  )
}

// --- WB Compare Tab ---
function combineCompareData(items: CompareData[], entrepreneurs: EntrepreneurInfo[], selectedIds: string[]): CompareData | null {
  if (items.length === 0) return null
  if (items.length === 1) return items[0]

  const productMap = new Map<string, CompareData['productSummary'][number]>()
  for (const item of items) {
    for (const product of item.productSummary) {
      const key = `${product.productName}__${product.excelSize}`
      const existing = productMap.get(key)
      if (!existing) {
        productMap.set(key, { ...product, wbBySize: { ...product.wbBySize } })
        continue
      }
      const wbBySize = { ...existing.wbBySize }
      for (const [size, count] of Object.entries(product.wbBySize)) {
        wbBySize[size] = (wbBySize[size] || 0) + count
      }
      const excelTotal = existing.excelTotal + product.excelTotal
      const wbTotal = existing.wbTotal + product.wbTotal
      const diff = wbTotal - excelTotal
      productMap.set(key, {
        ...existing,
        excelTotal,
        wbTotal,
        diff,
        diffPercent: excelTotal > 0 ? ((diff / excelTotal) * 100).toFixed(1) : '—',
        isMatched: existing.isMatched || product.isMatched,
        wbArticleCount: existing.wbArticleCount + product.wbArticleCount,
        wbBySize,
        wbSubject: [...new Set([existing.wbSubject, product.wbSubject].filter(Boolean).flatMap((v) => v.split(', ').filter(Boolean)))].join(', '),
        wbCategory: [...new Set([existing.wbCategory, product.wbCategory].filter(Boolean).flatMap((v) => v.split(', ').filter(Boolean)))].join(', '),
        matchMethod: [...new Set([existing.matchMethod, product.matchMethod].filter(Boolean).flatMap((v) => v.split(', ').filter(Boolean)))].join(', '),
      })
    }
  }

  const unmatchedMap = new Map<string, CompareData['unmatchedBySubject'][number]>()
  for (const item of items) {
    for (const group of item.unmatchedBySubject) {
      const existing = unmatchedMap.get(group.subject)
      unmatchedMap.set(group.subject, existing ? {
        subject: group.subject,
        articleCount: existing.articleCount + group.articleCount,
        totalOrders: existing.totalOrders + group.totalOrders,
        examples: [...new Set([...existing.examples, ...group.examples])].slice(0, 5),
      } : { ...group })
    }
  }

  const names = selectedIds
    .map((id) => entrepreneurs.find((e) => String(e.id) === id)?.name)
    .filter(Boolean)
    .join(', ')

  return {
    ...items[0],
    entrepreneur: { id: 0, name: names || `Выбрано ИП: ${items.length}` },
    wbError: items.map((item) => item.wbError).filter(Boolean).join('; ') || null,
    totals: {
      excelTotal: items.reduce((s, item) => s + item.totals.excelTotal, 0),
      wbTotal: items.reduce((s, item) => s + item.totals.wbTotal, 0),
      matchedExcelTotal: items.reduce((s, item) => s + item.totals.matchedExcelTotal, 0),
      matchedWbTotal: items.reduce((s, item) => s + item.totals.matchedWbTotal, 0),
      totalDiff: items.reduce((s, item) => s + item.totals.totalDiff, 0),
      matchedDiff: items.reduce((s, item) => s + item.totals.matchedDiff, 0),
    },
    productSummary: [...productMap.values()].sort((a, b) => {
      if (a.isMatched && !b.isMatched) return -1
      if (!a.isMatched && b.isMatched) return 1
      return Math.abs(b.diff) - Math.abs(a.diff)
    }),
    unmatchedBySubject: [...unmatchedMap.values()].sort((a, b) => b.totalOrders - a.totalOrders),
  }
}

function WbCompareTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>(['5']) // Масляков А.А. by default
  const [dateFrom, setDateFrom] = useState<string>('2026-04-01')
  const [dateTo, setDateTo] = useState<string>('2026-04-29')
  const apiEntrepreneurs = entrepreneurs.filter((e) => e.hasApiKey && e.id < 100000)

  const fetchData = useCallback(async () => {
    const ids = selectedEnt.includes(ALL_ENTREPRENEURS)
      ? apiEntrepreneurs.map((e) => String(e.id))
      : selectedEnt
    if (ids.length === 0) return
    setLoading(true)
    try {
      const selection = ids.join(',')
      const cacheScope = getDailyCacheScope(selection, entrepreneurs, null)
      const cacheParams = `${dateFrom}:${dateTo}`
      const cached = readReportCache<CompareData | null>('compare', cacheScope, cacheParams)
      if (cached) {
        setData(cached)
        return
      }

      const results = await Promise.all(ids.map(async (id) => {
        const params = new URLSearchParams({
          entrepreneurId: id,
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        })
        const res = await fetch(`/api/wb-compare?${params.toString()}`)
        return await res.json()
      }))
      const combined = combineCompareData(results.filter((item) => !item.error), entrepreneurs, ids)
      setData(combined)
      if (combined && !combined.wbError) writeReportCache('compare', cacheScope, cacheParams, combined)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, apiEntrepreneurs, dateFrom, dateTo, entrepreneurs])

  const selectedEntrepreneurLabel = selectionLabel(selectedEnt, apiEntrepreneurs)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={apiEntrepreneurs}
          selectedIds={selectedEnt}
          onChange={setSelectedEnt}
          className="w-full sm:w-72"
          placeholder="Выберите ИП с API"
        />

        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
        <span className="text-sm text-muted-foreground">—</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />

        <Button onClick={fetchData} disabled={loading || selectedEnt.length === 0 || apiEntrepreneurs.length === 0} className="w-full sm:w-auto">
          {loading ? 'Загрузка...' : 'Сравнить'}
        </Button>
      </div>

      {/* No API keys message */}
      {apiEntrepreneurs.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Нет API ключей</AlertTitle>
          <AlertDescription>
            Для сравнения данных необходимо добавить API ключ Wildberries хотя бы для одного ИП.
            Добавьте ключ в настройках базы данных.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && <Skeleton className="h-96 w-full" />}

      {/* Data */}
      {data && !loading && (
        <div className="space-y-4">
          {/* Data source indicator */}
          {data.dataSource && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Источник WB: {data.dataSource === 'funnel' ? 'Воронка продаж' : data.dataSource === 'sales' ? 'Продажи (Sales API)' : 'Заказы (Orders API)'}
              </span>
              <span>— сравнение строится по заказам с маппингом WB-артикулов к Excel-товарам</span>
            </div>
          )}

          {/* API Error */}
          {data.wbError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Ошибка WB API</AlertTitle>
              <AlertDescription>{data.wbError}</AlertDescription>
            </Alert>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Excel (таблица)</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.totals.excelTotal)}</div>
                <p className="text-xs text-muted-foreground mt-1">заказов за период</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">WB API</CardTitle>
                <GitCompare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.totals.wbTotal)}</div>
                <p className="text-xs text-muted-foreground mt-1">заказов за период</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Разница</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={data.totals.totalDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {data.totals.totalDiff >= 0 ? '+' : ''}{formatNumber(data.totals.totalDiff)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">API − Excel</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Сопоставлено</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.productSummary ? data.productSummary.filter((c) => c.isMatched).length : 0} / {data.productSummary?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">товаров с API</p>
              </CardContent>
            </Card>
          </div>

          {/* Product Summary - each product with size */}
          {data.productSummary && data.productSummary.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Сравнение по товарам: {selectedEntrepreneurLabel} — Excel vs WB API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <table className="text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50 z-10 min-w-[220px]">Товар (Excel)</th>
                        <th className="text-left px-3 py-2 font-medium min-w-[80px]">Размер</th>
                        <th className="text-center px-3 py-2 font-medium min-w-[50px]">Арт.</th>
                        <th className="text-left px-3 py-2 font-medium min-w-[130px]">API предмет</th>
                        <th className="text-left px-3 py-2 font-medium min-w-[100px]">Метод</th>
                        <th className="text-right px-3 py-2 font-medium min-w-[70px]">Excel</th>
                        <th className="text-right px-3 py-2 font-medium min-w-[70px]">API</th>
                        <th className="text-right px-3 py-2 font-medium min-w-[70px]">Разница</th>
                        <th className="text-right px-3 py-2 font-medium min-w-[60px]">%</th>
                        <th className="text-center px-3 py-2 font-medium min-w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Grand totals */}
                      <tr className="bg-emerald-50 dark:bg-emerald-950/20 border-b font-semibold">
                        <td className="px-3 py-2 sticky left-0 bg-emerald-50 dark:bg-emerald-950/20 z-10">ИТОГО</td>
                        <td className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" />
                        <td className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" />
                        <td className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" />
                        <td className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" />
                        <td className="text-right px-3 py-2 font-bold bg-emerald-50 dark:bg-emerald-950/20">{formatNumber(data.totals.excelTotal)}</td>
                        <td className="text-right px-3 py-2 font-bold bg-emerald-50 dark:bg-emerald-950/20">{formatNumber(data.totals.wbTotal)}</td>
                        <td className={`text-right px-3 py-2 font-bold bg-emerald-50 dark:bg-emerald-950/20 ${data.totals.totalDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {data.totals.totalDiff >= 0 ? '+' : ''}{formatNumber(data.totals.totalDiff)}
                        </td>
                        <td className="text-right px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20">
                          {data.totals.excelTotal > 0 ? ((data.totals.totalDiff / data.totals.excelTotal) * 100).toFixed(1) : '—'}%
                        </td>
                        <td className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" />
                      </tr>

                      {/* Product rows */}
                      {data.productSummary.map((item, idx) => {
                        const isExact = item.isMatched && item.diff === 0
                        const hasDiff = item.isMatched && item.diff !== 0

                        return (
                          <tr key={idx} className={`border-b hover:bg-muted/30 transition-colors ${!item.isMatched ? 'bg-amber-50/50 dark:bg-amber-950/5' : ''}`}>
                            <td className="px-3 py-2 sticky left-0 bg-background z-10">
                              <span className={!item.isMatched ? 'text-amber-600' : ''}>{item.productName}</span>
                            </td>
                            <td className="px-3 py-2">
                              {item.excelSize ? (
                                <Badge variant="outline" className="text-xs font-mono">{item.excelSize}</Badge>
                              ) : '—'}
                            </td>
                            <td className="text-center px-3 py-2">
                              {item.wbArticleCount > 0 ? (
                                <Badge variant="secondary" className="text-xs">{item.wbArticleCount}</Badge>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {item.wbSubject || '—'}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {item.matchMethod ? (
                                <Badge variant="outline" className="text-[10px] font-normal">{item.matchMethod}</Badge>
                              ) : '—'}
                            </td>
                            <td className="text-right px-3 py-2">{item.excelTotal || '—'}</td>
                            <td className="text-right px-3 py-2">{item.wbTotal || '—'}</td>
                            <td className={`text-right px-3 py-2 font-medium ${item.diff > 0 ? 'text-emerald-600' : item.diff < 0 ? 'text-red-600' : ''}`}>
                              {item.diff !== 0 ? `${item.diff > 0 ? '+' : ''}${formatNumber(item.diff)}` : '0'}
                            </td>
                            <td className="text-right px-3 py-2 text-muted-foreground">{item.diffPercent !== '—' ? `${item.diffPercent}%` : '—'}</td>
                            <td className="text-center px-3 py-2">
                              {isExact ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              ) : hasDiff ? (
                                <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />
                              ) : !item.isMatched ? (
                                <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Unmatched WB Articles by Subject */}
          {data.unmatchedBySubject && data.unmatchedBySubject.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Несопоставленные артикулы WB API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <table className="text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium">Предмет (WB)</th>
                        <th className="text-right px-3 py-2 font-medium">Артикулов</th>
                        <th className="text-right px-3 py-2 font-medium">Заказов</th>
                        <th className="text-left px-3 py-2 font-medium">Примеры</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.unmatchedBySubject.map((item, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 font-medium">{item.subject}</td>
                          <td className="text-right px-3 py-2">{item.articleCount}</td>
                          <td className="text-right px-3 py-2 font-medium">{formatNumber(item.totalOrders)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {item.examples.map((ex, i) => (
                              <span key={i} className="inline-block mr-1 mb-1">
                                <Badge variant="outline" className="text-[10px] font-mono">{ex}</Badge>
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </div>
  )
}

// --- API Key Management Tab ---
function ApiKeyTab({ entrepreneurs, onRefresh }: { entrepreneurs: EntrepreneurInfo[]; onRefresh: () => void }) {
  const [showKey, setShowKey] = useState<Record<number, boolean>>({})
  const [deleting, setDeleting] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogEntId, setDialogEntId] = useState<string>('')
  const [dialogKey, setDialogKey] = useState<string>('')
  const [dialogPromotionKey, setDialogPromotionKey] = useState<string>('')
  const [dialogSaving, setDialogSaving] = useState(false)

  const handleSave = async (entId: number, apiKey: string, promotionApiKey: string) => {
    if (!apiKey.trim() && !promotionApiKey.trim()) return
    setDialogSaving(true)
    try {
      const res = await fetch('/api/save-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrepreneurId: entId,
          apiKey: apiKey.trim(),
          promotionApiKey: promotionApiKey.trim(),
        }),
      })
      if (res.ok) {
        onRefresh()
        setDialogOpen(false)
        setDialogKey('')
        setDialogPromotionKey('')
        setDialogEntId('')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDialogSaving(false)
    }
  }

  const handleDelete = async (entId: number) => {
    setDeleting(entId)
    try {
      const res = await fetch(`/api/save-api-key?entrepreneurId=${entId}`, { method: 'DELETE' })
      if (res.ok) {
        onRefresh()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(null)
    }
  }

  const openAddDialog = (entId?: number) => {
    if (entId) {
      setDialogEntId(String(entId))
    } else {
      setDialogEntId('')
    }
    setDialogKey('')
    setDialogPromotionKey('')
    setDialogOpen(true)
  }

  const toggleShowKey = (entId: number) => {
    setShowKey(prev => ({ ...prev, [entId]: !prev[entId] }))
  }

  const maskKey = (key: string) => {
    if (key.length <= 8) return '••••••••'
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4)
  }

  const withKeys = entrepreneurs.filter(e => e.hasApiKey)
  const withoutKeys = entrepreneurs.filter(e => !e.hasApiKey)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Ключи Wildberries
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Управление API ключами для доступа к данным WB. {withKeys.length} из {entrepreneurs.length} ИП имеют ключи.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openAddDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Добавить ключ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Добавить API ключ</DialogTitle>
              <DialogDescription>
                Введите API ключ Wildberries для выбранного ИП. Ключ можно получить в личном кабинете WB → Настройки → Доступ к API.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ИП</Label>
                <Select value={dialogEntId} onValueChange={setDialogEntId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите ИП" />
                  </SelectTrigger>
                  <SelectContent>
                    {entrepreneurs.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name} {e.hasApiKey ? '🔑' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>API ключ Статистика</Label>
                <Input
                  type="text"
                  placeholder="Для заказов, остатков и поставок"
                  value={dialogKey}
                  onChange={(e) => setDialogKey(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>API ключ Продвижение</Label>
                <Input
                  type="text"
                  placeholder="Для рекламы и роста, можно оставить пустым"
                  value={dialogPromotionKey}
                  onChange={(e) => setDialogPromotionKey(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
              <Button
                onClick={() => handleSave(Number(dialogEntId), dialogKey, dialogPromotionKey)}
                disabled={!dialogEntId || (!dialogKey.trim() && !dialogPromotionKey.trim()) || dialogSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {dialogSaving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Всего ИП</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entrepreneurs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">С API ключом</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{withKeys.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Без ключа</CardTitle>
            <XCircle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{withoutKeys.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Entrepreneurs with keys */}
      {withKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              🔑 ИП с API ключами
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {withKeys.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/10">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                      <Key className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{e.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {showKey[e.id] && e.wbApiKey ? e.wbApiKey : (e.wbApiKey ? maskKey(e.wbApiKey) : '—')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleShowKey(e.id)}>
                      {showKey[e.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openAddDialog(e.id)} className="text-muted-foreground">
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(e.id)}
                      disabled={deleting === e.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entrepreneurs without keys */}
      {withoutKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              🔒 ИП без API ключей
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {withoutKeys.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{e.name}</p>
                      <p className="text-xs text-muted-foreground">API ключ не добавлен</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openAddDialog(e.id)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Добавить
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const emptyUnitRow = (): Partial<UnitEconomicsRow> => ({
  fulfillment: 'fbs',
  productName: '',
  category: '',
  entrepreneurName: '',
  costRub: 0,
  priceBeforeDiscountRub: 0,
  discountPct: 0,
  sppPct: 0,
  walletPct: 0.02,
  commissionPct: 0,
  avgDeliveryDays: 0,
  warehouse: '',
  fixedWarehouseCoeff: 1,
  buyoutPct: 0.9,
  localizationIndex: 1,
  returnLogisticsRub: 0,
  deliveryLogisticsRub: 0,
  logisticsTotalRub: 0,
  taxAcquiringPct: 0,
  drrPct: 0,
  minProfitRub: 0,
  lengthCm: 0,
  widthCm: 0,
  heightCm: 0,
  weightKg: 0,
  boxQty: 0,
  source: 'manual',
})

function UnitMetricCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div className="mt-1 text-xl font-semibold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  )
}

function UnitEconomicsTab() {
  const [rows, setRows] = useState<UnitEconomicsRow[]>([])
  const [summary, setSummary] = useState<UnitEconomicsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [fulfillment, setFulfillment] = useState<'all' | UnitFulfillment>('all')
  const [editingRow, setEditingRow] = useState<Partial<UnitEconomicsRow> | null>(null)
  const [error, setError] = useState('')
  const [syncInfo, setSyncInfo] = useState<any>(null)

  const applyStore = useCallback((json: any) => {
    const store = json?.store
    setRows(Array.isArray(store?.rows) ? store.rows : [])
    setSummary(store?.summary || null)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/unit-economics')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Не удалось загрузить юнитку')
      applyStore(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить юнитку')
    } finally {
      setLoading(false)
    }
  }, [applyStore])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const uploadExcel = useCallback(async (file: File | null) => {
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/unit-economics', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Не удалось импортировать Excel')
      applyStore(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось импортировать Excel')
    } finally {
      setSaving(false)
    }
  }, [applyStore])

  const saveRow = useCallback(async () => {
    if (!editingRow) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/unit-economics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: editingRow }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Не удалось сохранить строку')
      applyStore(json)
      setEditingRow(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить строку')
    } finally {
      setSaving(false)
    }
  }, [applyStore, editingRow])

  const deleteRow = useCallback(async (row: UnitEconomicsRow) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/unit-economics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: row.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Не удалось удалить строку')
      applyStore(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить строку')
    } finally {
      setSaving(false)
    }
  }, [applyStore])

  const syncWb = useCallback(async () => {
    setSaving(true)
    setError('')
    setSyncInfo(null)
    try {
      const res = await fetch('/api/unit-economics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-wb' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Не удалось синхронизировать WB API')
      applyStore(json)
      setSyncInfo(json.sync || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось синхронизировать WB API')
    } finally {
      setSaving(false)
    }
  }, [applyStore])

  const visibleRows = useMemo(() => {
    const text = query.trim().toLowerCase()
    return rows
      .filter((row) => fulfillment === 'all' || row.fulfillment === fulfillment)
      .filter((row) => !text || [
        row.productName,
        row.category || '',
        row.entrepreneurName,
        row.vendorCode || '',
        String(row.nmId || ''),
      ].join(' ').toLowerCase().includes(text))
      .sort((a, b) => {
        const statusOrder = { loss: 0, 'below-min-profit': 1, incomplete: 2, ok: 3 }
        return statusOrder[a.status] - statusOrder[b.status] || a.productName.localeCompare(b.productName, 'ru')
      })
  }, [fulfillment, query, rows])

  const setEditNumber = (key: keyof UnitEconomicsRow, value: string, pct = false) => {
    const number = Number(value)
    setEditingRow((current) => ({
      ...(current || emptyUnitRow()),
      [key]: Number.isFinite(number) ? (pct ? number / 100 : number) : 0,
    }))
  }

  const setEditText = (key: keyof UnitEconomicsRow, value: string) => {
    setEditingRow((current) => ({ ...(current || emptyUnitRow()), [key]: value }))
  }

  const unitStatus = (row: UnitEconomicsRow) => {
    if (row.status === 'loss') return <Badge variant="destructive">Минус</Badge>
    if (row.status === 'below-min-profit') return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Ниже минимума</Badge>
    if (row.status === 'incomplete') return <Badge variant="outline">Неполно</Badge>
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Ок</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Юнит экономика</h2>
          <p className="text-sm text-muted-foreground">Эталонные расчеты FBS/FBO с импортом из Excel и редактируемыми ручными полями.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadRows} disabled={loading || saving} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button variant="outline" onClick={syncWb} disabled={loading || saving} className="gap-2">
            <Download className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
            WB API
          </Button>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                event.currentTarget.value = ''
                uploadExcel(file)
              }}
            />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
              <Upload className="h-4 w-4" />
              Импорт Excel
            </span>
          </label>
          <Button onClick={() => setEditingRow(emptyUnitRow())} className="gap-2">
            <Plus className="h-4 w-4" />
            Товар
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {syncInfo && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>WB API синхронизация завершена</AlertTitle>
          <AlertDescription>
            Карточек: {formatNumber(syncInfo.cards || 0)}, цен: {formatNumber(syncInfo.prices || 0)}, совпадений строк: {formatNumber(syncInfo.matchedRows || 0)}, обновлено: {formatNumber(syncInfo.updatedRows || 0)}
            {Array.isArray(syncInfo.errors) && syncInfo.errors.length > 0 ? `; ошибки: ${syncInfo.errors.slice(0, 2).join('; ')}` : ''}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <UnitMetricCard title="Строк" value={formatNumber(summary?.totalRows || 0)} subtitle={`${formatNumber(summary?.activeRows || 0)} активных`} />
        <UnitMetricCard title="Средняя прибыль" value={`${formatNumber(Math.round(summary?.avgProfitRub || 0))} ₽`} subtitle="после рекламы" />
        <UnitMetricCard title="Рентабельность" value={`${(summary?.avgProfitabilityPct || 0).toFixed(1)}%`} subtitle="средняя по строкам" />
        <UnitMetricCard title="В минусе" value={formatNumber(summary?.lossRows || 0)} subtitle="требуют внимания" />
        <UnitMetricCard title="Ниже минимума" value={formatNumber(summary?.belowMinRows || 0)} subtitle="по целевой прибыли" />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">Товары</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по товару, ИП, nmId" className="sm:w-72" />
              <Select value={fulfillment} onValueChange={(value) => setFulfillment(value as 'all' | UnitFulfillment)}>
                <SelectTrigger className="sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="fbs">FBS</SelectItem>
                  <SelectItem value="fbo">FBO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Импортируйте Excel-юнитку или добавьте первый товар вручную.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium">Товар</th>
                    <th className="px-3 py-2 text-left font-medium">ИП</th>
                    <th className="px-3 py-2 text-right font-medium">Цена</th>
                    <th className="px-3 py-2 text-right font-medium">Себес.</th>
                    <th className="px-3 py-2 text-right font-medium">Логистика</th>
                    <th className="px-3 py-2 text-right font-medium">ДРР</th>
                    <th className="px-3 py-2 text-right font-medium">Прибыль</th>
                    <th className="px-3 py-2 text-right font-medium">Рент.</th>
                    <th className="px-3 py-2 text-left font-medium">Статус</th>
                    <th className="px-3 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.slice(0, 250).map((row) => (
                    <tr key={row.id} className={`border-b ${DAILY_TABLE_ROW_HOVER}`}>
                      <td className="max-w-[360px] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="uppercase">{row.fulfillment}</Badge>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.productName}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {row.nmId ? `nmId ${row.nmId}` : row.category || row.warehouse || 'без категории'}
                              {row.vendorCode ? ` · ${row.vendorCode}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.entrepreneurName || '—'}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(Math.round(row.priceAfterDiscountRub))} ₽</td>
                      <td className="px-3 py-2 text-right">{formatNumber(Math.round(row.costRub))} ₽</td>
                      <td className="px-3 py-2 text-right">{formatNumber(Math.round(row.logisticsTotalRub))} ₽</td>
                      <td className="px-3 py-2 text-right">{(row.drrPct * 100).toFixed(1)}%</td>
                      <td className={`px-3 py-2 text-right font-semibold ${row.profitWithAdsRub < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {formatNumber(Math.round(row.profitWithAdsRub))} ₽
                      </td>
                      <td className="px-3 py-2 text-right">{row.profitabilityPct.toFixed(1)}%</td>
                      <td className="px-3 py-2">{unitStatus(row)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditingRow(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteRow(row)} disabled={saving}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleRows.length > 250 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">Показаны первые 250 строк из {formatNumber(visibleRows.length)}. Уточните поиск.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingRow?.id ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
            <DialogDescription>Ручные поля сохраняются в общей админской юнитке и пересчитываются сразу после сохранения.</DialogDescription>
          </DialogHeader>
          {editingRow && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Товар</Label>
                <Input value={editingRow.productName || ''} onChange={(e) => setEditText('productName', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Тип</Label>
                <Select value={editingRow.fulfillment || 'fbs'} onValueChange={(value) => setEditText('fulfillment', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fbs">FBS</SelectItem>
                    <SelectItem value="fbo">FBO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>ИП</Label>
                <Input value={editingRow.entrepreneurName || ''} onChange={(e) => setEditText('entrepreneurName', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Категория</Label>
                <Input value={editingRow.category || ''} onChange={(e) => setEditText('category', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Склад</Label>
                <Input value={editingRow.warehouse || ''} onChange={(e) => setEditText('warehouse', e.target.value)} />
              </div>
              {[
                ['priceBeforeDiscountRub', 'Цена до скидки, ₽'],
                ['discountPct', 'Скидка, %', true],
                ['sppPct', 'СПП, %', true],
                ['walletPct', 'Кошелек, %', true],
                ['costRub', 'Себестоимость, ₽'],
                ['commissionPct', 'Комиссия, %', true],
                ['logisticsTotalRub', 'Логистика всего, ₽'],
                ['taxAcquiringPct', 'Налог + эквайринг, %', true],
                ['drrPct', 'ДРР, %', true],
                ['minProfitRub', 'Минимальная прибыль, ₽'],
                ['avgDeliveryDays', 'Среднее время доставки'],
                ['buyoutPct', '% выкупа', true],
                ['localizationIndex', 'Индекс локализации'],
                ['lengthCm', 'Длина, см'],
                ['widthCm', 'Ширина, см'],
                ['heightCm', 'Высота, см'],
                ['weightKg', 'Вес, кг'],
                ['boxQty', 'Кол-во в коробке'],
              ].map(([key, label, pct]) => (
                <div key={String(key)} className="space-y-1">
                  <Label>{String(label)}</Label>
                  <Input
                    type="number"
                    value={pct ? Number(editingRow[key as keyof UnitEconomicsRow] || 0) * 100 : Number(editingRow[key as keyof UnitEconomicsRow] || 0)}
                    onChange={(e) => setEditNumber(key as keyof UnitEconomicsRow, e.target.value, !!pct)}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRow(null)}>Отмена</Button>
            <Button onClick={saveRow} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Main Page ---
export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurInfo[]>([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedDashEnt, setSelectedDashEnt] = useState<string[]>([]) // Empty = no auto-fetch
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('yesterday')
  const [showDashboardBuyouts, setShowDashboardBuyouts] = useState(false)
  const [dashboardBuyouts, setDashboardBuyouts] = useState<DashboardData | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'excel' | 'wbapi'>('excel')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [visibleOptionalTabs, setVisibleOptionalTabs] = useState<OptionalTabId[]>(DEFAULT_VISIBLE_OPTIONAL_TABS)
  const [includeAngelina, setIncludeAngelina] = useState(false)
  const isAdmin = authUser?.role === 'admin'
  const tabEnabled = useCallback((tabId: OptionalTabId) => {
    if ((tabId === 'compare' || tabId === 'unit') && !isAdmin) return false
    return visibleOptionalTabs.includes(tabId)
  }, [isAdmin, visibleOptionalTabs])

  const loadEntrepreneurs = useCallback((withAngelina: boolean) => {
    const params = new URLSearchParams()
    if (withAngelina) params.set('includeAngelina', '1')
    fetch(`/api/entrepreneurs${params.size ? `?${params.toString()}` : ''}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setEntrepreneurs)
      .catch(console.error)
  }, [])

  const refreshEntrepreneurs = useCallback(() => {
    loadEntrepreneurs(includeAngelina)
  }, [loadEntrepreneurs, includeAngelina])

  // Fetch current user, then entrepreneurs list (local DB only, no WB API)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => {
        setAuthUser(json.user)
        if (json.user) loadEntrepreneurs(false)
      })
      .catch(console.error)
      .finally(() => setAuthChecked(true))
  }, [loadEntrepreneurs])

  const handleAuth = useCallback((user: AuthUser) => {
    setAuthUser(user)
    loadEntrepreneurs(false)
  }, [loadEntrepreneurs])

  useEffect(() => {
    if (!authUser) return

    const storageKey = `wb-visible-tabs-${authUser.id}`
    const normalizeTabs = (tabs: unknown): OptionalTabId[] => {
      if (!Array.isArray(tabs)) return DEFAULT_VISIBLE_OPTIONAL_TABS.filter((tab) => isAdmin || (tab !== 'compare' && tab !== 'unit'))
      const allowed = new Set<OptionalTabId>(OPTIONAL_TAB_IDS)
      const normalized = [...new Set(tabs)]
        .filter((tab): tab is OptionalTabId => typeof tab === 'string' && allowed.has(tab as OptionalTabId))
        .filter((tab) => isAdmin || (tab !== 'compare' && tab !== 'unit'))
      if (isAdmin && !normalized.includes('unit')) normalized.push('unit')
      return normalized
    }
    const readLocalTabs = () => {
      try {
        const localTabs = window.localStorage.getItem(storageKey)
        return localTabs ? normalizeTabs(JSON.parse(localTabs)) : normalizeTabs(DEFAULT_VISIBLE_OPTIONAL_TABS)
      } catch {
        return normalizeTabs(DEFAULT_VISIBLE_OPTIONAL_TABS)
      }
    }

    fetch('/api/user-preferences')
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const serverTabs = json?.preferences?.visibleTabs
        if (serverTabs) {
          setVisibleOptionalTabs(normalizeTabs(serverTabs))
          return
        }
        setVisibleOptionalTabs(readLocalTabs())
      })
      .catch(() => {
        setVisibleOptionalTabs(readLocalTabs())
      })
  }, [authUser, isAdmin])

  useEffect(() => {
    if (!authUser) return
    const visibleTabs = new Set(['dashboard', 'apikeys', ...visibleOptionalTabs.filter((tab) => isAdmin || (tab !== 'compare' && tab !== 'unit'))])
    if (!visibleTabs.has(activeTab)) setActiveTab('dashboard')
  }, [activeTab, authUser, isAdmin, visibleOptionalTabs])

  const updateVisibleTab = useCallback((tabId: OptionalTabId, enabled: boolean) => {
    if ((tabId === 'compare' || tabId === 'unit') && !isAdmin) return
    const next = enabled
      ? ([...new Set([...visibleOptionalTabs, tabId])] as OptionalTabId[])
      : visibleOptionalTabs.filter((tab) => tab !== tabId)

    setVisibleOptionalTabs(next)
    if (authUser) {
      window.localStorage.setItem(`wb-visible-tabs-${authUser.id}`, JSON.stringify(next))
    }
    fetch('/api/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibleTabs: next }),
    }).catch(console.error)
  }, [authUser, isAdmin, visibleOptionalTabs])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAuthUser(null)
    setEntrepreneurs([])
    setDashboard(null)
    setDashboardBuyouts(null)
    setSelectedDashEnt([])
    setIncludeAngelina(false)
    setVisibleOptionalTabs(DEFAULT_VISIBLE_OPTIONAL_TABS)
    setActiveTab('dashboard')
  }, [])

  useEffect(() => {
    if (!authUser || !isAdmin) return
    loadEntrepreneurs(includeAngelina)
    setDashboard(null)
    setDashboardBuyouts(null)
    setSelectedDashEnt([])
  }, [includeAngelina, authUser, isAdmin, loadEntrepreneurs])

  // Explicit dashboard data load — only triggered by user clicking "Загрузить"
  const loadDashboardData = useCallback(async (buyoutsOnly = false) => {
    if (selectedDashEnt.length === 0) return
    setDashboardLoading(true)
    setRateLimitErrors([])
    if (!buyoutsOnly) setDashboardBuyouts(null)
    try {
      const selection = selectionToParam(selectedDashEnt)
      if (buyoutsOnly) {
        const params = new URLSearchParams()
        params.set('entrepreneurId', selection)
        params.set('section', 'dashboard')
        params.set('metric', 'sales')
        appendAngelinaParam(params, includeAngelina)
        const res = await fetch(`/api/wb-data?${params.toString()}`)
        const json = await res.json()
        if (json.dashboard) setDashboardBuyouts(json.dashboard)
        if (json.rateLimitErrors?.length) setRateLimitErrors((current) => [...current, ...json.rateLimitErrors])
        return
      }

      const baseDashboard = createDashboardShell(selectedDashEnt, entrepreneurs)
      const cacheScope = getDailyCacheScope(selection, entrepreneurs, authUser, includeAngelina, 'orders')
      const dailyByDate = new Map<string, DailyOrdersData>()
      const adSpendByPeriod = new Map<DashboardPeriod, Record<number, number>>()
      const failedDates = new Set<string>()
      const collectPeriodDates = (period: { dateFrom: string; dateTo: string } | null | undefined) => (
        period?.dateFrom && period?.dateTo ? getClientDateRange(period.dateFrom, period.dateTo) : []
      )
      const uniqueDates = (items: string[]) => [...new Set(items)].sort()
      const allDashboardDates = uniqueDates(
        (Object.keys(baseDashboard.periodStats) as DashboardPeriod[]).flatMap((period) => [
          ...collectPeriodDates(baseDashboard.periodStats[period]),
          ...collectPeriodDates(baseDashboard.prevPeriodStats[period]),
        ])
      )
      const requiredDates = uniqueDates([
        ...collectPeriodDates(baseDashboard.periodStats[dashboardPeriod]),
        ...collectPeriodDates(baseDashboard.prevPeriodStats[dashboardPeriod]),
        ...collectPeriodDates(baseDashboard.periodStats.week),
      ])

      setDashboard(baseDashboard)
      setDataSource('wbapi')

      const applyExactDashboard = () => {
        const next = cloneDashboard(baseDashboard)
        const chartDates = allDashboardDates.filter((date) => dailyByDate.has(date))
        next.chartDates = chartDates

        for (const date of chartDates) {
          const day = dailyByDate.get(date) || null
          next.chartFbs[date] = sumDailyFbs(day)
          next.chartFbo[date] = sumDailyFbo(day)
        }

        const getPeriodTotals = (stats: { dateFrom: string; dateTo: string }) => {
          const periodDates = collectPeriodDates(stats)
          if (periodDates.length === 0 || !periodDates.every((date) => dailyByDate.has(date))) return null
          return periodDates.reduce((acc, date) => {
            const day = dailyByDate.get(date) || null
            acc.total += sumDailyTotal(day)
            acc.fbs += sumDailyFbs(day)
            acc.fbo += sumDailyFbo(day)
            acc.revenue += sumDailyRevenue(day)
            return acc
          }, { total: 0, fbs: 0, fbo: 0, revenue: 0 })
        }

        const patchPeriod = (period: keyof DashboardData['periodStats'], source: 'periodStats' | 'prevPeriodStats') => {
          const stats = next[source][period]
          const totals = getPeriodTotals(stats)
          if (!totals) return
          next[source][period] = { ...stats, ...totals, revenue: Math.round(totals.revenue) }
        }

        ;(Object.keys(next.periodStats) as DashboardPeriod[]).forEach((period) => {
          patchPeriod(period, 'periodStats')
          patchPeriod(period, 'prevPeriodStats')
        })

        const yesterdayDate = next.periodStats.yesterday.dateTo
        if (dailyByDate.has(yesterdayDate)) {
          const day = dailyByDate.get(yesterdayDate) || null
          next.yesterdayOrders = sumDailyTotal(day)
          next.yesterdayFbsOrders = sumDailyFbs(day)
          next.yesterdayFboOrders = sumDailyFbo(day)
        }
        const dayBeforeDate = next.prevPeriodStats.yesterday.dateTo
        if (dailyByDate.has(dayBeforeDate)) {
          const day = dailyByDate.get(dayBeforeDate) || null
          next.dayBeforeYesterdayOrders = sumDailyTotal(day)
          next.dayBeforeYesterdayFbsOrders = sumDailyFbs(day)
          next.dayBeforeYesterdayFboOrders = sumDailyFbo(day)
        }

        next.weekTotalOrders = next.periodStats.week.total
        const byEnt = new Map<number, { id: number; name: string; totalOrders: number }>()
        for (const row of baseDashboard.weekEntrepreneurStats) byEnt.set(row.id, { ...row, totalOrders: 0 })
        const weekDates = collectPeriodDates(next.periodStats.week)
        if (weekDates.every((date) => dailyByDate.has(date))) {
          for (const date of weekDates) {
            const day = dailyByDate.get(date)
            for (const [entIdRaw, value] of Object.entries(day?.entrepreneurDailyData?.[date] || {})) {
              const entId = Number(entIdRaw)
              const existing = byEnt.get(entId) || { id: entId, name: entrepreneurs.find((ent) => ent.id === entId)?.name || String(entId), totalOrders: 0 }
              existing.totalOrders += Number(value || 0)
              byEnt.set(entId, existing)
            }
          }
          next.weekEntrepreneurStats = [...byEnt.values()]
        }

        const selectedRows = baseDashboard.weekEntrepreneurStats.map((row) => ({ id: row.id, name: row.name }))
        for (const period of Object.keys(next.adSpendByPeriod) as DashboardPeriod[]) {
          const spendByEnt = adSpendByPeriod.get(period)
          if (!spendByEnt) continue
          const stats = next.periodStats[period]
          const entRows = selectedRows.map((ent) => {
            const revenue = collectPeriodDates(stats).reduce((sum, date) => (
              sum + Number(dailyByDate.get(date)?.entrepreneurDailyRevenue?.[date]?.[ent.id] || 0)
            ), 0)
            const spend = Math.round(Number(spendByEnt[ent.id] || 0))
            return {
              id: ent.id,
              name: ent.name,
              spend,
              revenue: Math.round(revenue),
              drr: revenue > 0 ? Math.round((spend / revenue) * 1000) / 10 : null,
            }
          })
          const totalSpend = entRows.reduce((sum, row) => sum + row.spend, 0)
          next.adSpendByPeriod[period] = {
            totalSpend,
            drr: stats.revenue > 0 ? Math.round((totalSpend / stats.revenue) * 1000) / 10 : null,
            entrepreneurs: entRows,
          }
        }

        const productTotalsForDates = (periodDates: string[]) => {
          const totals = new Map<string, { name: string; currentOrders: number }>()
          for (const date of periodDates) {
            const day = dailyByDate.get(date)
            if (!day) continue
            for (const product of day.products || []) {
              const orders = Number(day.productTotals?.[product.id] || 0)
              if (!orders) continue
              const existing = totals.get(product.name) || { name: product.name, currentOrders: 0 }
              existing.currentOrders += orders
              totals.set(product.name, existing)
            }
          }
          return totals
        }

        for (const period of Object.keys(next.productDynamics) as DashboardPeriod[]) {
          const currentDates = collectPeriodDates(next.periodStats[period])
          const previousDates = collectPeriodDates(next.prevPeriodStats[period])
          if (!currentDates.every((date) => dailyByDate.has(date)) || !previousDates.every((date) => dailyByDate.has(date))) continue
          const current = productTotalsForDates(currentDates)
          const previous = productTotalsForDates(previousDates)
          const productNames = new Set([...current.keys(), ...previous.keys()])
          const rows = [...productNames].map((name) => {
            const currentOrders = current.get(name)?.currentOrders || 0
            const previousOrders = previous.get(name)?.currentOrders || 0
            const diff = currentOrders - previousOrders
            return {
              name,
              article: '',
              currentOrders,
              previousOrders,
              diff,
              diffPercent: previousOrders > 0 ? Math.round((diff / previousOrders) * 1000) / 10 : null,
            }
          }).filter((row) => row.currentOrders > 0 || row.previousOrders > 0)
          next.productDynamics[period] = {
            growth: rows.filter((row) => row.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 10),
            decline: rows.filter((row) => row.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 10),
          }
        }

        setDashboard(next)
      }

      for (const date of allDashboardDates) {
        const cached = readDailyCache(cacheScope, date)
        if (cached) dailyByDate.set(date, cached)
      }
      if (dailyByDate.size > 0) applyExactDashboard()
      const loadAdSpend = async (period: DashboardPeriod) => {
        const stats = baseDashboard.periodStats[period]
        const cached = readAdPeriodCache(cacheScope, stats.dateFrom, stats.dateTo)
        if (cached) {
          adSpendByPeriod.set(period, cached)
          applyExactDashboard()
          return
        }
        const params = new URLSearchParams()
        params.set('entrepreneurId', selection)
        params.set('from', stats.dateFrom)
        params.set('to', stats.dateTo)
        appendAngelinaParam(params, includeAngelina)
        const res = await fetch(`/api/ad-spend?${params.toString()}`)
        const json = await res.json()
        if (json.errors?.length) setRateLimitErrors((current) => [...current, ...json.errors])
        if (Array.isArray(json.entrepreneurs)) {
          const spendByEnt = Object.fromEntries(json.entrepreneurs.map((row: { id: number; spend: number }) => [row.id, Number(row.spend || 0)]))
          adSpendByPeriod.set(period, spendByEnt)
          writeAdPeriodCache(cacheScope, stats.dateFrom, stats.dateTo, spendByEnt)
          applyExactDashboard()
        }
      }
      const adSpendPromise = loadAdSpend(dashboardPeriod).catch((error) => {
        console.error('Failed to load dashboard ad spend:', error)
      })
      const buyoutPromise = (async () => {
        if (!showDashboardBuyouts) return
        const params = new URLSearchParams()
        params.set('entrepreneurId', selection)
        params.set('section', 'dashboard')
        params.set('metric', 'sales')
        appendAngelinaParam(params, includeAngelina)
        const res = await fetch(`/api/wb-data?${params.toString()}`)
        const json = await res.json()
        if (json.dashboard) setDashboardBuyouts(json.dashboard)
        if (json.rateLimitErrors?.length) setRateLimitErrors((current) => [...current, ...json.rateLimitErrors])
      })().catch((error) => {
        console.error('Failed to load dashboard buyouts:', error)
      })
      if (requiredDates.every((date) => dailyByDate.has(date))) {
        void adSpendPromise
        await buyoutPromise
        return
      }

      const requestDay = async (date: string) => {
        const dayParams = new URLSearchParams()
        dayParams.set('entrepreneurId', selection)
        dayParams.set('section', 'daily')
        dayParams.set('dateFrom', date)
        dayParams.set('dateTo', date)
        appendAngelinaParam(dayParams, includeAngelina)
        const dayRes = await fetch(`/api/wb-data?${dayParams.toString()}`)
        return { date, json: await dayRes.json() }
      }

      const uncachedDates = requiredDates.filter((date) => !dailyByDate.has(date))
      for (let offset = 0; offset < uncachedDates.length; offset += DAILY_REQUEST_BATCH_SIZE) {
        const batch = uncachedDates.slice(offset, offset + DAILY_REQUEST_BATCH_SIZE)
        const batchResults = await Promise.all(batch.map(requestDay))

        for (const { date, json: dayJson } of batchResults) {
          const dayErrors = dayJson.rateLimitErrors || []
          if (dayErrors.length) {
            setRateLimitErrors((current) => [...current, ...dayErrors])
            removeDailyCache(cacheScope, date)
            failedDates.add(date)
          }
          if (dayJson.daily && dayErrors.length === 0) {
            writeDailyResponseCache(cacheScope, selection, entrepreneurs, authUser, date, dayJson, includeAngelina, 'orders')
            dailyByDate.set(date, dayJson.daily)
            applyExactDashboard()
          }
        }
        const batchFromRedis = batchResults.every(({ json: dayJson }) => dayJson.cacheSource === 'redis')
        if (!batchFromRedis && offset + DAILY_REQUEST_BATCH_SIZE < uncachedDates.length) await sleep(DAILY_REQUEST_BATCH_PAUSE_MS)
      }

      for (const date of failedDates) {
        if (dailyByDate.has(date)) continue
        await sleep(DAILY_REQUEST_RETRY_PAUSE_MS)
        const { json: dayJson } = await requestDay(date)
        const dayErrors = dayJson.rateLimitErrors || []
        if (dayErrors.length) {
          setRateLimitErrors((current) => [...current, ...dayErrors])
          removeDailyCache(cacheScope, date)
          continue
        }
        if (dayJson.daily) {
          writeDailyResponseCache(cacheScope, selection, entrepreneurs, authUser, date, dayJson, includeAngelina, 'orders')
          dailyByDate.set(date, dayJson.daily)
          applyExactDashboard()
        }
      }
      void adSpendPromise
      await buyoutPromise
    } catch (e) {
      console.error(e)
    } finally {
      setDashboardLoading(false)
    }
  }, [selectedDashEnt, entrepreneurs, authUser, dashboardPeriod, includeAngelina, showDashboardBuyouts])

  useEffect(() => {
    if (!showDashboardBuyouts || !dashboard || dashboardBuyouts || dashboardLoading || selectedDashEnt.length === 0) return
    loadDashboardData(true)
  }, [showDashboardBuyouts, dashboard, dashboardBuyouts, dashboardLoading, selectedDashEnt.length, loadDashboardData])

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    )
  }

  if (!authUser) return <AuthScreen onAuth={handleAuth} />

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Package className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight sm:text-lg">WB Отчёты</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Ежедневная аналитика заказов и выкупов • 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dashboard?.latestDate && (
              <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex sm:text-xs">
                Данные по: {formatDateFull(dashboard.latestDate)}
              </Badge>
            )}
            {isAdmin && (
              <label className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-sm">
                <Switch checked={includeAngelina} onCheckedChange={setIncludeAngelina} />
                <span className="whitespace-nowrap font-medium">С ангелиной</span>
              </label>
            )}
            <Badge variant={isAdmin ? 'default' : 'outline'} className="shrink-0 text-[10px] sm:text-xs">
              {authUser.username}{isAdmin ? ' · админ' : ''}
            </Badge>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Разделы</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Разделы</DialogTitle>
                  <DialogDescription>
                    Выберите вкладки, которые будут показываться в вашем аккаунте.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  {OPTIONAL_TAB_IDS.filter((tabId) => isAdmin || (tabId !== 'compare' && tabId !== 'unit')).map((tabId) => (
                    <label key={tabId} className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                      <span className="text-sm font-medium">{OPTIONAL_TAB_LABELS[tabId]}</span>
                      <Switch
                        checked={tabEnabled(tabId)}
                        onCheckedChange={(checked) => updateVisibleTab(tabId, checked)}
                      />
                    </label>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <ScrollArea className="mb-5 w-full whitespace-nowrap">
          <TabsList className="h-auto w-max gap-1 p-1">
            <TabsTrigger value="dashboard" className="h-9 gap-2 px-3">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Сводка</span>
            </TabsTrigger>
            {tabEnabled('daily') && (
              <TabsTrigger value="daily" className="h-9 gap-2 px-3">
                <Table2 className="h-4 w-4" />
                <span className="hidden sm:inline">Ежедневные</span>
              </TabsTrigger>
            )}
            {tabEnabled('production') && (
              <TabsTrigger value="production" className="h-9 gap-2 px-3">
                <Thermometer className="h-4 w-4" />
                <span className="hidden sm:inline">Нагрузка</span>
              </TabsTrigger>
            )}
            {tabEnabled('supply') && (
              <TabsTrigger value="supply" className="h-9 gap-2 px-3">
                <Truck className="h-4 w-4" />
                <span className="hidden sm:inline">Поставки</span>
              </TabsTrigger>
            )}
            {tabEnabled('monthly') && (
              <TabsTrigger value="monthly" className="h-9 gap-2 px-3">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Динамика</span>
              </TabsTrigger>
            )}
            {tabEnabled('ads') && (
              <TabsTrigger value="ads" className="h-9 gap-2 px-3">
                <Megaphone className="h-4 w-4" />
                <span className="hidden sm:inline">Реклама</span>
              </TabsTrigger>
            )}
            {tabEnabled('growth') && (
              <TabsTrigger value="growth" className="h-9 gap-2 px-3">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Рост</span>
              </TabsTrigger>
            )}
            {tabEnabled('unit') && (
              <TabsTrigger value="unit" className="h-9 gap-2 px-3">
                <Calculator className="h-4 w-4" />
                <span className="hidden sm:inline">Юнитка</span>
              </TabsTrigger>
            )}
            {tabEnabled('compare') && (
              <TabsTrigger value="compare" className="h-9 gap-2 px-3">
                <GitCompare className="h-4 w-4" />
                <span className="hidden sm:inline">API vs Excel</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="apikeys" className="h-9 gap-2 px-3">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API Ключи</span>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <TabsContent value="dashboard">
            <DashboardTab
              data={dashboard}
              buyoutData={dashboardBuyouts}
              showBuyouts={showDashboardBuyouts}
              entrepreneurs={entrepreneurs}
              selectedEnt={selectedDashEnt}
              onSelectEnt={setSelectedDashEnt}
              dashboardPeriod={dashboardPeriod}
              onDashboardPeriodChange={setDashboardPeriod}
              onShowBuyoutsChange={(enabled) => {
                setShowDashboardBuyouts(enabled)
                if (!enabled) setDashboardBuyouts(null)
                setRateLimitErrors([])
              }}
              dataSource={dataSource}
              onLoad={loadDashboardData}
              loading={dashboardLoading}
              rateLimitErrors={rateLimitErrors}
            />
          </TabsContent>
          {tabEnabled('daily') && (
            <TabsContent value="daily">
              <DailyOrdersTab entrepreneurs={entrepreneurs} user={authUser} includeAngelina={includeAngelina} />
            </TabsContent>
          )}
          {tabEnabled('production') && (
            <TabsContent value="production">
              <ProductionLoadTab entrepreneurs={entrepreneurs} includeAngelina={includeAngelina} />
            </TabsContent>
          )}
          {tabEnabled('supply') && (
            <TabsContent value="supply">
              <SupplyTab entrepreneurs={entrepreneurs} includeAngelina={includeAngelina} />
            </TabsContent>
          )}
          {tabEnabled('monthly') && (
            <TabsContent value="monthly">
              <MonthlyTab entrepreneurs={entrepreneurs} includeAngelina={includeAngelina} />
            </TabsContent>
          )}
          {tabEnabled('ads') && (
            <TabsContent value="ads">
              <AdSpendTab entrepreneurs={entrepreneurs} includeAngelina={includeAngelina} />
            </TabsContent>
          )}
          {tabEnabled('growth') && (
            <TabsContent value="growth">
              <GrowthPotentialTab entrepreneurs={entrepreneurs} includeAngelina={includeAngelina} />
            </TabsContent>
          )}
          {tabEnabled('unit') && (
            <TabsContent value="unit">
              <UnitEconomicsTab />
            </TabsContent>
          )}
          {tabEnabled('compare') && (
            <TabsContent value="compare">
              <WbCompareTab entrepreneurs={entrepreneurs} />
            </TabsContent>
          )}
          <TabsContent value="apikeys">
            <ApiKeyTab entrepreneurs={entrepreneurs} onRefresh={refreshEntrepreneurs} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4">
          <p className="text-xs text-muted-foreground text-center">
            WB Отчёты — Аналитика заказов и выкупов Wildberries • 2026 • {entrepreneurs.length} ИП
          </p>
        </div>
      </footer>
    </div>
  )
}
