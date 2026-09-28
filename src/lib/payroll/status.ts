export type PayrollStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'PENDING_CONFIRM'
  | 'CONFIRMED'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'REJECTED';

/** 正規化舊狀態 → 新流程狀態 */
export function normalizePayrollStatus(s: string): PayrollStatus {
  if (s === 'SUBMITTED') return 'PENDING_CONFIRM';
  if (s === 'CONFIRMED') return 'PENDING_PAYMENT';
  return s as PayrollStatus;
}
