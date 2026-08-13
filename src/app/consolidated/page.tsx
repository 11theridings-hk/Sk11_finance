import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getOpenOrders, getClosedOrders } from '../actions/order'
import ConsolidatedClient from './ConsolidatedClient'

export const metadata = {
  title: "归结单",
}

export default async function ConsolidatedPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const openOrders = await getOpenOrders()
  const closedOrders = await getClosedOrders()

  return <ConsolidatedClient openOrders={openOrders} closedOrders={closedOrders} />
}
