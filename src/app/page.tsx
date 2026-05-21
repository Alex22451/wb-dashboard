'use client'

import { useState, useEffect, useCallback, Fragment, useMemo } from 'react'
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
  MapPin,
  LogOut,
  User,
  Lock,
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
  previousDateTotals?: number[]
  productTotals: Record<number, number>
  entrepreneurDailyData: Record<string, Record<number, number>>
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

interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user'
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
  source?: string
  entrepreneurs: { id: number; name: string }[]
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
function DashboardTab({ data, entrepreneurs, selectedEnt, onSelectEnt, dataSource, onLoad, loading, rateLimitErrors }: {
  data: DashboardData | null
  entrepreneurs: EntrepreneurInfo[]
  selectedEnt: string[]
  onSelectEnt: (ids: string[]) => void
  dataSource?: 'excel' | 'wbapi'
  onLoad: () => void
  loading: boolean
  rateLimitErrors: RateLimitError[]
}) {
  const [dashboardPeriod, setDashboardPeriod] = useState<'yesterday' | 'week' | 'twoWeeks' | 'month'>('yesterday')
  const [showChart, setShowChart] = useState(false)

  // Period change is purely client-side — periodStats for all periods are already in data
  const handlePeriodChange = (v: string) => {
    if (v) setDashboardPeriod(v as 'yesterday' | 'week' | 'twoWeeks' | 'month')
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
        <Button onClick={onLoad} disabled={loading || selectedEnt.length === 0} className="w-full gap-2 sm:w-auto">
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
              <CardTitle className="text-base">Динамика заказов: {periodLabel[dashboardPeriod]} vs {prevPeriodLabel[dashboardPeriod]}</CardTitle>
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
                  <CardTitle className="text-base">Заказы FBS / FBO</CardTitle>
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
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 dark:border-amber-800">
                    <CardContent className="pt-3 pb-3">
                      <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">FBS</div>
                      <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatNumber(data.periodStats[dashboardPeriod].fbs)}</div>
                      <div className="text-xs text-muted-foreground">
                        {data.periodStats[dashboardPeriod].total > 0 ? (data.periodStats[dashboardPeriod].fbs / data.periodStats[dashboardPeriod].total * 100).toFixed(1) : 0}%
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-sky-200 dark:border-sky-800">
                    <CardContent className="pt-3 pb-3">
                      <div className="text-xs text-sky-700 dark:text-sky-400 mb-1">FBO</div>
                      <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{formatNumber(data.periodStats[dashboardPeriod].fbo)}</div>
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

// --- Data Table Component (shared) ---
function DataTable({ data, fulfillmentFilter = 'all' }: { data: DailyOrdersData; fulfillmentFilter?: 'all' | 'fbs' | 'fbo' }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [sortDateIdx, setSortDateIdx] = useState<number | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)

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
  const selectedChartData = selectedProduct ? dates.map((date, index) => ({
    date: formatDateShort(date),
    orders: activePivot[selectedProduct.id]?.[index] || 0,
    previous: previousPivot[selectedProduct.id]?.[index] || 0,
  })) : []

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
    <div className="space-y-3">
      {selectedProduct && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Динамика: {selectedProduct.name}</CardTitle>
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
            <div key={group.baseName} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium">{group.baseName}</div>
                  <div className="text-xs text-muted-foreground">{group.children.length > 1 ? `${group.children.length} вариантов` : filterLabel.trim()}</div>
                </div>
                <div className="text-right text-lg font-bold">{formatNumber(group.total)}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {dates.map((date, index) => (
                  <div key={date} className="rounded-md border px-2 py-1.5" style={heatStyle(groupDateTotals[index])}>
                    <div className="text-[10px] text-muted-foreground">{formatDateShort(date)}</div>
                    <div className="text-sm font-semibold">{groupDateTotals[index] || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border bg-card sm:block">
      <ScrollArea className="w-full max-h-[600px]">
        <table className="min-w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="sticky left-0 z-10 min-w-[170px] bg-muted/50 px-2 py-2 text-left font-medium sm:min-w-[220px] sm:px-3">Продукт{filterLabel}</th>
              <th className="min-w-[70px] bg-muted/50 px-2 py-2 text-right font-medium sm:px-3">Итого</th>
              {dates.map((d, index) => (
                <th key={d} className="min-w-[58px] whitespace-nowrap px-2 py-2 text-right font-medium sm:px-3" title={formatDateFull(d)}>
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
              <td className="bg-emerald-50 px-2 py-2 text-right font-bold dark:bg-emerald-950/20 sm:px-3">{formatNumber(grandTotal)}</td>
              {dates.map((d, i) => (
                <td key={d} className="px-2 py-2 text-right sm:px-3">{formatNumber(activeDateTotals[i] || 0)}</td>
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
                    <td className="sticky left-0 z-10 bg-background px-2 py-2 sm:px-3">
                      <button type="button" className="text-left hover:underline" onClick={() => setSelectedProductId(p.id)}>{p.name}</button>
                    </td>
                    <td className="px-2 py-2 text-right font-medium sm:px-3">{formatNumber(total)}</td>
                    {dates.map((d, i) => {
                      const val = productPivot[i]
                      return (
                        <td key={d} style={heatStyle(val)} className={`px-2 py-2 text-right sm:px-3 ${val ? '' : 'text-muted-foreground'}`}>
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
                    <td className="sticky left-0 z-10 bg-background px-2 py-2 font-medium sm:px-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span>{group.baseName}</span>
                        <span className="text-xs text-muted-foreground">({group.children.length})</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold sm:px-3">{formatNumber(group.total)}</td>
                    {dates.map((d, i) => (
                      <td key={d} style={heatStyle(groupDateTotals[i])} className="px-2 py-2 text-right font-medium sm:px-3">
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
                          <td className="sticky left-0 z-10 bg-muted/10 px-2 py-2 pl-7 sm:px-3 sm:pl-8">
                            <button type="button" className="text-left text-muted-foreground hover:underline" onClick={() => setSelectedProductId(p.id)}>{sizePart}</button>
                          </td>
                          <td className="px-2 py-2 text-right sm:px-3">{formatNumber(total)}</td>
                          {dates.map((d, i) => {
                            const val = productPivot[i]
                            return (
                              <td key={d} style={heatStyle(val)} className={`px-2 py-2 text-right sm:px-3 ${val ? '' : 'text-muted-foreground'}`}>
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
    </div>
  )
}

// --- Daily Orders Tab ---
function DailyOrdersTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const [fetchedData, setFetchedData] = useState<DailyOrdersData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
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

  const fetchDailyData = useCallback(async (overrideFrom?: string, overrideTo?: string) => {
    setLoading(true)
    setRateLimitErrors([])
    try {
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectionToParam(selectedEnt))
      params.set('section', 'daily')
      const df = overrideFrom ?? (dateMode === 'single' ? singleDate : dateFrom)
      const dt = overrideTo ?? (dateMode === 'single' ? singleDate : dateTo)
      if (df) params.set('dateFrom', df)
      if (dt) params.set('dateTo', dt)
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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={setSelectedEnt}
          className="w-full sm:w-64"
        />

        <ToggleGroup type="single" value={dateMode} onValueChange={(v) => { if (v) setDateMode(v as 'single' | 'range') }} className="justify-start rounded-md border">
          <ToggleGroupItem value="single" className="text-xs px-3">Один день</ToggleGroupItem>
          <ToggleGroupItem value="range" className="text-xs px-3">Диапазон</ToggleGroupItem>
        </ToggleGroup>

        {dateMode === 'single' ? (
          <Input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
            <span className="text-sm text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" min="2026-01-01" max="2026-12-31" />
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
          {fetchedData.dates.length > 0 && fetchedData.entrepreneurs.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Сравнение ИП по дням</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 sm:hidden">
                  {fetchedData.dates.map((date) => (
                    <div key={date} className="rounded-md border p-3">
                      <div className="mb-2 text-sm font-medium">{formatDateFull(date)}</div>
                      <div className="space-y-1">
                        {fetchedData.entrepreneurs.map((ent) => (
                          <div key={ent.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-muted-foreground">{ent.name}</span>
                            <span className="font-semibold">{formatNumber(fetchedData.entrepreneurDailyData[date]?.[ent.id] || 0)}</span>
                          </div>
                        ))}
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
                      </tr>
                    </thead>
                    <tbody>
                      {fetchedData.dates.map((date) => (
                        <tr key={date} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{formatDateShort(date)}</td>
                          {fetchedData.entrepreneurs.map((ent) => (
                            <td key={ent.id} className="px-3 py-2 text-right">{formatNumber(fetchedData.entrepreneurDailyData[date]?.[ent.id] || 0)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
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
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])

  const data = fetchedData
  const latestMonth = data?.monthStats[data.monthStats.length - 1]
  const periodLabel = data && data.months.length > 0
    ? `${formatMonthLabel(data.months[0])} — ${formatMonthLabel(data.months[data.months.length - 1])}`
    : ''
  const totalOrders = data?.monthStats.reduce((sum, month) => sum + month.orders, 0) || 0
  const totalRevenue = data?.monthStats.reduce((sum, month) => sum + month.revenue, 0) || 0
  const totalAdSpend = data?.monthStats.reduce((sum, month) => sum + month.adSpend, 0) || 0
  const totalDrr = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : null
  const trendData = data ? data.monthStats.map((month) => ({
    month: formatMonthLabel(month.month),
    orders: month.orders,
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
    return { ...ent, total, revenue, adSpend, drr: revenue > 0 ? (adSpend / revenue) * 100 : null }
  }).sort((a, b) => b.total - a.total) : []

  const fetchData = useCallback(async () => {
    setLoading(true)
    setRateLimitErrors([])
    try {
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectionToParam(selectedEnt))
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
      <RateLimitAlert errors={rateLimitErrors} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiEntrepreneurSelect
          entrepreneurs={entrepreneurs}
          selectedIds={selectedEnt}
          onChange={setSelectedEnt}
          className="w-full sm:w-64"
        />

        <Button onClick={fetchData} disabled={loading} className="w-full gap-2 sm:w-auto">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">Заказы за период</div>
                <div className="mt-1 text-2xl font-bold">{formatNumber(totalOrders)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {periodLabel}; последний месяц: {latestMonth ? formatNumber(latestMonth.orders) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">Выручка заказов</div>
                <div className="mt-1 text-2xl font-bold">{formatNumber(Math.round(totalRevenue))} ₽</div>
                <div className="mt-1 text-xs text-muted-foreground">Период: {periodLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">ДРР за период</div>
                <div className="mt-1 text-2xl font-bold">{totalDrr === null ? '—' : `${totalDrr.toFixed(1)}%`}</div>
                <div className="mt-1 text-xs text-muted-foreground">Реклама / заказы; {periodLabel}</div>
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
                          <td className="px-3 py-2 text-right">{formatNumber(ent.total)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(Math.round(ent.revenue))} ₽</td>
                          <td className="px-3 py-2 text-right">{formatNumber(Math.round(ent.adSpend))} ₽</td>
                          <td className="px-3 py-2 text-right">{ent.drr === null ? '—' : `${ent.drr.toFixed(1)}%`}</td>
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
function ProductionLoadTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
  const getDefaultRange = () => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    const to = new Date(nowMsk.getTime() - 86400000).toISOString().split('T')[0]
    const from = new Date(nowMsk.getTime() - 30 * 86400000).toISOString().split('T')[0]
    return { from, to }
  }
  const defaults = getDefaultRange()
  const [fetchedData, setFetchedData] = useState<ProductionLoadData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEnt, setSelectedEnt] = useState<string[]>([ALL_ENTREPRENEURS])
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [initialLoadDone, setInitialLoadDone] = useState(false)
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

      const params = new URLSearchParams()
      params.set('entrepreneurId', selectionToParam(entIds || selectedEnt))
      params.set('section', 'production')
      params.set('dateFrom', activeRange.from)
      params.set('dateTo', activeRange.to)
      params.set('capacity', capacityOverride || capacityInput)
      const res = await fetch(`/api/wb-data?${params.toString()}`)
      const json = await res.json()
      if (json.production) setFetchedData(json.production)
      if (json.rateLimitErrors) setRateLimitErrors(json.rateLimitErrors)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedEnt, capacityInput, dateFrom, dateTo])

  useEffect(() => {
    const savedCapacity = window.localStorage.getItem('productionCapacity')
    if (savedCapacity) setCapacityInput(savedCapacity)
  }, [])

  // Auto-load on first mount with "Все ИП"
  useEffect(() => {
    if (!initialLoadDone) {
      setInitialLoadDone(true)
      fetchData([ALL_ENTREPRENEURS])
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
    fetchData(undefined, undefined, normalized)
  }

  const setQuickRange = (days: number, shiftDays = 0) => {
    const mskOffset = 3 * 60 * 60 * 1000
    const nowMsk = new Date(Date.now() + mskOffset)
    const end = new Date(nowMsk.getTime() - (1 + shiftDays) * 86400000)
    const start = new Date(end.getTime() - (days - 1) * 86400000)
    const range = {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
    }
    setDateFrom(range.from)
    setDateTo(range.to)
    fetchData(undefined, range)
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
  const topProductionProducts = useMemo(() => {
    if (!fetchedData) return []
    return fetchedData.products
      .slice()
      .sort((a, b) => (fetchedData.productItems[b.id] || 0) - (fetchedData.productItems[a.id] || 0))
      .slice(0, 15)
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
          onChange={(ids) => { setSelectedEnt(ids); fetchData(ids) }}
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
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-full sm:w-40" />
            <span className="text-sm text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-full sm:w-40" />
          </div>
          <ToggleGroup type="single" onValueChange={(value) => {
            if (value === '30') setQuickRange(30)
            if (value === '60') setQuickRange(60)
          }} className="justify-start overflow-x-auto rounded-md border bg-background">
            <ToggleGroupItem value="30" className="text-xs px-2">30 дн</ToggleGroupItem>
            <ToggleGroupItem value="60" className="text-xs px-2">60 дн</ToggleGroupItem>
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

          {/* Product breakdown - top products by items */}
          {topProductionProducts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Разбивка по продуктам (Топ-15)
                  <Badge variant="secondary" className="text-xs">FBS изделия</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 md:hidden">
                  {topProductionProducts.map((p) => {
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
                      {topProductionProducts.map((p) => {
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
function SupplyTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
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
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectionToParam(selectedEnt))
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
function GrowthPotentialTab({ entrepreneurs }: { entrepreneurs: EntrepreneurInfo[] }) {
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
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectionToParam(selectedEnt))
      params.set('dateFrom', dates.from)
      params.set('dateTo', dates.to)
      params.set('minOpens', String(minOpens))
      const res = await fetch(`/api/growth-potential?${params.toString()}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [getDates, selectedEnt, minOpens])

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
function AdSpendTab() {
  const [data, setData] = useState<AdSpendData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ad-spend').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading || !data) return <Skeleton className="h-96 w-full" />

  const { grouped } = data
  const entries = Object.values(grouped)
  const now = new Date()
  const reportYear = data.year || 2026
  const currentMonth = reportYear === now.getFullYear() ? now.getMonth() + 1 : 12
  const currentMonthLabel = MONTH_SHORT[currentMonth - 1]
  const currentMonthCampaignRows = entries.map((entry) => ({
    entrepreneur: entry.entrepreneur,
    campaigns: entry.months.find((month) => month.month === currentMonth)?.topCampaigns || [],
  }))
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const entry: Record<string, any> = { month: MONTH_SHORT[i] }
    entries.forEach((e) => { const monthData = e.months.find((m) => m.month === i + 1); entry[e.entrepreneur] = monthData?.actual || 0 })
    return entry
  })
  const colors = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b']

  return (
    <div className="space-y-6">
      {data.errors && data.errors.length > 0 && (
        <Alert variant={entries.length > 0 ? 'default' : 'destructive'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>WB Promotion API</AlertTitle>
          <AlertDescription>
            {entries.length > 0
              ? `Часть ИП не загрузилась: ${data.errors.map(e => e.name).join(', ')}`
              : 'Нет доступных данных рекламы. Нужны WB API токены с категорией «Продвижение».'}
          </AlertDescription>
        </Alert>
      )}

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Расходы на рекламу по месяцам ({data.year || 2026})
              <Badge variant="secondary" className="text-xs">WB Promotion API</Badge>
            </CardTitle>
          </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Нет данных о расходах на рекламу за {data.year || 2026} год</p>
          ) : (
            <div className="h-[300px] sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
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
          <CardHeader><CardTitle className="text-base">Расходы на рекламу — детализация ({data.year || 2026})</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50 z-10">ИП</th>
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
                        {Array.from({ length: 12 }, (_, i) => { const monthData = e.months.find((m) => m.month === i + 1); return (<td key={i} className={`text-right px-3 py-2 ${monthData ? '' : 'text-muted-foreground'}`}>{monthData ? formatNumber(monthData.actual) : '—'}</td>); })}
                        <td className="text-right px-3 py-2 font-semibold bg-muted/30">{formatNumber(total)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-emerald-50 dark:bg-emerald-950/20 z-10">ИТОГО</td>
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

      {entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Топ-5 кампаний по затратам за текущий месяц ({currentMonthLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="sticky left-0 z-10 min-w-[150px] bg-muted/50 px-3 py-2 text-left font-medium">ИП</th>
                    <th className="min-w-[60px] px-3 py-2 text-right font-medium">#</th>
                    <th className="min-w-[260px] px-3 py-2 text-left font-medium">Кампания</th>
                    <th className="min-w-[90px] px-3 py-2 text-right font-medium">ID</th>
                    <th className="min-w-[120px] px-3 py-2 text-right font-medium">Затраты</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMonthCampaignRows.flatMap((entry) => {
                    if (entry.campaigns.length === 0) {
                      return [
                        <tr key={`${entry.entrepreneur}-empty`} className="border-b">
                          <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">{entry.entrepreneur}</td>
                          <td colSpan={4} className="px-3 py-2 text-muted-foreground">Нет затрат за текущий месяц</td>
                        </tr>,
                      ]
                    }

                    return entry.campaigns.map((campaign, index) => (
                      <tr key={`${entry.entrepreneur}-${campaign.advertId}-${index}`} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">{entry.entrepreneur}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2">{campaign.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{campaign.advertId || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatNumber(campaign.spend)} ₽</td>
                      </tr>
                    ))
                  })}
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
  const apiEntrepreneurs = entrepreneurs.filter((e) => e.hasApiKey)

  const fetchData = useCallback(async () => {
    const ids = selectedEnt.includes(ALL_ENTREPRENEURS)
      ? apiEntrepreneurs.map((e) => String(e.id))
      : selectedEnt
    if (ids.length === 0) return
    setLoading(true)
    try {
      const results = await Promise.all(ids.map(async (id) => {
        const params = new URLSearchParams({
          entrepreneurId: id,
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        })
        const res = await fetch(`/api/wb-compare?${params.toString()}`)
        return await res.json()
      }))
      setData(combineCompareData(results.filter((item) => !item.error), entrepreneurs, ids))
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

// --- Main Page ---
export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurInfo[]>([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedDashEnt, setSelectedDashEnt] = useState<string[]>([]) // Empty = no auto-fetch
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'excel' | 'wbapi'>('excel')
  const [rateLimitErrors, setRateLimitErrors] = useState<RateLimitError[]>([])

  const refreshEntrepreneurs = useCallback(() => {
    fetch('/api/entrepreneurs')
      .then((r) => r.ok ? r.json() : [])
      .then(setEntrepreneurs)
      .catch(console.error)
  }, [])

  // Fetch current user, then entrepreneurs list (local DB only, no WB API)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => {
        setAuthUser(json.user)
        if (json.user) refreshEntrepreneurs()
      })
      .catch(console.error)
      .finally(() => setAuthChecked(true))
  }, [refreshEntrepreneurs])

  const handleAuth = useCallback((user: AuthUser) => {
    setAuthUser(user)
    refreshEntrepreneurs()
  }, [refreshEntrepreneurs])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAuthUser(null)
    setEntrepreneurs([])
    setDashboard(null)
    setSelectedDashEnt([])
    setActiveTab('dashboard')
  }, [])

  // Explicit dashboard data load — only triggered by user clicking "Загрузить"
  const loadDashboardData = useCallback(async () => {
    if (selectedDashEnt.length === 0) return
    setDashboardLoading(true)
    setRateLimitErrors([])
    try {
      const params = new URLSearchParams()
      params.set('entrepreneurId', selectionToParam(selectedDashEnt))
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

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    )
  }

  if (!authUser) return <AuthScreen onAuth={handleAuth} />

  const isAdmin = authUser.role === 'admin'

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
              <p className="hidden text-xs text-muted-foreground sm:block">Ежедневная аналитика заказов • 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dashboard?.latestDate && (
              <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex sm:text-xs">
                Данные по: {formatDateFull(dashboard.latestDate)}
              </Badge>
            )}
            <Badge variant={isAdmin ? 'default' : 'outline'} className="shrink-0 text-[10px] sm:text-xs">
              {authUser.username}{isAdmin ? ' · админ' : ''}
            </Badge>
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
            <TabsTrigger value="daily" className="h-9 gap-2 px-3">
              <Table2 className="h-4 w-4" />
              <span className="hidden sm:inline">Ежедневные</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="h-9 gap-2 px-3">
              <Thermometer className="h-4 w-4" />
              <span className="hidden sm:inline">Нагрузка</span>
            </TabsTrigger>
            <TabsTrigger value="supply" className="h-9 gap-2 px-3">
              <Truck className="h-4 w-4" />
              <span className="hidden sm:inline">Поставки</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="h-9 gap-2 px-3">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Динамика</span>
            </TabsTrigger>
            <TabsTrigger value="ads" className="h-9 gap-2 px-3">
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Реклама</span>
            </TabsTrigger>
            <TabsTrigger value="growth" className="h-9 gap-2 px-3">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Рост</span>
            </TabsTrigger>
            {isAdmin && (
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
          <TabsContent value="growth">
            <GrowthPotentialTab entrepreneurs={entrepreneurs} />
          </TabsContent>
          {isAdmin && (
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
            WB Отчёты — Аналитика заказов Wildberries • 2026 • {entrepreneurs.length} ИП
          </p>
        </div>
      </footer>
    </div>
  )
}
