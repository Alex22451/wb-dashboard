'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
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
  Thermometer,
  Truck,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
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
    yesterday: { total: number; fbs: number; fbo: number; dateFrom: string; dateTo: string }
    week: { total: number; fbs: number; fbo: number; dateFrom: string; dateTo: string }
    twoWeeks: { total: number; fbs: number; fbo: number; dateFrom: string; dateTo: string }
    month: { total: number; fbs: number; fbo: number; dateFrom: string; dateTo: string }
  }
}

interface DailyOrdersData {
  dates: string[]
  products: { id: number; name: string }[]
  pivot: Record<number, Record<number, number>>
  dateTotals: number[]
  productTotals: Record<number, number>
  fbsPivot: Record<number, Record<number, number>>
  fbsDateTotals: number[]
  fbsProductTotals: Record<number, number>
  fboPivot: Record<number, Record<number, number>>
  fboDateTotals: number[]
  fboProductTotals: Record<number, number>
}

interface EntrepreneurInfo {
  id: number
  name: string
  wbApiKey: string | null
  totalOrders: number
  hasApiKey: boolean
}

interface MonthlyData {
  entrepreneurs: { id: number; name: string }[]
  products: { id: number; name: string }[]
  months: string[]
  monthlyData: Record<string, Record<number, number>>
  productMonthlyData: Record<string, Record<number, number>>
}

