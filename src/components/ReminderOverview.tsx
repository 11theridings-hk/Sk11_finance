'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'
import type { ReminderItem } from '@/app/actions/reminder'

type Props = {
  locale: Locale
  contracts: ReminderItem[]
  activities: ReminderItem[]
  recurring?: ReminderItem[]
}

const STORAGE_KEY = 'sk11.reminderOverview.expanded'

function formatBadgeText(item: ReminderItem, locale: Locale) {
  if (item.bucket === 'overdue') {
    return locale === 'en' ? `${Math.abs(item.daysDiff)}d overdue` : `逾期 ${Math.abs(item.daysDiff)} 天`
  }
  if (item.bucket === 'today') {
    return locale === 'en' ? 'Today' : '今天'
  }
  return locale === 'en' ? `${item.daysDiff}d left` : `尚餘 ${item.daysDiff} 天`
}

function bucketCounts(items: ReminderItem[]) {
  return {
    overdue: items.filter((item) => item.bucket === 'overdue').length,
    today: items.filter((item) => item.bucket === 'today').length,
    upcoming: items.filter((item) => item.bucket === 'upcoming').length,
  }
}

function Section({
  title,
  items,
  locale,
}: {
  title: string
  items: ReminderItem[]
  locale: Locale
}) {
  if (items.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#9A3412]/80">{title}</h4>
        <span className="text-xs font-bold text-[#C2410C]">{items.length}</span>
      </div>
      <ul className="space-y-1">
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-800 transition-colors hover:bg-[#FFEDD5]"
            >
              <span className="min-w-0 truncate font-medium">{item.title}</span>
              <span className="shrink-0 text-[11px] font-medium text-[#C2410C]">
                {formatBadgeText(item, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ReminderOverview({ locale, contracts, activities, recurring = [] }: Props) {
  const t = createTranslator(locale)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // ignore storage errors
    }
  }, [])

  const total = contracts.length + activities.length + recurring.length
  const counts = useMemo(() => {
    const all = [...contracts, ...activities, ...recurring]
    return bucketCounts(all)
  }, [contracts, activities, recurring])

  if (total === 0) return null

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }

  const summaryParts = [
    counts.overdue > 0
      ? t('reminderOverdueCount').replace('{{count}}', String(counts.overdue))
      : null,
    counts.today > 0 ? t('reminderTodayCount').replace('{{count}}', String(counts.today)) : null,
    counts.upcoming > 0
      ? t('reminderUpcomingCount').replace('{{count}}', String(counts.upcoming))
      : null,
  ].filter(Boolean)

  return (
    <div className="mx-auto mt-3 max-w-4xl px-4 sm:px-0">
      <div className="overflow-hidden rounded-xl border border-[#FF9500]/25 bg-[#FFF7ED]/90 shadow-sm">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#FFEDD5]/60"
          aria-expanded={expanded}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-[#9A3412]">{t('reminderOverviewTitle')}</span>
              <span className="rounded-md bg-[#FF9500]/15 px-1.5 py-0.5 text-xs font-bold text-[#C2410C]">
                {total}
              </span>
            </div>
            {!expanded && summaryParts.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-[#C2410C]/90">{summaryParts.join(' · ')}</p>
            )}
          </div>
          <span className="shrink-0 text-xs font-medium text-[#9A3412]">
            {expanded ? t('reminderOverviewCollapse') : t('reminderOverviewExpand')}
            <span className="ml-1 inline-block transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
              ▾
            </span>
          </span>
        </button>

        {expanded && (
          <div className="grid gap-3 border-t border-[#FF9500]/15 px-3 py-3 sm:grid-cols-2 md:grid-cols-3">
            <Section title={t('contractExpiryReminder')} items={contracts} locale={locale} />
            <Section title={t('activityReminder')} items={activities} locale={locale} />
            <Section title={t('recurring')} items={recurring} locale={locale} />
          </div>
        )}
      </div>
    </div>
  )
}
