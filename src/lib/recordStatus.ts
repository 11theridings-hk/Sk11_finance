import type { Locale } from '@/lib/i18n'

/** Public ledger record workflow statuses (string column on Record). */
export const RECORD_STATUS = {
  PENDING: 'PENDING',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const

export type RecordStatus = (typeof RECORD_STATUS)[keyof typeof RECORD_STATUS]

export function isPendingPayment(status: string | null | undefined) {
  return status === RECORD_STATUS.PENDING_PAYMENT
}

export function isFinalApproved(status: string | null | undefined) {
  return status === RECORD_STATUS.APPROVED
}

/** Label key mapping for UI / reports. */
export function recordStatusLabelKey(status: string | null | undefined):
  | 'pendingApproval'
  | 'pendingPayment'
  | 'approvedStored'
  | 'reviewerRejected'
  | 'status' {
  switch (status) {
    case RECORD_STATUS.PENDING:
      return 'pendingApproval'
    case RECORD_STATUS.PENDING_PAYMENT:
      return 'pendingPayment'
    case RECORD_STATUS.APPROVED:
      return 'approvedStored'
    case RECORD_STATUS.REJECTED:
      return 'reviewerRejected'
    default:
      return 'status'
  }
}

export function recordStatusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case RECORD_STATUS.PENDING:
      return 'bg-[#FF9500]/10 text-[#FF9500]'
    case RECORD_STATUS.PENDING_PAYMENT:
      return 'bg-[#5856D6]/10 text-[#5856D6]'
    case RECORD_STATUS.APPROVED:
      return 'bg-[#34C759]/10 text-[#34C759]'
    case RECORD_STATUS.REJECTED:
      return 'bg-[#FF3B30]/10 text-[#FF3B30]'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

export function paymentProofNote(locale: Locale) {
  return locale === 'en' ? 'Payment proof' : '支付憑證'
}
