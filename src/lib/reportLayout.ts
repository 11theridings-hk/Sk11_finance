/** Page orientation & sort helpers for report list / PDF export. */

export type PageOrientation = 'portrait' | 'landscape'
export type PageOrientationPreference = 'auto' | PageOrientation

export type ReportSortKey = 'date' | 'type' | 'category' | 'status' | 'pool'
export type ReportSortDir = 'asc' | 'desc'

/** Visible display-column count at or above this → landscape when preference is「自動」. */
export const LANDSCAPE_COLUMN_THRESHOLD = 7

const ORIENTATION_STORAGE_KEY = 'report.pageOrientation.v1'

export function resolvePageOrientation(
  preference: PageOrientationPreference,
  visibleColumnCount: number
): PageOrientation {
  if (preference === 'portrait' || preference === 'landscape') return preference
  return visibleColumnCount >= LANDSCAPE_COLUMN_THRESHOLD ? 'landscape' : 'portrait'
}

export function loadPageOrientationPreference(): PageOrientationPreference {
  if (typeof window === 'undefined') return 'auto'
  try {
    const raw = window.localStorage.getItem(ORIENTATION_STORAGE_KEY)
    if (raw === 'portrait' || raw === 'landscape' || raw === 'auto') return raw
  } catch {
    // ignore
  }
  return 'auto'
}

export function savePageOrientationPreference(value: PageOrientationPreference) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, value)
  } catch {
    // ignore quota / private mode
  }
}

function categorySortValue(item: {
  category?: { name?: string | null } | null
  subCategory?: { name?: string | null } | null
  thirdCategory?: { name?: string | null } | null
}) {
  return (
    [item?.category?.name, item?.subCategory?.name, item?.thirdCategory?.name]
      .filter(Boolean)
      .join(' / ') || ''
  )
}

function dateSortValue(item: {
  date?: string | Date | null
  eventDate?: string | Date | null
  effectiveDate?: string | Date | null
}) {
  const raw = item.date ?? item.eventDate ?? item.effectiveDate
  if (!raw) return 0
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : 0
}

function sortComparable(
  item: any,
  sortBy: ReportSortKey
): string | number {
  switch (sortBy) {
    case 'type':
      return String(item?.type || '')
    case 'category':
      return categorySortValue(item)
    case 'status':
      return String(item?.status || '')
    case 'pool':
      return String(item?.pool?.name || '')
    case 'date':
    default:
      return dateSortValue(item)
  }
}

/** Stable multi-key sort: primary sortBy, then date desc as tie-breaker. */
export function sortReportRows<T>(rows: T[], sortBy: ReportSortKey, sortDir: ReportSortDir): T[] {
  const mul = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortComparable(a, sortBy)
    const bv = sortComparable(b, sortBy)
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv
    } else {
      cmp = String(av).localeCompare(String(bv), 'zh-Hant', { sensitivity: 'base', numeric: true })
    }
    if (cmp !== 0) return cmp * mul
    // tie-breaker: newer date first
    return dateSortValue(b as any) - dateSortValue(a as any)
  })
}
