import { redirect } from 'next/navigation'
import { getSession } from '../actions/auth'
import { getReviewRecords } from '../actions/review'
import ReviewClient from './ReviewClient'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export const metadata = {
  title: "审核",
}

export default async function ReviewPage() {
  const session = await getSession()
  if (!session || !session.isAdmin) {
    redirect('/')
  }
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)

  const pendingRecords = await getReviewRecords('PENDING')
  const approvedRecords = await getReviewRecords('APPROVED')
  const rejectedRecords = await getReviewRecords('REJECTED')

  // 合并已审和驳回，按时间排序
  const reviewedRecords = [...approvedRecords, ...rejectedRecords].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return <ReviewClient pendingRecords={pendingRecords} reviewedRecords={reviewedRecords} locale={locale} title={t('reviewPage')} />
}
