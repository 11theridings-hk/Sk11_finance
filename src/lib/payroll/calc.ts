/** 簡化薪金計算：底薪 + 明細加減項（加班／補假／請假／獎金／IOU 等） */

export type PayrollLineOrigin = 'ADMIN' | 'MEMBER' | 'IOU_AUTO';

export type PayrollItemCode =
  | 'BASE_SALARY'
  | 'OVERTIME'
  | 'COMP_LEAVE'
  | 'LEAVE'
  | 'STATUTORY_HOLIDAY'
  | 'ANNUAL_LEAVE'
  | 'BONUS'
  | 'BONUS_ANNUAL'
  | 'COMMISSION'
  | 'ALLOWANCE'
  | 'IOU_REPAY'
  | 'REMARK'
  | 'OTHER_EARNING'
  | 'OTHER_DEDUCTION';

export type PayrollItemInput = {
  id?: string;
  itemType: 'EARNING' | 'DEDUCTION';
  itemCode: string;
  itemName: string;
  sourceText?: string | null;
  origin?: PayrollLineOrigin;
  occurredOn?: string | Date | null;
  unitCount?: number | null;
  unitRateHkd?: number | null;
  amountHkd: number;
  sortOrder?: number;
};

export type PayrollAmountsInput = {
  baseSalaryHkd: number;
  /** @deprecated 相容舊呼叫；改由 lines 承載 */
  overtimeHkd?: number;
  bonusHkd?: number;
  commissionHkd?: number;
  remark?: string | null;
  lines?: PayrollItemInput[];
  allowanceItems?: PayrollItemInput[];
  deductionItems?: PayrollItemInput[];
};

export type ComputedPayroll = {
  baseSalaryHkd: number;
  overtimeHkd: number;
  bonusHkd: number;
  commissionHkd: number;
  allowanceTotalHkd: number;
  deductionTotalHkd: number;
  grossTotalHkd: number;
  netPayableHkd: number;
  allowanceTotalBeforeCapHkd: number;
  allowanceCapHit: boolean;
  netFloorHit: boolean;
  items: PayrollItemInput[];
};

export const ITEM_CODE_META: Record<
  string,
  { itemType: 'EARNING' | 'DEDUCTION'; defaultName: string; unitLabel?: 'hours' | 'days' }
> = {
  BASE_SALARY: { itemType: 'EARNING', defaultName: '基本底薪' },
  OVERTIME: { itemType: 'EARNING', defaultName: '加班', unitLabel: 'hours' },
  COMP_LEAVE: { itemType: 'EARNING', defaultName: '補假', unitLabel: 'days' },
  LEAVE: { itemType: 'DEDUCTION', defaultName: '請假', unitLabel: 'days' },
  STATUTORY_HOLIDAY: { itemType: 'EARNING', defaultName: '例假', unitLabel: 'days' },
  ANNUAL_LEAVE: { itemType: 'EARNING', defaultName: '年假', unitLabel: 'days' },
  BONUS: { itemType: 'EARNING', defaultName: '獎金' },
  BONUS_ANNUAL: { itemType: 'EARNING', defaultName: '獎金 / 花紅' },
  COMMISSION: { itemType: 'EARNING', defaultName: '佣金' },
  ALLOWANCE: { itemType: 'EARNING', defaultName: '津貼' },
  IOU_REPAY: { itemType: 'DEDUCTION', defaultName: '預支／借款還款' },
  REMARK: { itemType: 'EARNING', defaultName: '備註' },
  OTHER_EARNING: { itemType: 'EARNING', defaultName: '其他收入' },
  OTHER_DEDUCTION: { itemType: 'DEDUCTION', defaultName: '其他扣除' },
};

/** 成員可自助申報的項目代碼 */
export const MEMBER_CLAIM_CODES = [
  'OVERTIME',
  'COMP_LEAVE',
  'LEAVE',
  'STATUTORY_HOLIDAY',
  'ANNUAL_LEAVE',
] as const;

