'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, RefreshCw, Truck } from 'lucide-react'
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
  FbsBotFleetStatusResponseSchema,
  type FbsBotSnapshot,
  type FbsBotStatus,
} from '@/lib/fbs-bot-contract'
import { buildFbsBotFleetRenderState } from '@/lib/fbs-bot-fleet'
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
  const [snapshots, setSnapshots] = useState<FbsBotSnapshot[] | undefined>(undefined)
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

      const parsed = FbsBotFleetStatusResponseSchema.safeParse(await response.json())
      if (!parsed.success) throw new FbsBotStatusClientError('invalid_response')

      setSnapshots(parsed.data.snapshots)
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

  const initialLoading = active && snapshots === undefined && !requestError
  const { fleetView, status } = buildFbsBotFleetRenderState(
    snapshots,
    Date.now(),
    loading || initialLoading,
  )

  return (
    <section className="space-y-6" aria-labelledby="fbs-bot-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Bot className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <h2 id="fbs-bot-heading" className="text-lg font-semibold">FBS-бот</h2>
            <p className="text-sm text-muted-foreground">Все кабинеты</p>
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
            {requestError}{snapshots !== undefined ? ' Показаны последние полученные данные.' : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {(loading || initialLoading) && snapshots === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Загрузка статуса FBS-бота">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
        </div>
      ) : fleetView ? (
        <>
          <div className="divide-y border-y" aria-label="Состояние кабинетов FBS-бота">
            {fleetView.accounts.map(account => (
              <div
                key={account.sellerId}
                className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(10rem,1fr)_auto_auto] sm:items-center sm:gap-6"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{account.sellerDisplayName}</span>
                  <Badge variant="outline" className={STATUS_CLASS[account.status]}>{account.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Последний успешный цикл</p>
                  <p className="mt-0.5 font-medium">{formatMoscowDateTime(account.lastSuccessfulRunAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Heartbeat</p>
                  <p className="mt-0.5 font-medium">{formatMoscowDateTime(account.generatedAt)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
            {([
              ['Новые', fleetView.counts.new],
              ['Распределены', fleetView.counts.assigned],
              ['Пропущены', fleetView.counts.ignored],
              ['Заблокированы', fleetView.counts.blocked],
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
              <Badge variant="secondary">{fleetView.openSupplies.length}</Badge>
            </div>
            {fleetView.openSupplies.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Кабинет</TableHead>
                    <TableHead>Поставка</TableHead>
                    <TableHead>Группа</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Заданий</TableHead>
                    <TableHead>Следующее окно</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fleetView.openSupplies.map(supply => (
                    <TableRow key={`${supply.sellerId}:${supply.supplyId}`}>
                      <TableCell><Badge variant="secondary">{supply.sellerDisplayName}</Badge></TableCell>
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
            {fleetView.deliveredSupplies.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Кабинет</TableHead>
                    <TableHead>Поставка</TableHead>
                    <TableHead className="text-right">Заданий</TableHead>
                    <TableHead>Передана</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fleetView.deliveredSupplies.map(supply => (
                    <TableRow key={`${supply.sellerId}:${supply.supplyId}:${supply.deliveredAt}`}>
                      <TableCell><Badge variant="secondary">{supply.sellerDisplayName}</Badge></TableCell>
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
              <Badge variant={fleetView.errors.some(error => error.blocking) ? 'destructive' : 'secondary'}>{fleetView.errors.length}</Badge>
            </div>
            {fleetView.errors.length ? (
              <div className="divide-y border-y">
                {fleetView.errors.map((error, index) => (
                  <div key={`${error.sellerId}:${error.code}:${error.occurredAt}:${index}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{error.sellerDisplayName}</Badge>
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
