'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, Clock, RefreshCw, Truck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  deriveFbsBotStatus,
  FbsBotStatusResponseSchema,
  type FbsBotSnapshot,
  type FbsBotStatus,
} from '@/lib/fbs-bot-contract'
import {
  FbsBotStatusClientError,
  toSafeFbsBotStatusErrorMessage,
} from '@/lib/fbs-bot-status-client'

const MOSCOW_DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  dateStyle: 'medium',
  timeStyle: 'short',
})

const MOSCOW_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const STATUS_CLASS: Record<FbsBotStatus, string> = {
  'работает': 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'загрузка данных': 'border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  'задержка': 'border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  'ошибка': 'border-destructive/30 bg-destructive/10 text-destructive',
  'остановлен': 'border-muted-foreground/30 bg-muted text-muted-foreground',
}

const SUPPLY_STATUS_LABELS: Record<FbsBotSnapshot['openSupplies'][number]['status'], string> = {
  open: 'Открыта',
  delivery_due: 'К доставке',
  blocked: 'Заблокирована',
}

function formatMoscowDateTime(value: string | null) {
  return value ? `${MOSCOW_DATE_TIME.format(new Date(value))} МСК` : 'Нет данных'
}

function formatMoscowTime(value: string) {
  return MOSCOW_TIME.format(new Date(value))
}

