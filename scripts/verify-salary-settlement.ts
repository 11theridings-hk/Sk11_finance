/**
 * Code-only verification for salary settlement simplify (no DB / login).
 * Run: npx tsx scripts/verify-salary-settlement.ts
 */
import {
  computePayroll,
  splitEvenInstallments,
  buildMonthlyDueDates,
  roundHkd,
  summarizeQuantities,
  displayItemName,
  ITEM_CODE_META,
  itemNeedsQuantity,
} from '../src/lib/payroll/calc';
import { buildIouInstallmentDrafts, iouInstallmentToPayrollLine } from '../src/lib/payroll/iou';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

// 1) Base + overtime + leave + bonus + IOU
{
  const r = computePayroll({
    baseSalaryHkd: 20000,
    lines: [
      { itemType: 'EARNING', itemCode: 'OVERTIME', itemName: '加班', occurredOn: '2026-09-10', unitCount: 4, amountHkd: 800, origin: 'MEMBER' },
      { itemType: 'EARNING', itemCode: 'COMP_LEAVE', itemName: '補假', occurredOn: '2026-09-12', unitCount: 1, amountHkd: 0, origin: 'MEMBER' },
      { itemType: 'DEDUCTION', itemCode: 'LEAVE', itemName: '請假', occurredOn: '2026-09-15', unitCount: 1, amountHkd: 500, origin: 'MEMBER' },
      { itemType: 'EARNING', itemCode: 'BONUS', itemName: '獎金', amountHkd: 1000, origin: 'ADMIN' },
      { itemType: 'DEDUCTION', itemCode: 'IOU_REPAY', itemName: '還款', amountHkd: 2000, origin: 'IOU_AUTO' },
    ],
  });
  assert(r.baseSalaryHkd === 20000, 'base salary');
  assert(r.overtimeHkd === 800, 'overtime aggregate');
  assert(r.bonusHkd === 1000, 'bonus aggregate');
  assert(r.deductionTotalHkd === 2500, 'deductions 500+2000');
  assert(r.grossTotalHkd === 21800, 'gross = 20000+800+0+1000');
  assert(r.netPayableHkd === 19300, 'net = 21800-2500');
  assert(r.items.some((i) => i.itemCode === 'BASE_SALARY'), 'has base item');
  assert(!r.allowanceCapHit, 'no allowance cap');
}

// 2) Net floor
{
  const r = computePayroll({
    baseSalaryHkd: 100,
    lines: [{ itemType: 'DEDUCTION', itemCode: 'LEAVE', itemName: '請假', amountHkd: 500 }],
  });
  assert(r.netPayableHkd === 0, 'net floor at 0');
  assert(r.netFloorHit, 'net floor hit flag');
}

// 3) Even installments + due dates
{
  const amounts = splitEvenInstallments(1000, 3);
  assert(amounts.length === 3, '3 periods');
  assert(roundHkd(amounts.reduce((s, a) => s + a, 0)) === 1000, 'even sum = total');
  const dates = buildMonthlyDueDates('2026-01-31', 3);
  assert(dates.length === 3, '3 due dates');
  assert(dates[0].toISOString().slice(0, 10) === '2026-01-31', 'jan 31');
  assert(dates[1].toISOString().slice(0, 10) === '2026-02-28', 'feb clamped');
}

// 4) IOU drafts EVEN / CUSTOM
{
  const even = buildIouInstallmentDrafts({
    totalAmountHkd: 3000,
    startDate: '2026-09-01',
    splitMode: 'EVEN',
    periodCount: 3,
  });
  assert(even.length === 3 && even[0].amountHkd === 1000, 'even 3x1000');
  const custom = buildIouInstallmentDrafts({
    totalAmountHkd: 3500,
    startDate: '2026-09-01',
    splitMode: 'CUSTOM',
    customAmounts: [1000, 1500, 1000],
  });
  assert(custom.length === 3 && custom[1].amountHkd === 1500, 'custom amounts');
  const line = iouInstallmentToPayrollLine({
    id: 'inst1',
    periodIndex: 1,
    amountHkd: 1000,
    dueDate: new Date('2026-09-01'),
  });
  assert(line.itemCode === 'IOU_REPAY' && line.origin === 'IOU_AUTO', 'iou line meta');
}

// 5) Status normalize (inline mirror)
{
  const normalize = (s: string) => {
    if (s === 'SUBMITTED') return 'PENDING_CONFIRM';
    if (s === 'CONFIRMED') return 'PENDING_PAYMENT';
    return s;
  };
  assert(normalize('SUBMITTED') === 'PENDING_CONFIRM', 'status remap submitted');
  assert(normalize('CONFIRMED') === 'PENDING_PAYMENT', 'status remap confirmed');
  assert(normalize('PENDING_APPROVAL') === 'PENDING_APPROVAL', 'status pending approval passthrough');
}

// 6) Quantity summary + 年假 rename
{
  assert(ITEM_CODE_META.ANNUAL_LEAVE.defaultName === '年假', 'ANNUAL_LEAVE label = 年假');
  assert(displayItemName('ANNUAL_LEAVE', '大假') === '年假', 'legacy 大假 → 年假');
  assert(itemNeedsQuantity('OVERTIME') && itemNeedsQuantity('ANNUAL_LEAVE'), 'qty required codes');
  assert(!itemNeedsQuantity('BONUS'), 'bonus no qty');

  const r = computePayroll({
    baseSalaryHkd: 18000,
    lines: [
      { itemType: 'EARNING', itemCode: 'OVERTIME', itemName: '加班', unitCount: 6, amountHkd: 900, origin: 'MEMBER' },
      { itemType: 'EARNING', itemCode: 'ANNUAL_LEAVE', itemName: '大假', unitCount: 2, amountHkd: 0, origin: 'MEMBER' },
      { itemType: 'DEDUCTION', itemCode: 'LEAVE', itemName: '請假', unitCount: 0.5, amountHkd: 300, origin: 'MEMBER' },
    ],
  });
  const annual = r.items.find((i) => i.itemCode === 'ANNUAL_LEAVE');
  assert(!!annual && annual.itemName === '年假', 'normalize upgrades 大假 name');
  assert(annual!.unitCount === 2, 'annual leave unitCount persisted');
  const q = summarizeQuantities(r.items);
  assert(q.overtimeHours === 6, 'OT hours sum');
  assert(q.annualLeaveDays === 2, 'annual leave days sum');
  assert(q.leaveDays === 0.5, 'leave days sum');
  assert(q.totalLeaveRelatedDays === 2.5, 'total leave-related days');
}

console.log('\nAll salary-settlement verify checks passed.');