export function roundHkd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toIsoDay(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normalizeLine(it: PayrollItemInput, fallbackSort: number): PayrollItemInput {
  const meta = ITEM_CODE_META[it.itemCode];
  const itemType = it.itemType || meta?.itemType || 'EARNING';
  // 舊標籤「大假」升級為「年假」
  const rawName = it.itemName || meta?.defaultName || it.itemCode;
  const itemName =
    it.itemCode === 'ANNUAL_LEAVE' || rawName === '大假'
      ? ITEM_CODE_META.ANNUAL_LEAVE.defaultName
      : rawName;
  return {
    ...it,
    itemType,
    itemName,
    origin: it.origin || 'ADMIN',
    occurredOn: toIsoDay(it.occurredOn as string | Date | null) || null,
    amountHkd: roundHkd(it.amountHkd || 0),
    unitCount: it.unitCount == null ? null : Number(it.unitCount),
    unitRateHkd: it.unitRateHkd == null ? null : roundHkd(Number(it.unitRateHkd)),
    sortOrder: it.sortOrder ?? fallbackSort,
  };
}

/**
 * 由底薪 + 明細行計算應發淨額。
 * 不再套用津貼 30% cap；淨額下限仍為 max(0, net)。
 */
export function computePayroll(input: PayrollAmountsInput): ComputedPayroll {
  const baseSalaryHkd = roundHkd(input.baseSalaryHkd || 0);

  const fromLines = (input.lines || []).map((it, i) => normalizeLine(it, 10 + i));
  const legacyAllow = (input.allowanceItems || []).map((it, i) =>
    normalizeLine({ ...it, itemType: 'EARNING' }, 100 + i),
  );
  const legacyDeduct = (input.deductionItems || []).map((it, i) =>
    normalizeLine({ ...it, itemType: 'DEDUCTION' }, 300 + i),
  );

  // 相容舊 scalar 欄位
  const legacyScalars: PayrollItemInput[] = [];
  if ((input.overtimeHkd || 0) > 0 && !fromLines.some((l) => l.itemCode === 'OVERTIME')) {
    legacyScalars.push(
      normalizeLine(
        {
          itemType: 'EARNING',
          itemCode: 'OVERTIME',
          itemName: '加班',
          amountHkd: input.overtimeHkd || 0,
          origin: 'ADMIN',
        },
        1,
      ),
    );
  }
  if ((input.bonusHkd || 0) > 0 && !fromLines.some((l) => l.itemCode === 'BONUS' || l.itemCode === 'BONUS_ANNUAL')) {
    legacyScalars.push(
      normalizeLine(
        {
          itemType: 'EARNING',
          itemCode: 'BONUS',
          itemName: '獎金',
          amountHkd: input.bonusHkd || 0,
          origin: 'ADMIN',
        },
        2,
      ),
    );
  }
  if ((input.commissionHkd || 0) > 0 && !fromLines.some((l) => l.itemCode === 'COMMISSION')) {
    legacyScalars.push(
      normalizeLine(
        {
          itemType: 'EARNING',
          itemCode: 'COMMISSION',
          itemName: '佣金',
          amountHkd: input.commissionHkd || 0,
          origin: 'ADMIN',
        },
        3,
      ),
    );
  }

  const detailLines = [...fromLines, ...legacyScalars, ...legacyAllow, ...legacyDeduct].filter(
    (l) => l.itemCode !== 'BASE_SALARY' && l.itemCode !== 'REMARK',
  );

  const overtimeHkd = roundHkd(
    detailLines.filter((l) => l.itemCode === 'OVERTIME').reduce((s, l) => s + l.amountHkd, 0),
  );
  const bonusHkd = roundHkd(
    detailLines
      .filter((l) => l.itemCode === 'BONUS' || l.itemCode === 'BONUS_ANNUAL')
      .reduce((s, l) => s + l.amountHkd, 0),
  );
  const commissionHkd = roundHkd(
    detailLines.filter((l) => l.itemCode === 'COMMISSION').reduce((s, l) => s + l.amountHkd, 0),
  );

  const earningExtra = roundHkd(
    detailLines.filter((l) => l.itemType === 'EARNING').reduce((s, l) => s + l.amountHkd, 0),
  );
  const deductionTotalHkd = roundHkd(
    detailLines.filter((l) => l.itemType === 'DEDUCTION').reduce((s, l) => s + l.amountHkd, 0),
  );

  // allowanceTotal = 非 OT/bonus/commission 的 earning 明細（兼容舊欄位語意）
  const allowanceTotalHkd = roundHkd(
    detailLines
      .filter(
        (l) =>
          l.itemType === 'EARNING' &&
          !['OVERTIME', 'BONUS', 'BONUS_ANNUAL', 'COMMISSION'].includes(l.itemCode),
      )
      .reduce((s, l) => s + l.amountHkd, 0),
  );

  const grossTotalHkd = roundHkd(baseSalaryHkd + earningExtra);
  const netBeforeFloor = roundHkd(grossTotalHkd - deductionTotalHkd);
  const netFloorHit = netBeforeFloor < 0;
  const netPayableHkd = Math.max(0, netBeforeFloor);

  const baseItem: PayrollItemInput = {
    itemType: 'EARNING',
    itemCode: 'BASE_SALARY',
    itemName: '基本底薪',
    sourceText: baseSalaryHkd > 0 ? `基本底薪 HKD ${baseSalaryHkd.toFixed(2)}` : undefined,
    origin: 'ADMIN',
    amountHkd: baseSalaryHkd,
    sortOrder: 0,
  };

  const items = [baseItem, ...detailLines]
    .map((it, i) => ({ ...it, sortOrder: it.sortOrder ?? i }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return {
    baseSalaryHkd,
    overtimeHkd,
    bonusHkd,
    commissionHkd,
    allowanceTotalHkd,
    deductionTotalHkd,
    grossTotalHkd,
    netPayableHkd,
    allowanceTotalBeforeCapHkd: allowanceTotalHkd,
    allowanceCapHit: false,
    netFloorHit,
    items,
  };
}

/** @deprecated 已取消津貼 cap；保留常數以免舊引用炸掉 */
export const RULE_ALLOWANCE_CAP_RATIO = 0.3;

export type UserProfileSnapshotInput = {
  legalNameEn: string;
  legalNameZh?: string | null;
  hkid?: string | null;
  passportNo?: string | null;
  dateOfBirth?: Date | string | null;
  jobTitle?: string | null;
  department?: string | null;
  dateJoined?: Date | string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  mpfAccountNo?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  defaultBaseSalaryHkd?: number | null;
  annualLeaveDaysPerYear?: number | null;
};

export function snapshotProfile(p: UserProfileSnapshotInput) {
  const formatDate = (d: Date | string | null | undefined) =>
    d ? (typeof d === 'string' ? d : new Date(d).toISOString()) : null;
  const mask = (s: string | null | undefined, visibleLast = 4) => {
    if (!s) return null;
    if (s.length <= visibleLast) return 'X'.repeat(s.length);
    return 'X'.repeat(s.length - visibleLast) + s.slice(s.length - visibleLast);
  };
  return {
    legalNameEn: p.legalNameEn,
    legalNameZh: p.legalNameZh ?? null,
    hkidMasked: mask(p.hkid ?? null),
    passportNoMasked: mask(p.passportNo ?? null),
    dateOfBirthIso: formatDate(p.dateOfBirth),
    jobTitle: p.jobTitle ?? null,
    department: p.department ?? null,
    dateJoinedIso: formatDate(p.dateJoined),
    bankName: p.bankName ?? null,
    bankAccountNoLast4: mask(p.bankAccountNo ?? null, 4),
    mpfAccountNoMasked: mask(p.mpfAccountNo ?? null),
    addressLine1: p.addressLine1 ?? null,
    addressLine2: p.addressLine2 ?? null,
    contactPhone: p.contactPhone ?? null,
    contactEmail: p.contactEmail ?? null,
    defaultBaseSalaryHkd: p.defaultBaseSalaryHkd ?? null,
    annualLeaveDaysPerYear: p.annualLeaveDaysPerYear ?? null,
    snapshotTakenAtIso: new Date().toISOString(),
  };
}

/** 數量型項目代碼（加班＝時數；請假／補假／例假／年假＝日數） */
export const QUANTITY_ITEM_CODES = [
  'OVERTIME',
  'COMP_LEAVE',
  'LEAVE',
  'STATUTORY_HOLIDAY',
  'ANNUAL_LEAVE',
] as const;

export function itemNeedsQuantity(itemCode: string): boolean {
  return (QUANTITY_ITEM_CODES as readonly string[]).includes(itemCode);
}

export function unitLabelForCode(itemCode: string): 'hours' | 'days' | null {
  return ITEM_CODE_META[itemCode]?.unitLabel ?? null;
}

/** 顯示用：舊資料「大假」統一顯示為「年假」 */
export function displayItemName(itemCode: string, itemName?: string | null): string {
  if (itemCode === 'ANNUAL_LEAVE') return ITEM_CODE_META.ANNUAL_LEAVE.defaultName;
  return itemName || ITEM_CODE_META[itemCode]?.defaultName || itemCode;
}

/** 彙總明細數量（加班時數、請假日數、年假日數等） */
export function summarizeQuantities(items: PayrollItemInput[]): {
  overtimeHours: number;
  leaveDays: number;
  compLeaveDays: number;
  statutoryHolidayDays: number;
  annualLeaveDays: number;
  totalLeaveRelatedDays: number;
} {
  const sum = (code: string) =>
    roundHkd(
      items.filter((i) => i.itemCode === code).reduce((s, i) => s + (Number(i.unitCount) || 0), 0),
    );
  const overtimeHours = sum('OVERTIME');
  const leaveDays = sum('LEAVE');
  const compLeaveDays = sum('COMP_LEAVE');
  const statutoryHolidayDays = sum('STATUTORY_HOLIDAY');
  const annualLeaveDays = sum('ANNUAL_LEAVE');
  return {
    overtimeHours,
    leaveDays,
    compLeaveDays,
    statutoryHolidayDays,
    annualLeaveDays,
    totalLeaveRelatedDays: roundHkd(leaveDays + compLeaveDays + statutoryHolidayDays + annualLeaveDays),
  };
}

export type SnapshotProfile = ReturnType<typeof snapshotProfile>;

/** 平均拆期：回傳每期金額（最後一期吃尾差） */
export function splitEvenInstallments(totalAmountHkd: number, periods: number): number[] {
  const n = Math.max(1, Math.floor(periods));
  const total = roundHkd(totalAmountHkd);
  const each = roundHkd(total / n);
  const amounts: number[] = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      amounts.push(roundHkd(total - allocated));
    } else {
      amounts.push(each);
      allocated = roundHkd(allocated + each);
    }
  }
  return amounts;
}

/** 由起始日產生每月 dueDate（當月同日，不足則月底） */
export function buildMonthlyDueDates(startDate: Date | string, periods: number): Date[] {
  const start = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate.getTime());
  const n = Math.max(1, Math.floor(periods));
  const dates: Date[] = [];
  const day = start.getUTCDate();
  for (let i = 0; i < n; i++) {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const year = y + Math.floor(m / 12);
    const month = m % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    dates.push(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
  }
  return dates;
}
