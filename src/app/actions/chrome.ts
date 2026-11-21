'use server'

import { getPendingPaymentCount } from './payment'
import { getPendingReviewCount } from './review'
import { getReminderOverview, type ReminderItem } from './reminder'

export type ChromeNavData = {
  pendingCount: number
  pendingPaymentCount: number
  contracts: ReminderItem[]
  activities: ReminderItem[]
  recurring: ReminderItem[]
  contractCount: number
  activityCount: number
  recurringCount: number
}

const EMPTY_CHROME_NAV: ChromeNavData = {
  pendingCount: 0,
  pendingPaymentCount: 0,
  contracts: [],
  activities: [],
  recurring: [],
  contractCount: 0,
  activityCount: 0,
  recurringCount: 0,
}

/**
 * Single post-paint fetch for nav badges + reminder overview.
 * Keeps the root Layout free of these queries on every navigation.
 */
export async function getChromeNavData(): Promise<ChromeNavData> {
  try {
    const [overview, pendingCount, pendingPaymentCount] = await Promise.all([
      getReminderOverview(),
      getPendingReviewCount(),
      getPendingPaymentCount(),
    ])

    return {
      pendingCount,
      pendingPaymentCount,
      contracts: overview.contracts,
      activities: overview.activities,
      recurring: overview.recurring,
      contractCount: overview.contractCount,
      activityCount: overview.activityCount,
      recurringCount: overview.recurringCount,
    }
  } catch {
    return EMPTY_CHROME_NAV
  }
}
