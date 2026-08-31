export interface DashboardLoadError {
  id: number
  name: string
  error: string
}

const SAFE_DASHBOARD_API_ERROR = 'Не удалось загрузить данные WB. Повторите попытку.'

export function createDashboardLoadFailure(_error: unknown): DashboardLoadError {
  return {
    id: 0,
    name: 'WB Analytics',
    error: 'Не удалось загрузить аналитику. Повторите попытку.',
  }
}

export function createDashboardDateLoadFailure(date: string, _error: unknown): DashboardLoadError {
  return {
    id: 0,
    name: 'WB Analytics',
    error: `Не удалось загрузить данные за ${date}. Повторите попытку.`,
  }
}

export function normalizeDashboardLoadErrors(errors: DashboardLoadError[]): DashboardLoadError[] {
  const seen = new Set<string>()
  return errors.flatMap((error) => {
    const safeError = {
      id: Number.isFinite(Number(error?.id)) ? Number(error.id) : 0,
      name: typeof error?.name === 'string' && error.name.trim()
        ? error.name.trim().slice(0, 80)
        : 'WB Analytics',
      error: SAFE_DASHBOARD_API_ERROR,
    }
    const key = `${safeError.id}:${safeError.name}`
    if (seen.has(key)) return []
    seen.add(key)
    return [safeError]
  })
}
