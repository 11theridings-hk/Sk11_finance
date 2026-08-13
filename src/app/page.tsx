export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from './actions/auth'
import { getUserStats, getRecentRecords } from './actions/record'
import { getCategories } from './actions/category'
import { getCapitalPools } from './actions/pool'
import { getOpenOrders } from './actions/order'
import HomePageClient from './HomePageClient'

export default async function HomePage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const [stats, initialRecords, categories, pools, openOrders] = await Promise.all([
    getUserStats(session.userId),
    getRecentRecords(session.userId),
    getCategories(),
    getCapitalPools(session.userId),
    getOpenOrders()
  ])

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <HomePageClient 
        session={session}
        stats={stats}
        initialRecords={initialRecords}
        categories={categories}
        pools={pools}
        openOrders={openOrders}
      />
    </div>
  )
}
