import {
  deriveFbsBotStatus,
  type FbsBotSnapshot,
  type FbsBotStatus,
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
} from './fbs-bot-contract.ts'
// @ts-expect-error TS5097 is intentional for the standalone unit test command.
import { FBS_BOT_SELLERS } from './fbs-bot-sellers.ts'

type SellerId = FbsBotSnapshot['sellerId']
type SellerIdentity = Pick<FbsBotSnapshot, 'sellerId' | 'sellerDisplayName'>

export type FbsBotFleetAccount = SellerIdentity & {
  status: FbsBotStatus
  lastSuccessfulRunAt: string | null
  generatedAt: string | null
}

export type FbsBotFleetOpenSupply = FbsBotSnapshot['openSupplies'][number] & SellerIdentity
export type FbsBotFleetDeliveredSupply = FbsBotSnapshot['deliveredSupplies'][number] & SellerIdentity
export type FbsBotFleetError = FbsBotSnapshot['errors'][number] & SellerIdentity

export interface FbsBotFleetView {
  status: FbsBotStatus
  counts: FbsBotSnapshot['counts']
  accounts: FbsBotFleetAccount[]
  openSupplies: FbsBotFleetOpenSupply[]
  deliveredSupplies: FbsBotFleetDeliveredSupply[]
  errors: FbsBotFleetError[]
}

export interface FbsBotFleetRenderState {
  fleetView: FbsBotFleetView | null
  status: FbsBotStatus
}

const SELLERS: readonly SellerIdentity[] = FBS_BOT_SELLERS

const STATUS_SEVERITY: Record<FbsBotStatus, number> = {
  'работает': 0,
  'загрузка данных': 1,
  'задержка': 2,
  'остановлен': 3,
  'ошибка': 4,
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareNewest(left: string, right: string) {
  return Date.parse(right) - Date.parse(left)
}

export function buildFbsBotFleetView(
  snapshots: readonly FbsBotSnapshot[],
  now: number,
): FbsBotFleetView {
  const snapshotsBySeller = new Map<SellerId, FbsBotSnapshot>(
    snapshots.map(snapshot => [snapshot.sellerId, snapshot]),
  )

  const accounts = SELLERS.map(seller => {
    const snapshot = snapshotsBySeller.get(seller.sellerId)
    return {
      ...seller,
      status: deriveFbsBotStatus(snapshot, now),
      lastSuccessfulRunAt: snapshot?.lastSuccessfulRunAt ?? null,
      generatedAt: snapshot?.generatedAt ?? null,
    }
  })

  const counts = snapshots.reduce<FbsBotSnapshot['counts']>((total, snapshot) => ({
    new: total.new + snapshot.counts.new,
    assigned: total.assigned + snapshot.counts.assigned,
    ignored: total.ignored + snapshot.counts.ignored,
    blocked: total.blocked + snapshot.counts.blocked,
  }), { new: 0, assigned: 0, ignored: 0, blocked: 0 })

  const openSupplies = snapshots.flatMap(snapshot => snapshot.openSupplies.map(supply => ({
    ...supply,
    sellerId: snapshot.sellerId,
    sellerDisplayName: snapshot.sellerDisplayName,
  }))).sort((left, right) => (
    Date.parse(left.nextDeliveryWindowAt) - Date.parse(right.nextDeliveryWindowAt)
    || compareText(left.sellerId, right.sellerId)
    || compareText(left.supplyId, right.supplyId)
  ))

  const deliveredSupplies = snapshots.flatMap(snapshot => snapshot.deliveredSupplies.map(supply => ({
    ...supply,
    sellerId: snapshot.sellerId,
    sellerDisplayName: snapshot.sellerDisplayName,
  }))).sort((left, right) => (
    compareNewest(left.deliveredAt, right.deliveredAt)
    || compareText(left.sellerId, right.sellerId)
    || compareText(left.supplyId, right.supplyId)
  ))

  const errors = snapshots.flatMap(snapshot => snapshot.errors.map(error => ({
    ...error,
    sellerId: snapshot.sellerId,
    sellerDisplayName: snapshot.sellerDisplayName,
  }))).sort((left, right) => (
    compareNewest(left.occurredAt, right.occurredAt)
    || compareText(left.sellerId, right.sellerId)
    || compareText(left.code, right.code)
    || compareText(left.supplyId ?? '', right.supplyId ?? '')
  ))

  const status = accounts.reduce<FbsBotStatus>((current, account) => (
    STATUS_SEVERITY[account.status] > STATUS_SEVERITY[current] ? account.status : current
  ), 'работает')

  return { status, counts, accounts, openSupplies, deliveredSupplies, errors }
}

export function selectFbsBotFleetStatus(
  fleetStatus: FbsBotStatus | null,
  loading: boolean,
): FbsBotStatus {
  if (!fleetStatus) return loading ? 'загрузка данных' : 'остановлен'
  return loading && STATUS_SEVERITY[fleetStatus] < STATUS_SEVERITY['загрузка данных']
    ? 'загрузка данных'
    : fleetStatus
}

export function buildFbsBotFleetRenderState(
  snapshots: readonly FbsBotSnapshot[] | undefined,
  now: number,
  loading: boolean,
): FbsBotFleetRenderState {
  const fleetView = snapshots === undefined ? null : buildFbsBotFleetView(snapshots, now)
  return {
    fleetView,
    status: selectFbsBotFleetStatus(fleetView?.status ?? null, loading),
  }
}
