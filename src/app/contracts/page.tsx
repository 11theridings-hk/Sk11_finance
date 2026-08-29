import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getCategories } from '../actions/category'
import { getCapitalPools } from '../actions/pool'
import { getContracts } from '../actions/contract'
import ContractsClient from './ContractsClient'
import { getCurrentLocale } from '@/lib/locale'

export const metadata = {
  title: 'Contracts',
}

export default async function ContractsPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const locale = await getCurrentLocale()
  const [categories, pools, contracts] = await Promise.all([
    getCategories(),
    getCapitalPools(session.userId),
    getContracts(),
  ])

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <ContractsClient
        locale={locale}
        categories={categories}
        pools={pools}
        initialContracts={contracts}
      />
    </div>
  )
}
