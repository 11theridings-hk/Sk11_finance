import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type PayrollAuditAction =
  | 'CREATE'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'EDIT_ADD'
  | 'EDIT_REMOVE'
  | 'EDIT_CHANGE'
  | 'CONFIRM'
  | 'MARK_PAID'
  | 'WITHDRAW'
  | 'IOU_APPLY'
  | 'REBUILD';

export async function appendPayrollAudit(
  payrollId: string,
  actorUserId: string,
  action: PayrollAuditAction,
  summary: string,
  detail?: Record<string, unknown> | null,
) {
  return prisma.payrollAuditLog.create({
    data: {
      payrollId,
      actorUserId,
      action,
      summary,
      detailJson: (detail ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export function summarizeItemChange(
  before: { itemCode: string; itemName: string; amountHkd: number } | null,
  after: { itemCode: string; itemName: string; amountHkd: number } | null,
): string {
  if (!before && after) {
    return `新增 ${after.itemName}（${after.itemCode}）HKD ${after.amountHkd.toFixed(2)}`;
  }
  if (before && !after) {
    return `移除 ${before.itemName}（${before.itemCode}）HKD ${before.amountHkd.toFixed(2)}`;
  }
  if (before && after) {
    return `改動 ${after.itemName}：${before.amountHkd.toFixed(2)} → ${after.amountHkd.toFixed(2)}`;
  }
  return '項目變更';
}
