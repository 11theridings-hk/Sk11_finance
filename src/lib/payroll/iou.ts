import {
  buildMonthlyDueDates,
  roundHkd,
  splitEvenInstallments,
  type PayrollItemInput,
} from './calc';

export type IouInstallmentDraft = {
  periodIndex: number;
  dueDate: Date;
  amountHkd: number;
};

export function buildIouInstallmentDrafts(input: {
  totalAmountHkd: number;
  startDate: string | Date;
  splitMode: 'EVEN' | 'CUSTOM';
  periodCount?: number;
  customAmounts?: number[];
}): IouInstallmentDraft[] {
  const total = roundHkd(input.totalAmountHkd);
  if (total <= 0) throw new Error('借款總額必須大於 0');

  let amounts: number[];
  if (input.splitMode === 'CUSTOM') {
    amounts = (input.customAmounts || []).map((a) => roundHkd(a)).filter((a) => a > 0);
    if (amounts.length === 0) throw new Error('自訂分期至少一期金額 > 0');
    const sum = roundHkd(amounts.reduce((s, a) => s + a, 0));
    if (Math.abs(sum - total) > 0.02) {
      throw new Error(`自訂分期合計 ${sum.toFixed(2)} 與總額 ${total.toFixed(2)} 不符`);
    }
  } else {
    const n = Math.max(1, Math.floor(input.periodCount || 1));
    amounts = splitEvenInstallments(total, n);
  }

  const dates = buildMonthlyDueDates(input.startDate, amounts.length);
  return amounts.map((amountHkd, i) => ({
    periodIndex: i + 1,
    dueDate: dates[i],
    amountHkd,
  }));
}

export function iouInstallmentToPayrollLine(inst: {
  id: string;
  periodIndex: number;
  amountHkd: number;
  dueDate: Date | string;
}): PayrollItemInput {
  const due =
    inst.dueDate instanceof Date
      ? inst.dueDate.toISOString().slice(0, 10)
      : String(inst.dueDate).slice(0, 10);
  return {
    itemType: 'DEDUCTION',
    itemCode: 'IOU_REPAY',
    itemName: `預支／借款還款（第 ${inst.periodIndex} 期）`,
    sourceText: `iouInstallmentId=${inst.id}; due=${due}`,
    origin: 'IOU_AUTO',
    occurredOn: due,
    amountHkd: inst.amountHkd,
    sortOrder: 400 + inst.periodIndex,
  };
}

export function dueDateInPeriod(
  dueDate: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const t = dueDate.getTime();
  return t >= periodStart.getTime() && t <= periodEnd.getTime();
}
