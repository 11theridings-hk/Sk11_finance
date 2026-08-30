import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getActivities } from '../actions/activity'
import { getCurrentLocale } from '@/lib/locale'
import ActivitiesClient from './ActivitiesClient'

export const metadata = {
  title: 'Activities',
}

export default async function ActivitiesPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const locale = await getCurrentLocale()
  const activities = await getActivities()

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <ActivitiesClient
        locale={locale}
        currentUserId={session.userId}
        isAdmin={session.isAdmin}
        initialActivities={activities}
      />
    </div>
  )
}
