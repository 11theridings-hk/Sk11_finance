import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getPendingPaymentRecords } from '../actions/payment'
import PaymentClient from './PaymentClient'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { getDefaultHomePath } from '@/lib/access'

export const metadata = {
  title: '待付款',
}

export default async function PaymentPage() {
  const session = await getSession()
  if (!session || !session.isAdmin) {
    redirect(session ? getDefaultHomePath(session) : '/login')
  }
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)

  const pendingPaymentRecords = await getPendingPaymentRecords()

  return (
    <PaymentClient
      pendingPaymentRecords={pendingPaymentRecords}
      locale={locale}
      title={t('paymentPage')}
    />
  )
}