interface AdSpendData {
  entrepreneurs: { id: number; name: string }[]
  grouped: Record<number, { entrepreneur: string; budget: number; months: { month: number; actual: number }[] }>
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
  productItems: Record<number, number>
  productOrders: Record<number, number>
  summary: {
    yesterday: { date: string; items: number; loadPct: number; orders: number }
    week: { dateFrom: string; dateTo: string; totalItems: number; avgLoadPct: number; days: number }
    month: { dateFrom: string; dateTo: string; totalItems: number; avgLoadPct: number; days: number }
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
  articles: Array<{
    article: string
    subject: string
    brand: string
    totalOrders: number
    fbsOrders: number
    fboOrders: number
    avgDaily: number
    fboStock: number
    supplyQty: number
  }>
}

const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU')
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
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Превышен лимит запросов</AlertTitle>
      <AlertDescription>
        Не удалось загрузить данные для: {errors.map(e => e.name).join(', ')}. Попробуйте через минуту или выберите одно ИП.
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

// --- Dashboard Tab ---
function DashboardTab({ data, entrepreneurs, selectedEnt, onSelectEnt, dataSource, onLoad, loading, rateLimitErrors }: {
  data: DashboardData | null
  entrepreneurs: EntrepreneurInfo[]
  selectedEnt: string
  onSelectEnt: (id: string) => void
  dataSource?: 'excel' | 'wbapi'
  onLoad: () => void
  loading: boolean
  rateLimitErrors: RateLimitError[]
}) {
  const dayChange = data?.dayChange
  const monthChange = data?.monthChange
  const [dashboardPeriod, setDashboardPeriod] = useState<'yesterday' | 'week' | 'twoWeeks' | 'month'>('yesterday')
  const [fboViewMode, setFboViewMode] = useState<'cards' | 'chart'>('cards')

  // Chart dates filtered by selected period
  const chartFilteredDates = data ? data.chartDates
    .filter(d => d >= data.periodStats[dashboardPeriod].dateFrom && d <= data.periodStats[dashboardPeriod].dateTo)
    : []

  // Determine label step to avoid overlap (show every Nth label)
  const labelStep = dashboardPeriod === 'yesterday' ? 1
    : dashboardPeriod === 'week' ? 1
    : dashboardPeriod === 'twoWeeks' ? 2
    : 3 // month: every 3rd label

  return (
    <div className="space-y-6">
      {/* Rate limit errors */}
      <RateLimitAlert errors={rateLimitErrors} />

      {/* ИП Selector + Load Button + Data Source + Period Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Показать:</span>
        <Select value={selectedEnt} onValueChange={onSelectEnt}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Выберите ИП" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ИП (сводный)</SelectItem>
            {entrepreneurs.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onLoad} disabled={loading || !selectedEnt} className="gap-2">
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
            {dataSource === 'wbapi' ? '🔴 WB API (реальное время)' : '📊 Excel (кэш)'}
          </Badge>
        )}
      </div>

      {/* Period selector at the top */}
      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Период:</span>
          <ToggleGroup type="single" value={dashboardPeriod} onValueChange={(v) => { if (v) setDashboardPeriod(v as 'yesterday' | 'week' | 'twoWeeks' | 'month') }} className="border rounded-md">
            <ToggleGroupItem value="yesterday" className="text-xs px-3">Вчера</ToggleGroupItem>
            <ToggleGroupItem value="week" className="text-xs px-3">Неделя</ToggleGroupItem>
            <ToggleGroupItem value="twoWeeks" className="text-xs px-3">2 недели</ToggleGroupItem>
            <ToggleGroupItem value="month" className="text-xs px-3">Месяц</ToggleGroupItem>
          </ToggleGroup>
          {data.periodStats && (
            <span className="text-xs text-muted-foreground">
              {formatDateShort(data.periodStats[dashboardPeriod].dateFrom)} — {formatDateShort(data.periodStats[dashboardPeriod].dateTo)}
            </span>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <DashboardSkeleton />}

      {/* Empty state when no data and not loading */}
      {!loading && !data && (
        <EmptyState
          message={selectedEnt ? 'Нажмите "Загрузить" для получения данных' : 'Выберите ИП и нажмите "Загрузить"'}
          icon={<LayoutDashboard className="h-12 w-12" />}
        />
      )}

      {/* Data display */}
      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Вчера</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.yesterdayOrders)}</div>
                {data.yesterdayDate && (
                  <p className="text-xs text-muted-foreground mt-1">{formatDateFull(data.yesterdayDate)}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">К позавчера</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {dayChange !== null ? (
                    <span className={Number(dayChange) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {Number(dayChange) >= 0 ? '+' : ''}{dayChange}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">было: {formatNumber(data.dayBeforeYesterdayOrders)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">За текущий месяц</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.monthOrders)}</div>
                <p className="text-xs text-muted-foreground mt-1">заказов</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">К предыдущему месяцу</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monthChange !== null ? (
                    <span className={Number(monthChange) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {Number(monthChange) >= 0 ? '+' : ''}{monthChange}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">было: {formatNumber(data.prevMonthOrders)}</p>
              </CardContent>
            </Card>
          </div>

          {/* FBS / FBO breakdown — chart/table toggle only, period is selected at top */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">Заказы FBS / FBO</CardTitle>
                <ToggleGroup type="single" value={fboViewMode} onValueChange={(v) => { if (v) setFboViewMode(v as 'cards' | 'chart') }} className="border rounded-md">
                  <ToggleGroupItem value="cards" className="text-xs px-3">Карточки</ToggleGroupItem>
                  <ToggleGroupItem value="chart" className="text-xs px-3">График</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </CardHeader>
            <CardContent>
              {fboViewMode === 'cards' ? (
                /* Card view */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="border-border">
                    <CardContent className="pt-4 pb-4">
                      <div className="text-xs text-muted-foreground mb-1">Всего заказов</div>
                      <div className="text-2xl font-bold">{formatNumber(data.periodStats[dashboardPeriod].total)}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 dark:border-amber-800">
                    <CardContent className="pt-4 pb-4">
                      <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">FBS (склад продавца)</div>
                      <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{formatNumber(data.periodStats[dashboardPeriod].fbs)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {data.periodStats[dashboardPeriod].total > 0
                                          ? (data.periodStats[dashboardPeriod].fbs / data.periodStats[dashboardPeriod].total * 100).toFixed(1)
                                          : 0}% от общего
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-sky-200 dark:border-sky-800">
                    <CardContent className="pt-4 pb-4">
                      <div className="text-xs text-sky-700 dark:text-sky-400 mb-1">FBO (склад WB)</div>
                      <div className="text-2xl font-bold text-sky-700 dark:text-sky-400">{formatNumber(data.periodStats[dashboardPeriod].fbo)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {data.periodStats[dashboardPeriod].total > 0
                                          ? (data.periodStats[dashboardPeriod].fbo / data.periodStats[dashboardPeriod].total * 100).toFixed(1)
                                          : 0}% от общего
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* Chart view — stacked bar chart FBS vs FBO */
                chartFilteredDates.length > 0 ? (
                  <div className="space-y-2">
                    {/* Chart legend */}
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-500" /> FBS</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-sky-500" /> FBO</span>
                    </div>
                    {/* Chart */}
                    <div className="overflow-x-auto">
                      <div className="flex items-end gap-1" style={{ height: '200px', minWidth: `${Math.max(chartFilteredDates.length * 28, 200)}px` }}>
                        {chartFilteredDates
                          .map((date, idx) => {
                            const fbs = data.chartFbs[date] || 0
                            const fbo = data.chartFbo[date] || 0
                            const total = fbs + fbo
                            const maxTotal = Math.max(...chartFilteredDates.map(d => (data.chartFbs[d] || 0) + (data.chartFbo[d] || 0)), 1)
                            const heightPct = (total / maxTotal) * 100
                            const fbsPct = total > 0 ? (fbs / total) * 100 : 0
                            const fboPct = total > 0 ? (fbo / total) * 100 : 0
                            const showLabel = idx % labelStep === 0
                            return (
                              <div key={date} className="flex-1 flex flex-col items-center group relative" style={{ height: `${heightPct}%` }}>
                                {/* Tooltip */}
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-2 py-1 text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                                  <div className="font-medium">{formatDateShort(date)}</div>
                                  <div className="text-amber-600">FBS: {fbs}</div>
                                  <div className="text-sky-600">FBO: {fbo}</div>
                                </div>
                                {/* Stacked bar */}
                                <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                                  <div className="bg-sky-500 rounded-t-none" style={{ height: `${fboPct}%` }} />
                                  <div className="bg-amber-500 rounded-t-sm" style={{ height: `${fbsPct}%` }} />
                                </div>
                                {/* Date label — show only every Nth to avoid overlap */}
                                {showLabel && (
                                  <div className="text-[9px] text-muted-foreground mt-1 whitespace-nowrap">
                                    {date.slice(5)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>
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
                Заказы по ИП за неделю
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
        </>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
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

// --- Data Table Component (shared) ---
function DataTable({ data, fulfillmentFilter = 'all' }: { data: DailyOrdersData; fulfillmentFilter?: 'all' | 'fbs' | 'fbo' }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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

  const { dates, products } = data
  const grandTotal = activeProductTotals ? Object.values(activeProductTotals).reduce((s, v) => s + v, 0) : 0

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
    }).sort((a, b) => b.total - a.total)

    return result
  })()

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

  if (dates.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Нет данных за выбранный период
      </div>
    )
  }

  const filterLabel = fulfillmentFilter === 'fbs' ? ' (FBS)' : fulfillmentFilter === 'fbo' ? ' (FBO)' : ''

  return (
    <div className="border rounded-lg overflow-hidden">
      <ScrollArea className="w-full max-h-[600px]">
        <table className="text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium min-w-[200px] sticky left-0 bg-muted/50 z-10">Продукт{filterLabel}</th>
              <th className="text-right px-3 py-2 font-medium min-w-[80px] bg-muted/50">Итого</th>
              {dates.map((d) => (
                <th key={d} className="text-right px-3 py-2 font-medium min-w-[60px] whitespace-nowrap" title={formatDateFull(d)}>
                  {formatDateShort(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-50 dark:bg-emerald-950/20 border-b font-semibold">
              <td className="px-3 py-2 sticky left-0 bg-emerald-50 dark:bg-emerald-950/20 z-10">ИТОГО{filterLabel}</td>
              <td className="text-right px-3 py-2 font-bold bg-emerald-50 dark:bg-emerald-950/20">{formatNumber(grandTotal)}</td>
              {dates.map((d, i) => (
                <td key={d} className="text-right px-3 py-2">{formatNumber(activeDateTotals[i] || 0)}</td>
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
                  <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-background z-10">{p.name}</td>
                    <td className="text-right px-3 py-2 font-medium">{formatNumber(total)}</td>
                    {dates.map((d, i) => {
                      const val = productPivot[i]
                      return (
                        <td key={d} className={`text-right px-3 py-2 ${val ? '' : 'text-muted-foreground'}`}>
                          {val || '—'}
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
                    className="border-b hover:bg-muted/30 transition-colors cursor-pointer select-none"
                    onClick={() => toggleGroup(group.baseName)}
                  >
                    <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span>{group.baseName}</span>
                        <span className="text-xs text-muted-foreground">({group.children.length})</span>
                      </div>
                    </td>
                    <td className="text-right px-3 py-2 font-semibold">{formatNumber(group.total)}</td>
                    {dates.map((d, i) => (
                      <td key={d} className="text-right px-3 py-2 font-medium">
                        {groupDateTotals[i] || '—'}
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
                        <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors bg-muted/10">
                          <td className="px-3 py-2 sticky left-0 bg-muted/10 z-10 pl-8">
                            <span className="text-muted-foreground">{sizePart}</span>
                          </td>
                          <td className="text-right px-3 py-2">{formatNumber(total)}</td>
                          {dates.map((d, i) => {
                            const val = productPivot[i]
                            return (
                              <td key={d} className={`text-right px-3 py-2 ${val ? '' : 'text-muted-foreground'}`}>
                                {val || '—'}
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
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

// --- Daily Orders Tab ---
function DailyOrdersTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [fetchedData, setFetchedData] = useState<DailyOrdersData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string>('all')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'all' | 'fbs' | 'fbo'>('all')
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

  const fetchData = useCallback(async () => {
    setLoading(true)
    setRateLimitErrors([])
    try {
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectedEnt)
      params.set('section', 'daily')
      if (dateMode === 'single' && singleDate) {
        params.set('dateFrom', singleDate)
        params.set('dateTo', singleDate)
      } else if (dateMode === 'range') {
        if (dateFrom) params.set('dateFrom', dateFrom)
        if (dateTo) params.set('dateTo', dateTo)
      }
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      if (json.daily) setFetchedData(json.daily)
      if (json.rateLimitErrors) setRateLimitErrors(json.rateLimitErrors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, dateMode, singleDate, dateFrom, dateTo])

  // NO auto-fetch on mount — only fetch when user clicks "Показать"

  return (
    <div className="space-y-4">
      {/* Rate limit errors */}
      <RateLimitAlert errors={rateLimitErrors} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEnt} onValueChange={setSelectedEnt}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Все ИП" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ИП (сводный)</SelectItem>
            {entrepreneurs.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup type="single" value={dateMode} onValueChange={(v) => { if (v) setDateMode(v as 'single' | 'range') }} className="border rounded-md">
          <ToggleGroupItem value="single" className="text-xs px-3">Один день</ToggleGroupItem>
          <ToggleGroupItem value="range" className="text-xs px-3">Диапазон</ToggleGroupItem>
        </ToggleGroup>

        {dateMode === 'single' ? (
          <Input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="w-40" min="2026-01-01" max="2026-12-31" />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" min="2026-01-01" max="2026-12-31" />
            <span className="text-sm text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" min="2026-01-01" max="2026-12-31" />
            {/* Quick period buttons */}
            <ToggleGroup type="single" onValueChange={(v) => {
              if (!v) return
              const mskOffset = 3 * 60 * 60 * 1000
              const nowMsk = new Date(Date.now() + mskOffset)
              const yesterday = new Date(nowMsk.getTime() - 86400000).toISOString().split('T')[0]
              const days = v === 'week' ? 7 : v === 'twoWeeks' ? 14 : 30
              const from = new Date(nowMsk.getTime() - days * 86400000).toISOString().split('T')[0]
              setDateFrom(from)
              setDateTo(yesterday)
            }} className="border rounded-md">
              <ToggleGroupItem value="week" className="text-xs px-2">Неделя</ToggleGroupItem>
              <ToggleGroupItem value="twoWeeks" className="text-xs px-2">2 недели</ToggleGroupItem>
              <ToggleGroupItem value="month" className="text-xs px-2">Месяц</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        <Button onClick={fetchData} disabled={loading} className="gap-2">
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
          <ToggleGroup type="single" value={fulfillmentFilter} onValueChange={(v) => { if (v) setFulfillmentFilter(v as 'all' | 'fbs' | 'fbo') }} className="border rounded-md">
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
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-muted-foreground mb-1">Всего заказов</div>
                  <div className="text-xl font-bold">{formatNumber(Object.values(fetchedData.productTotals).reduce((s, v) => s + v, 0))}</div>
                </CardContent>
              </Card>
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">FBS (склад продавца)</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatNumber(Object.values(fetchedData.fbsProductTotals).reduce((s, v) => s + v, 0))}</div>
                </CardContent>
              </Card>
              <Card className="border-sky-200 dark:border-sky-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-sky-700 dark:text-sky-400 mb-1">FBO (склад WB)</div>
                  <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{formatNumber(Object.values(fetchedData.fboProductTotals).reduce((s, v) => s + v, 0))}</div>
                </CardContent>
              </Card>
            </div>
          )}
          <DataTable data={fetchedData} fulfillmentFilter={fulfillmentFilter} />
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
function MonthlyTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [fetchedData, setFetchedData] = useState<MonthlyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'entrepreneurs' | 'products'>('entrepreneurs')
  const [selectedEnt, setSelectedEnt] = useState<string>('all')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])

  // Use fetchedData
  const data = fetchedData

  // Compute sorted entrepreneur table data when data is available
  const entTableData = data ? data.entrepreneurs.map((e) => {
    const row: Record<string, number> = {}
    data.months.forEach((m) => { row[m] = data.monthlyData[m]?.[e.id] || 0 })
    const total = data.months.reduce((s, m) => s + (data.monthlyData[m]?.[e.id] || 0), 0)
    return { ...e, data: row, total }
  }).sort((a, b) => b.total - a.total) : []

  const fetchData = useCallback(async () => {
    setLoading(true)
    setRateLimitErrors([])
    try {
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectedEnt)
      params.set('section', 'monthly')
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      if (json.monthly) setFetchedData(json.monthly)
      if (json.rateLimitErrors) setRateLimitErrors(json.rateLimitErrors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt])

  // NO auto-fetch on mount — only fetch when user clicks "Загрузить"

  return (
    <div className="space-y-6">
      {/* Rate limit errors */}
      <RateLimitAlert errors={rateLimitErrors} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEnt} onValueChange={setSelectedEnt}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Все ИП" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ИП (сводный)</SelectItem>
            {entrepreneurs.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={view} onValueChange={(v) => setView(v as 'entrepreneurs' | 'products')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="entrepreneurs">По ИП</SelectItem>
            <SelectItem value="products">По продуктам (Топ-10)</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={fetchData} disabled={loading} className="gap-2">
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
          message="Выберите ИП и нажмите «Загрузить»"
          icon={<Calendar className="h-12 w-12" />}
        />
      )}

      {!loading && data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {view === 'entrepreneurs' ? 'Заказы по ИП по месяцам' : 'Топ-10 продуктов по месяцам'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthsChartData(data, view)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => formatNumber(value)} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {(view === 'entrepreneurs' ? data.entrepreneurs : data.products.slice(0, 10)).map((item, i) => (
                      <Bar key={item.id} dataKey={item.name.length > 20 ? item.name.slice(0, 20) + '…' : item.name} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {view === 'entrepreneurs' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">Помесячная сводка по ИП <Badge variant="secondary" className="text-xs">WB API</Badge></CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <table className="text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50 z-10">ИП</th>
                        {data.months.map((m) => {
                          const [y, mo] = m.split('-')
                          return <th key={m} className="text-right px-3 py-2 font-medium min-w-[80px]">{MONTH_SHORT[Number(mo) - 1]} {y.slice(2)}</th>
                        })}
                        <th className="text-right px-3 py-2 font-medium min-w-[80px] bg-muted/50">Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const entTableData = data.entrepreneurs.map((e) => {
                          const row: Record<string, number> = {}
                          data.months.forEach((m) => { row[m] = data.monthlyData[m]?.[e.id] || 0 })
                          const total = data.months.reduce((s, m) => s + (data.monthlyData[m]?.[e.id] || 0), 0)
                          return { ...e, data: row, total }
                        }).sort((a, b) => b.total - a.total)
                        return entTableData.map((e) => (
                          <tr key={e.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">{e.name}</td>
                            {data.months.map((m) => (<td key={m} className="text-right px-3 py-2">{formatNumber(e.data[m])}</td>))}
                            <td className="text-right px-3 py-2 font-semibold bg-muted/30">{formatNumber(e.total)}</td>
                          </tr>
                        ))
                      })()}
                      <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-semibold">
                        <td className="px-3 py-2 sticky left-0 bg-emerald-50 dark:bg-emerald-950/20 z-10">ИТОГО</td>
                        {data.months.map((m) => {
                          const total = data.entrepreneurs.reduce((s, e) => s + (data.monthlyData[m]?.[e.id] || 0), 0)
                          return <td key={m} className="text-right px-3 py-2">{formatNumber(total)}</td>
                        })}
                        <td className="text-right px-3 py-2 font-bold bg-emerald-50 dark:bg-emerald-950/20">
                          {formatNumber(data.entrepreneurs.reduce((s, e) => s + data.months.reduce((ss, m) => ss + (data.monthlyData[m]?.[e.id] || 0), 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b', '#ec4899', '#14b8a6', '#a855f7']

function monthsChartData(data: MonthlyData, view: 'entrepreneurs' | 'products') {
  return data.months.map((m) => {
    const entry: Record<string, any> = { month: m }
    if (view === 'entrepreneurs') {
      data.entrepreneurs.forEach((e) => {
        entry[e.name] = data.monthlyData[m]?.[e.id] || 0
      })
    } else {
      const productTotals = data.products.map((p) => ({
        ...p,
        total: Object.values(data.productMonthlyData).reduce((s, monthData) => s + (monthData[p.id] || 0), 0),
      })).sort((a, b) => b.total - a.total).slice(0, 10)
      productTotals.forEach((p) => {
        entry[p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name] = data.productMonthlyData[m]?.[p.id] || 0
      })
    }
    return entry
  })
}

// --- Production Load Tab ---
function ProductionLoadTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [fetchedData, setFetchedData] = useState<ProductionLoadData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string>('all')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // Always fetch 31 days of data — viewMode only affects display, not API calls
  const fetchData = useCallback(async (entId?: string) => {
    setLoading(true)
    setRateLimitErrors([])
    try {
      const mskOffset = 3 * 60 * 60 * 1000
      const nowMsk = new Date(Date.now() + mskOffset)
      const yesterday = new Date(nowMsk.getTime() - 86400000).toISOString().split('T')[0]
      const from = new Date(nowMsk.getTime() - 31 * 86400000).toISOString().split('T')[0]

      const params = new URLSearchParams()
      params.set('entrepreneurId', entId || selectedEnt)
      params.set('section', 'production')
      params.set('dateFrom', from)
      params.set('dateTo', yesterday)
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      if (json.production) setFetchedData(json.production)
      if (json.rateLimitErrors) setRateLimitErrors(json.rateLimitErrors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt])

  // Auto-load on first mount with "Все ИП"
  useEffect(() => {
    if (!initialLoadDone) {
      setInitialLoadDone(true)
      fetchData('all')
    }
  }, [initialLoadDone, fetchData])

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
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEnt} onValueChange={(v) => { setSelectedEnt(v); fetchData(v) }}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Все ИП" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ИП (сводный)</SelectItem>
            {entrepreneurs.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => fetchData()} disabled={loading} className="gap-2">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Загрузка...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Обновить
            </>
          )}
        </Button>
      </div>

      {loading && !fetchedData && <Skeleton className="h-96 w-full" />}

      {!loading && !fetchedData && (
        <EmptyState
          message="Загрузка данных о нагрузке..."
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                <span>Максимальная производительность: <strong className="text-foreground">{formatNumber(fetchedData.capacity)}</strong> изделий/день (FBS)</span>
              </div>
            </CardContent>
          </Card>

          {/* Thermometer Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ThermometerGauge
              pct={fetchedData.summary.yesterday.loadPct}
              label="Вчера"
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
                <div className="overflow-x-auto">
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
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product breakdown - top products by items */}
          {fetchedData.products.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Разбивка по продуктам (Топ-15)
                  <Badge variant="secondary" className="text-xs">FBS изделия</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
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
                      {fetchedData.products
                        .slice()
                        .sort((a, b) => (fetchedData.productItems[b.id] || 0) - (fetchedData.productItems[a.id] || 0))
                        .slice(0, 15)
                        .map((p) => {
                          const items = fetchedData.productItems[p.id] || 0
                          const orders = fetchedData.productOrders[p.id] || 0
                          const totalItems = Object.values(fetchedData.productItems).reduce((s, v) => s + v, 0)
                          const share = totalItems > 0 ? (items / totalItems * 100).toFixed(1) : '0'
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
                        <td className="text-right px-3 py-2 font-bold">{formatNumber(Object.values(fetchedData.productItems).reduce((s, v) => s + v, 0))}</td>
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
function SupplyTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [fetchedData, setFetchedData] = useState<SupplyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string>('all')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [supplyDays, setSupplyDays] = useState<number>(14)
  const [coefficient, setCoefficient] = useState<number>(1)
  const [sortBy, setSortBy] = useState<'supplyQty' | 'avgDaily' | 'article'>('supplyQty')
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
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectedEnt)
      params.set('section', 'supply')
      params.set('dateFrom', dateFrom)
      params.set('dateTo', dateTo)
      params.set('supplyDays', String(supplyDays))
      params.set('coefficient', String(coefficient))
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      if (json.supply) setFetchedData(json.supply)
      if (json.rateLimitErrors) setRateLimitErrors(json.rateLimitErrors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, dateFrom, dateTo, supplyDays, coefficient])

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
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1">ИП</Label>
          <Select value={selectedEnt} onValueChange={setSelectedEnt}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Все ИП" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ИП (сводный)</SelectItem>
              {entrepreneurs.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1">Период анализа (от)</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1">Период анализа (до)</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>

        <Button onClick={fetchData} disabled={loading} className="gap-2">
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
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Загрузить склад на:</span>
          <ToggleGroup type="single" value={String(supplyDays)} onValueChange={(v) => { if (v) setSupplyDays(Number(v)) }} className="border rounded-md">
            {supplyPeriods.map((p) => (
              <ToggleGroupItem key={p.value} value={String(p.value)} className="text-xs px-3">{p.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Коэффициент:</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={1.5}
              step={0.05}
              value={coefficient}
              onChange={(e) => setCoefficient(Number(e.target.value))}
              className="w-32 h-2 accent-amber-500 cursor-pointer"
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
            <ToggleGroup type="single" value={sortBy} onValueChange={(v) => { if (v) setSortBy(v as 'supplyQty' | 'avgDaily' | 'article') }} className="border rounded-md">
              <ToggleGroupItem value="supplyQty" className="text-xs px-3">К поставке</ToggleGroupItem>
              <ToggleGroupItem value="avgDaily" className="text-xs px-3">Среднее/день</ToggleGroupItem>
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

// --- Ad Spend Tab ---
function AdSpendTab() {
  const [data, setData] = useState<AdSpendData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ad-spend').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <Skeleton className="h-96 w-full" />

  const { grouped } = data
  const entries = Object.values(grouped)
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const entry: Record<string, any> = { month: MONTH_SHORT[i] }
    entries.forEach((e) => { const monthData = e.months.find((m) => m.month === i + 1); entry[e.entrepreneur] = monthData?.actual || 0 })
    return entry
  })
  const colors = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b']

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Расходы на рекламу по месяцам (2026)</CardTitle></CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Нет данных о расходах на рекламу за 2026 год</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} />
                  <Tooltip formatter={(value: number) => `${formatNumber(value)} ₽`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {entries.map((e, i) => (<Bar key={e.entrepreneur} dataKey={e.entrepreneur} fill={colors[i % colors.length]} radius={[2, 2, 0, 0]} />))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      {entries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Расходы на рекламу — детализация (2026)</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <table className="text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50 z-10">ИП</th>
                    <th className="text-right px-3 py-2 font-medium min-w-[90px] bg-muted/50">Бюджет/мес</th>
                    {MONTH_SHORT.map((m) => (<th key={m} className="text-right px-3 py-2 font-medium min-w-[80px]">{m}</th>))}
                    <th className="text-right px-3 py-2 font-medium min-w-[90px] bg-muted/50">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, idx) => {
                    const total = e.months.reduce((s, m) => s + m.actual, 0)
                    return (
                      <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">{e.entrepreneur}</td>
                        <td className="text-right px-3 py-2 text-muted-foreground">{formatNumber(e.budget)}</td>
                        {Array.from({ length: 12 }, (_, i) => { const monthData = e.months.find((m) => m.month === i + 1); return (<td key={i} className={`text-right px-3 py-2 ${monthData ? '' : 'text-muted-foreground'}`}>{monthData ? formatNumber(monthData.actual) : '—'}</td>); })}
                        <td className="text-right px-3 py-2 font-semibold bg-muted/30">{formatNumber(total)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-emerald-50 dark:bg-emerald-950/20 z-10">ИТОГО</td>
                    <td className="text-right px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20">{formatNumber(entries.reduce((s, e) => s + e.budget, 0))}</td>
                    {Array.from({ length: 12 }, (_, i) => { const monthTotal = entries.reduce((s, e) => { const md = e.months.find((m) => m.month === i + 1); return s + (md?.actual || 0) }, 0); return (<td key={i} className="text-right px-3 py-2">{monthTotal ? formatNumber(monthTotal) : '—'}</td>); })}
                    <td className="text-right px-3 py-2 font-bold bg-emerald-50 dark:bg-emerald-950/20">{formatNumber(entries.reduce((s, e) => s + e.months.reduce((ss, m) => ss + m.actual, 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- WB Compare Tab ---
function WbCompareTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string>('5') // Масляков А.А. by default
  const [dateFrom, setDateFrom] = useState<string>('2026-04-01')
  const [dateTo, setDateTo] = useState<string>('2026-04-29')
  const apiEntrepreneurs = entrepreneurs.filter((e) => e.hasApiKey)

  const fetchData = useCallback(async () => {
    if (!selectedEnt) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        entrepreneurId: selectedEnt,
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      })
      const res = await fetch(`/api/wb-compare?${params.toString()}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, dateFrom, dateTo])

  const selectedEntrepreneur = entrepreneurs.find((e) => String(e.id) === selectedEnt)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEnt} onValueChange={setSelectedEnt}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Выберите ИП" />
          </SelectTrigger>
          <SelectContent>
            {apiEntrepreneurs.length > 0 ? (
              apiEntrepreneurs.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name} 🔑</SelectItem>
              ))
            ) : (
              <SelectItem value="none" disabled>Нет ИП с API ключом</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" min="2026-01-01" max="2026-12-31" />
        <span className="text-sm text-muted-foreground">—</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" min="2026-01-01" max="2026-12-31" />

        <Button onClick={fetchData} disabled={loading || !selectedEnt || selectedEnt === 'none'}>
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
                Источник WB: {data.dataSource === 'sales' ? 'Продажи (Sales API)' : 'Заказы (Orders API)'}
              </span>
              <span>— Продажи точнее отражают реальные данные</span>
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
                  Сравнение по товарам: {selectedEntrepreneur?.name} — Excel vs WB API
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
  const [dialogSaving, setDialogSaving] = useState(false)

  const handleSave = async (entId: number, apiKey: string) => {
    if (!apiKey.trim()) return
    setDialogSaving(true)
    try {
      const res = await fetch('/api/save-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entrepreneurId: entId, apiKey: apiKey.trim() }),
      })
      if (res.ok) {
        onRefresh()
        setDialogOpen(false)
        setDialogKey('')
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
                <Label>API Ключ</Label>
                <Input
                  type="text"
                  placeholder="Вставьте API ключ..."
                  value={dialogKey}
                  onChange={(e) => setDialogKey(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
              <Button
                onClick={() => handleSave(Number(dialogEntId), dialogKey)}
                disabled={!dialogEntId || !dialogKey.trim() || dialogSaving}
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

// --- Main Page ---
export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurInfo[]>([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedDashEnt, setSelectedDashEnt] = useState<string>('') // Empty = no auto-fetch
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'excel' | 'wbapi'>('excel')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])

  // Fetch entrepreneurs list on mount (local DB only, no WB API)
  useEffect(() => {
    fetch('/api/entrepreneurs').then((r) => r.json()).then(setEntrepreneurs).catch(console.error)
  }, [])

  const refreshEntrepreneurs = useCallback(() => {
    fetch('/api/entrepreneurs').then((r) => r.json()).then(setEntrepreneurs).catch(console.error)
  }, [])

  // Explicit dashboard data load — only triggered by user clicking "Загрузить"
  const loadDashboardData = useCallback(async () => {
    if (!selectedDashEnt) return
    setDashboardLoading(true)
    setRateLimitErrors([])
    try {
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectedDashEnt)
      params.set('section', 'dashboard')
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      if (json.dashboard) {
        setDashboard(json.dashboard)
        setDataSource('wbapi')
      }
      if (json.rateLimitErrors) setRateLimitErrors(json.rateLimitErrors)
    } catch (e) {
      console.error(e)
    } finally {
      setDashboardLoading(false)
    }
  }, [selectedDashEnt])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Package className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">WB Отчёты</h1>
              <p className="text-xs text-muted-foreground">Ежедневная аналитика заказов • 2026</p>
            </div>
          </div>
          {dashboard?.latestDate && (
            <Badge variant="outline" className="text-xs">
              Данные по: {formatDateFull(dashboard.latestDate)}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-6 pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Сводка</span>
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-2">
              <Table2 className="h-4 w-4" />
              <span className="hidden sm:inline">Ежедневные</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-2">
              <Thermometer className="h-4 w-4" />
              <span className="hidden sm:inline">Нагрузка</span>
            </TabsTrigger>
            <TabsTrigger value="supply" className="gap-2">
              <Truck className="h-4 w-4" />
              <span className="hidden sm:inline">Поставки</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">По месяцам</span>
            </TabsTrigger>
            <TabsTrigger value="ads" className="gap-2">
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Реклама</span>
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <GitCompare className="h-4 w-4" />
              <span className="hidden sm:inline">API vs Excel</span>
            </TabsTrigger>
            <TabsTrigger value="apikeys" className="gap-2">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API Ключи</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab
              data={dashboard}
              entrepreneurs={entrepreneurs}
              selectedEnt={selectedDashEnt}
              onSelectEnt={setSelectedDashEnt}
              dataSource={dataSource}
              onLoad={loadDashboardData}
              loading={dashboardLoading}
              rateLimitErrors={rateLimitErrors}
            />
          </TabsContent>
          <TabsContent value="daily">
            <DailyOrdersTab entrepreneurs={entrepreneurs} />
          </TabsContent>
          <TabsContent value="production">
            <ProductionLoadTab entrepreneurs={entrepreneurs} />
          </TabsContent>
          <TabsContent value="supply">
            <SupplyTab entrepreneurs={entrepreneurs} />
          </TabsContent>
          <TabsContent value="monthly">
            <MonthlyTab entrepreneurs={entrepreneurs} />
          </TabsContent>
          <TabsContent value="ads">
            <AdSpendTab />
          </TabsContent>
          <TabsContent value="compare">
            <WbCompareTab entrepreneurs={entrepreneurs} />
          </TabsContent>
          <TabsContent value="apikeys">
            <ApiKeyTab entrepreneurs={entrepreneurs} onRefresh={refreshEntrepreneurs} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4">
          <p className="text-xs text-muted-foreground text-center">
            WB Отчёты — Аналитика заказов Wildberries • 2026 • {entrepreneurs.length} ИП
          </p>
        </div>
      </footer>
    </div>
  )
}
