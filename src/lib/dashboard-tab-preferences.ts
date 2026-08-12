export const DASHBOARD_TABS_PREFERENCES_VERSION = 1 as const

export const OPTIONAL_DASHBOARD_TAB_IDS = [
  'daily',
  'production',
  'supply',
  'monthly',
  'ads',
  'growth',
  'unit',
  'compare',
  'fbsbot',
] as const

export type OptionalDashboardTabId = typeof OPTIONAL_DASHBOARD_TAB_IDS[number]

export interface DashboardTabPreferences {
  visibleTabs: OptionalDashboardTabId[]
  visibleTabsVersion: number
}

const ADMIN_ONLY_TABS = new Set<OptionalDashboardTabId>(['unit', 'compare', 'fbsbot'])
const ALLOWED_TABS = new Set<OptionalDashboardTabId>(OPTIONAL_DASHBOARD_TAB_IDS)

function isPreferences(value: unknown): value is {
  visibleTabs?: unknown
  visibleTabsVersion?: unknown
} {
  return typeof value === 'object' && value !== null
}

export function normalizeDashboardTabPreferences(
  value: unknown,
  isAdmin: boolean,
): DashboardTabPreferences {
  const input = Array.isArray(value)
    ? { visibleTabs: value }
    : isPreferences(value) ? value : {}
  const tabs = Array.isArray(input.visibleTabs)
    ? input.visibleTabs
    : OPTIONAL_DASHBOARD_TAB_IDS
  const visibleTabs = [...new Set(tabs)]
    .filter((tab): tab is OptionalDashboardTabId => (
      typeof tab === 'string' && ALLOWED_TABS.has(tab as OptionalDashboardTabId)
    ))
    .filter(tab => isAdmin || !ADMIN_ONLY_TABS.has(tab))

  if (isAdmin && !visibleTabs.includes('unit')) visibleTabs.push('unit')
  if (
    isAdmin
    && input.visibleTabsVersion !== DASHBOARD_TABS_PREFERENCES_VERSION
    && !visibleTabs.includes('fbsbot')
  ) {
    visibleTabs.push('fbsbot')
  }

  return {
    visibleTabs,
    visibleTabsVersion: DASHBOARD_TABS_PREFERENCES_VERSION,
  }
}
