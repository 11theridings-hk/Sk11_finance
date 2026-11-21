'use client'

import { useEffect, useState, useTransition } from 'react'
import TopNav from '@/app/TopNav'
import ReminderOverview from '@/components/ReminderOverview'
import { getChromeNavData, type ChromeNavData } from '@/app/actions/chrome'
import type { Locale } from '@/lib/i18n'
import type { PluginFlags } from '@/lib/plugins'

type NavSession = {
  userId: string
  roleName: string
  isAdmin: boolean
  publicLedgerRole?: string | null
}

const EMPTY_NAV: ChromeNavData = {
  pendingCount: 0,
  pendingPaymentCount: 0,
  contracts: [],
  activities: [],
  recurring: [],
  contractCount: 0,
  activityCount: 0,
  recurringCount: 0,
}

export default function AppChrome({
  session,
  pluginFlags,
  locale,
}: {
  session: NavSession
  pluginFlags: PluginFlags
  locale: Locale
}) {
  const [nav, setNav] = useState<ChromeNavData>(EMPTY_NAV)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    startTransition(() => {
      void getChromeNavData().then((data) => {
        if (!cancelled) setNav(data)
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-0 sm:pt-2">
        <TopNav
          session={session}
          pendingCount={nav.pendingCount}
          pendingPaymentCount={nav.pendingPaymentCount}
          contractReminderCount={nav.contractCount}
          activityReminderCount={nav.activityCount}
          recurringReminderCount={nav.recurringCount}
          pluginFlags={pluginFlags}
          locale={locale}
        />
      </div>
      <ReminderOverview
        locale={locale}
        contracts={nav.contracts}
        activities={nav.activities}
        recurring={nav.recurring}
      />
    </>
  )
}
