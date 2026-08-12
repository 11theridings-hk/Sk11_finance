export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from './actions/auth'
import { getUserStats, getRecentRecords } from './actions/record'
import { getCategories } from './actions/category'
import { getCapitalPools } from './actions/pool'
import HomePageClient from './HomePageClient'

export default async function HomePage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const [stats, initialRecords, categories, pools] = await Promise.all([
    getUserStats(session.userId),
    // Fetch the latest records specifically for the initial render
    getRecentRecords(session.userId),
    getCategories(),
    getCapitalPools(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <HomePageClient 
        session={session}
        stats={stats}
        initialRecords={initialRecords}
        categories={categories}
        pools={pools}
      />
    </div>
  )
}
