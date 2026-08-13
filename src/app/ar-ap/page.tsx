import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getARAPRecords } from '../actions/arap'
import ARAPClient from './ARAPClient'

export const metadata = {
  title: "应收/付",
}

export default async function ARAPPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const records = await getARAPRecords()

  return <ARAPClient session={session} records={records} />
}
