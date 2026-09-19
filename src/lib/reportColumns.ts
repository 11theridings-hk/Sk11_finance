export type ReportTab = 'records' | 'activities' | 'contracts'

export type ReportColumnDef = {
  id: string
  labelKey: string
  /** Default on when no saved preference */
  defaultVisible?: boolean
}

/** Toggleable data columns for the records report (UI + exports). */
export const RECORD_COLUMNS: ReportColumnDef[] = [
  { id: 'recordIdShort', labelKey: 'recordIdShort', defaultVisible: false },
  { id: 'date', labelKey: 'date' },
  { id: 'type', labelKey: 'type' },
  { id: 'category', labelKey: 'categoryPath' },
  { id: 'role', labelKey: 'role' },
  { id: 'pool', labelKey: 'pool' },
  { id: 'amount', labelKey: 'amount' },
  { id: 'content', labelKey: 'content' },
  { id: 'attachmentCount', labelKey: 'attachmentCount' },
  { id: 'note', labelKey: 'note' },
  { id: 'status', labelKey: 'status' },
]

export const ACTIVITY_COLUMNS: ReportColumnDef[] = [
  { id: 'recordIdShort', labelKey: 'recordIdShort', defaultVisible: false },
  { id: 'activityTitle', labelKey: 'activityTitle' },
  { id: 'activityDate', labelKey: 'activityDate' },
  { id: 'reminderDays', labelKey: 'reminderDays' },
  { id: 'activityVisibility', labelKey: 'activityVisibility' },
  { id: 'role', labelKey: 'role' },
  { id: 'attachmentCount', labelKey: 'attachmentCount' },
  { id: 'content', labelKey: 'content' },
  { id: 'note', labelKey: 'note' },
]

export const CONTRACT_COLUMNS: ReportColumnDef[] = [
  { id: 'recordIdShort', labelKey: 'recordIdShort', defaultVisible: false },
  { id: 'contractTitle', labelKey: 'contractTitle' },
  { id: 'type', labelKey: 'type' },
  { id: 'effectiveDate', labelKey: 'effectiveDate' },
  { id: 'expiryDate', labelKey: 'expiryDate' },
  { id: 'category', labelKey: 'categoryPath' },
  { id: 'pool', labelKey: 'pool' },
  { id: 'amount', labelKey: 'amount' },
  { id: 'role', labelKey: 'role' },
  { id: 'attachmentCount', labelKey: 'attachmentCount' },
  { id: 'content', labelKey: 'content' },
  { id: 'note', labelKey: 'note' },
]

export const REPORT_COLUMNS_BY_TAB: Record<ReportTab, ReportColumnDef[]> = {
  records: RECORD_COLUMNS,
  activities: ACTIVITY_COLUMNS,
  contracts: CONTRACT_COLUMNS,
}

const STORAGE_PREFIX = 'report.visibleColumns.v1.'

export function defaultVisibleIds(defs: ReportColumnDef[]) {
  return defs
    .filter((d) => d.defaultVisible !== false)
    .map((d) => d.id)
}

export function loadVisibleColumnIds(tab: ReportTab): string[] {
  const defs = REPORT_COLUMNS_BY_TAB[tab]
  if (typeof window === 'undefined') return defaultVisibleIds(defs)
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tab)
    if (!raw) return defaultVisibleIds(defs)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return defaultVisibleIds(defs)
    const allowed = new Set(defs.map((d) => d.id))
    const filtered = parsed.filter((id): id is string => typeof id === 'string' && allowed.has(id))
    return filtered.length > 0 ? filtered : defaultVisibleIds(defs)
  } catch {
    return defaultVisibleIds(defs)
  }
}

export function saveVisibleColumnIds(tab: ReportTab, ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tab, JSON.stringify(ids))
  } catch {
    // ignore quota / private mode
  }
}

export function isColumnVisible(visibleIds: string[] | Set<string>, id: string) {
  if (visibleIds instanceof Set) return visibleIds.has(id)
  return visibleIds.includes(id)
}

/** Pick values whose column id is visible (preserves order of `order`). */
export function pickVisibleValues<T>(order: string[], visible: Set<string>, values: Record<string, T>): T[] {
  return order.filter((id) => visible.has(id)).map((id) => values[id])
}