export function FbsBotTab({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<FbsBotSnapshot | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const loadStatus = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)

    try {
      const response = await fetch('/api/fbs-bot/status', {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) {
        throw response.status === 403
          ? new FbsBotStatusClientError('forbidden')
          : new Error('status request failed')
      }

      const parsed = FbsBotStatusResponseSchema.safeParse(await response.json())
      if (!parsed.success) throw new FbsBotStatusClientError('invalid_response')

      setSnapshot(parsed.data.snapshot)
      setRequestError(null)
    } catch (error) {
      if (controller.signal.aborted) return
      setRequestError(toSafeFbsBotStatusErrorMessage(error))
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!active) {
      requestRef.current?.abort()
      requestRef.current = null
      setLoading(false)
      return
    }

    void loadStatus()
    const interval = window.setInterval(() => void loadStatus(), 30_000)
    return () => {
      window.clearInterval(interval)
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [active, loadStatus])

  const initialLoading = active && snapshot === undefined && !requestError
  const status = deriveFbsBotStatus(snapshot, Date.now(), loading || initialLoading)

  return (
    <section className="space-y-6" aria-labelledby="fbs-bot-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Bot className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <h2 id="fbs-bot-heading" className="text-lg font-semibold">FBS-бот</h2>
            <p className="text-sm text-muted-foreground">ИП Зубахина</p>
          </div>
          <Badge variant="outline" className={STATUS_CLASS[status]}>{status}</Badge>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Обновить статус FBS-бота"
              onClick={() => void loadStatus()}
              disabled={loading || !active}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Обновить статус</TooltipContent>
        </Tooltip>
      </div>

      {requestError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Ошибка обновления</AlertTitle>
          <AlertDescription>
            {requestError}{snapshot ? ' Показаны последние полученные данные.' : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {(loading || initialLoading) && snapshot === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Загрузка статуса FBS-бота">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
        </div>
      ) : snapshot ? (
        <>
          <div className="grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b p-3 sm:border-r lg:border-b-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Последний успешный цикл</div>
              <p className="mt-1 text-sm font-medium">{formatMoscowDateTime(snapshot.lastSuccessfulRunAt)}</p>
            </div>
            <div className="border-b p-3 lg:border-r lg:border-b-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-3.5 w-3.5" />Следующее окно доставки</div>
              <p className="mt-1 text-sm font-medium">{formatMoscowDateTime(snapshot.nextDeliveryWindowAt)}</p>
            </div>
            <div className="border-b p-3 sm:border-r sm:border-b-0">
              <p className="text-xs text-muted-foreground">Heartbeat</p>
              <p className="mt-1 text-sm font-medium">{formatMoscowDateTime(snapshot.generatedAt)}</p>
            </div>
            <div className="p-3">
              <p className="text-xs text-muted-foreground">Маппинг / кеш</p>
              <p className="mt-1 truncate font-mono text-xs" title={snapshot.mappingVersion || undefined}>
                {snapshot.mappingVersion ? snapshot.mappingVersion.slice(0, 12) : 'Нет версии'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatMoscowDateTime(snapshot.mappingCacheUpdatedAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
            {([
              ['Новые', snapshot.counts.new],
              ['Распределены', snapshot.counts.assigned],
              ['Пропущены', snapshot.counts.ignored],
              ['Заблокированы', snapshot.counts.blocked],
            ] as const).map(([label, value]) => (
              <div key={label} className="bg-background px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{value.toLocaleString('ru-RU')}</p>
              </div>
            ))}
          </div>

          <section className="space-y-2" aria-labelledby="fbs-open-supplies">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <h3 id="fbs-open-supplies" className="text-sm font-semibold">Открытые поставки</h3>
              <Badge variant="secondary">{snapshot.openSupplies.length}</Badge>
            </div>
            {snapshot.openSupplies.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Поставка</TableHead>
                    <TableHead>Группа</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Заданий</TableHead>
                    <TableHead>Следующее окно</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.openSupplies.map(supply => (
                    <TableRow key={supply.supplyId}>
                      <TableCell>
                        <div className="max-w-[28rem] whitespace-normal font-medium">{supply.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{supply.supplyId}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{supply.groupKey}</TableCell>
                      <TableCell><Badge variant="outline">{SUPPLY_STATUS_LABELS[supply.status]}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{supply.orderCount}</TableCell>
                      <TableCell>{formatMoscowDateTime(supply.nextDeliveryWindowAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="border-y py-4 text-sm text-muted-foreground">Открытых поставок нет.</p>}
          </section>

          <section className="space-y-2" aria-labelledby="fbs-delivered-supplies">
            <h3 id="fbs-delivered-supplies" className="text-sm font-semibold">Переданы в доставку</h3>
            {snapshot.deliveredSupplies.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Поставка</TableHead>
                    <TableHead className="text-right">Заданий</TableHead>
                    <TableHead>Передана</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.deliveredSupplies.map(supply => (
                    <TableRow key={`${supply.supplyId}-${supply.deliveredAt}`}>
                      <TableCell>
                        <div className="max-w-[36rem] whitespace-normal font-medium">{supply.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{supply.supplyId}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{supply.orderCount}</TableCell>
                      <TableCell>{formatMoscowDateTime(supply.deliveredAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="border-y py-4 text-sm text-muted-foreground">История доставок пока пуста.</p>}
          </section>

          <section className="space-y-2" aria-labelledby="fbs-errors">
            <div className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-muted-foreground" />
              <h3 id="fbs-errors" className="text-sm font-semibold">Ошибки</h3>
              <Badge variant={snapshot.errors.some(error => error.blocking) ? 'destructive' : 'secondary'}>{snapshot.errors.length}</Badge>
            </div>
            {snapshot.errors.length ? (
              <div className="divide-y border-y">
                {snapshot.errors.map((error, index) => (
                  <div key={`${error.code}-${error.occurredAt}-${index}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{error.code}</span>
                        {error.blocking ? <Badge variant="destructive">Блокирует работу</Badge> : null}
                      </div>
                      <p className="mt-1 break-words text-muted-foreground">{error.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {error.orderId ? `Заказ ${error.orderId}` : null}
                        {error.orderId && error.supplyId ? ' · ' : null}
                        {error.supplyId ? `Поставка ${error.supplyId}` : null}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground" dateTime={error.occurredAt}>
                      {formatMoscowTime(error.occurredAt)} МСК
                    </time>
                  </div>
                ))}
              </div>
            ) : <p className="border-y py-4 text-sm text-muted-foreground">Ошибок нет.</p>}
          </section>
        </>
      ) : !loading ? (
        <div className="border-y py-8 text-center">
          <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Статус еще не получен</p>
          <p className="text-sm text-muted-foreground">Бот не отправлял heartbeat.</p>
        </div>
      ) : null}
    </section>
  )
}
