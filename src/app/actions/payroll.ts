'use server';

import { getSession } from '@/app/actions/auth';
import prisma from '@/lib/prisma';
import {
  computePayroll,
  snapshotProfile,
  MEMBER_CLAIM_CODES,
  ITEM_CODE_META,
  summarizeQuantities,
  displayItemName,
  type PayrollAmountsInput,
  type PayrollItemInput,
  type UserProfileSnapshotInput,
} from '@/lib/payroll/calc';
import {
  generatePayslipPdf,
  generateFallbackEnPdf,
  type SystemSettingMap,
  type FontPack,
} from '@/lib/payroll/pdf';
import { appendPayrollAudit, summarizeItemChange } from '@/lib/payroll/audit';
import { buildIouInstallmentDrafts, dueDateInPeriod, iouInstallmentToPayrollLine } from '@/lib/payroll/iou';
import { pdfBytesToDataUrl, pdfBytesToPageImages } from '@/lib/payroll/pdfAttach';
import JSZip from 'jszip';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeContactPhoneInput,
  syncWhatsAppBindingForUser,
} from '@/lib/whatsapp/phoneSync';
import { normalizePayrollStatus, type PayrollStatus } from '@/lib/payroll/status';

export type { PayrollStatus };

export type SalaryCycleStatus = 'OPEN' | 'LOCKED' | 'SETTLED';
export type SalaryCycleType = 'MONTHLY' | 'SEMI_MONTHLY' | 'WEEKLY' | 'BI_WEEKLY' | 'ONE_OFF';

async function requireAdmin() {
  const s = await getSession();
  if (!s || !s.isAdmin) throw new Error('Admin permission required');
  return s;
}

async function requireSession() {
  const s = await getSession();
  if (!s) throw new Error('Authentication required');
  return s;
}

async function getCompanySettings(): Promise<SystemSettingMap> {
  const keys = ['COMPANY_NAME_ZH', 'COMPANY_NAME_EN', 'COMPANY_ADDRESS', 'COMPANY_PHONE'] as const;
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  return map as SystemSettingMap;
}

function ser<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function toYmd(s: unknown): string {
  if (s == null) return '';
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const prim = String(s);
  if (prim.length >= 10) return prim.slice(0, 10);
  try {
    const d = new Date(prim);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /* ignore */ }
  return prim;
}

function profileFromDb(u: {
  id: string;
  profile: UserProfileSnapshotInput | null;
}): UserProfileSnapshotInput {
  const baseSalary = u.profile?.defaultBaseSalaryHkd ?? 0;
  return {
    legalNameEn: u.profile?.legalNameEn ?? `User ${u.id.slice(-6)}`,
    legalNameZh: u.profile?.legalNameZh ?? null,
    hkid: u.profile?.hkid ?? null,
    passportNo: u.profile?.passportNo ?? null,
    dateOfBirth: u.profile?.dateOfBirth ?? null,
    jobTitle: u.profile?.jobTitle ?? null,
    department: u.profile?.department ?? null,
    dateJoined: u.profile?.dateJoined ?? null,
    bankName: u.profile?.bankName ?? null,
    bankAccountNo: u.profile?.bankAccountNo ?? null,
    mpfAccountNo: u.profile?.mpfAccountNo ?? null,
    addressLine1: u.profile?.addressLine1 ?? null,
    addressLine2: u.profile?.addressLine2 ?? null,
    contactPhone: u.profile?.contactPhone ?? null,
    contactEmail: u.profile?.contactEmail ?? null,
    defaultBaseSalaryHkd: baseSalary,
    annualLeaveDaysPerYear: u.profile?.annualLeaveDaysPerYear ?? 0,
  };
}

function itemCreateData(it: PayrollItemInput) {
  return {
    itemType: it.itemType,
    itemCode: it.itemCode,
    itemName: it.itemName,
    sourceText: it.sourceText || null,
    origin: it.origin || 'ADMIN',
    occurredOn: it.occurredOn ? new Date(String(it.occurredOn)) : null,
    unitCount: it.unitCount ?? null,
    unitRateHkd: it.unitRateHkd ?? null,
    amountHkd: it.amountHkd,
    sortOrder: it.sortOrder ?? 0,
  };
}

async function persistComputed(
  payrollId: string,
  computed: ReturnType<typeof computePayroll>,
  extra: Record<string, unknown> = {},
) {
  await prisma.$transaction(async (tx) => {
    await tx.payrollItem.deleteMany({ where: { payrollId } });
    await tx.payroll.update({
      where: { id: payrollId },
      data: {
        baseSalaryHkd: computed.baseSalaryHkd,
        overtimeHkd: computed.overtimeHkd,
        bonusHkd: computed.bonusHkd,
        commissionHkd: computed.commissionHkd,
        allowanceTotalHkd: computed.allowanceTotalHkd,
        deductionTotalHkd: computed.deductionTotalHkd,
        grossTotalHkd: computed.grossTotalHkd,
        netPayableHkd: computed.netPayableHkd,
        items: { create: computed.items.map(itemCreateData) },
        ...extra,
      },
    });
  });
}

async function applyPendingIouToPayroll(payrollId: string, actorUserId: string) {
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: {
      cycle: true,
      items: true,
    },
  });
  if (!p) return { applied: 0 };
  if (p.status !== 'DRAFT' && p.status !== 'REJECTED' && p.status !== 'PENDING_APPROVAL') {
    return { applied: 0 };
  }

  const pending = await prisma.salaryIouInstallment.findMany({
    where: {
      status: 'PENDING',
      iou: { userId: p.userId, status: 'ACTIVE' },
      dueDate: { gte: p.cycle.periodStart, lte: p.cycle.periodEnd },
    },
  });
  if (pending.length === 0) return { applied: 0 };

  const existingIouSources = new Set(
    p.items
      .filter((it) => it.itemCode === 'IOU_REPAY' && it.sourceText)
      .map((it) => it.sourceText as string),
  );

  const newLines: PayrollItemInput[] = [];
  const appliedIds: string[] = [];
  for (const inst of pending) {
    const line = iouInstallmentToPayrollLine(inst);
    if (line.sourceText && existingIouSources.has(line.sourceText)) continue;
    newLines.push(line);
    appliedIds.push(inst.id);
  }
  if (newLines.length === 0) return { applied: 0 };

  const keepLines: PayrollItemInput[] = p.items
    .filter((it) => it.itemCode !== 'BASE_SALARY')
    .map((it) => ({
      itemType: (it.itemType === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING') as 'EARNING' | 'DEDUCTION',
      itemCode: it.itemCode,
      itemName: it.itemName,
      sourceText: it.sourceText,
      origin: (it.origin as 'ADMIN' | 'MEMBER' | 'IOU_AUTO') || 'ADMIN',
      occurredOn: it.occurredOn,
      unitCount: it.unitCount,
      unitRateHkd: it.unitRateHkd,
      amountHkd: it.amountHkd,
      sortOrder: it.sortOrder,
    }));

  const computed = computePayroll({
    baseSalaryHkd: p.baseSalaryHkd,
    remark: p.remark,
    lines: [...keepLines, ...newLines],
  });
  await persistComputed(payrollId, computed, { revisedAt: new Date() });

  await prisma.salaryIouInstallment.updateMany({
    where: { id: { in: appliedIds } },
    data: { status: 'APPLIED', payrollId, appliedAt: new Date() },
  });

  // 若所有分期已套用，標記 IOU SETTLED
  const iouIds = [...new Set(pending.map((x) => x.iouId))];
  for (const iouId of iouIds) {
    const left = await prisma.salaryIouInstallment.count({
      where: { iouId, status: 'PENDING' },
    });
    if (left === 0) {
      await prisma.salaryIou.update({ where: { id: iouId }, data: { status: 'SETTLED' } });
    }
  }

  await appendPayrollAudit(payrollId, actorUserId, 'IOU_APPLY', `自動帶入 ${appliedIds.length} 期預支／借款還款`, {
    installmentIds: appliedIds,
  });
  return { applied: appliedIds.length };
}

// ---------- Salary Cycle (Admin) ----------
export async function createSalaryCycle(input: {
  cycleType: SalaryCycleType;
  periodStart: string;
  periodEnd: string;
  payrollDate: string;
  note?: string;
}) {
  const s = await requireAdmin();
  const cycle = await prisma.salaryCycle.create({
    data: {
      cycleType: input.cycleType || 'MONTHLY',
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      payrollDate: new Date(input.payrollDate),
      note: input.note || null,
      createdByUserId: s.userId,
    },
  });
  return { id: cycle.id };
}

export async function updateSalaryCycle(cycleId: string, patch: {
  status?: SalaryCycleStatus;
  note?: string;
  periodStart?: string;
  periodEnd?: string;
  payrollDate?: string;
}) {
  await requireAdmin();
  const data: Record<string, unknown> = {};
  if (patch.status) data.status = patch.status;
  if (patch.note !== undefined) data.note = patch.note || null;
  if (patch.periodStart) data.periodStart = new Date(patch.periodStart);
  if (patch.periodEnd) data.periodEnd = new Date(patch.periodEnd);
  if (patch.payrollDate) data.payrollDate = new Date(patch.payrollDate);
  const cycle = await prisma.salaryCycle.update({ where: { id: cycleId }, data });
  return ser(cycle);
}

export async function listSalaryCycles() {
  await requireSession();
  const rows = await prisma.salaryCycle.findMany({
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      cycleType: true,
      periodStart: true,
      periodEnd: true,
      payrollDate: true,
      status: true,
      note: true,
      headcountTotal: true,
      headcountConfirmed: true,
      headcountPaid: true,
      grossTotalHkd: true,
      deductionTotalHkd: true,
      netPayableTotalHkd: true,
      amountPaidTotalHkd: true,
      createdAt: true,
      payrolls: { select: { id: true, userId: true, status: true } },
    },
  });
  return ser(rows);
}

export async function refreshCycleStats(cycleId: string) {
  await requireAdmin();
  const agg = await prisma.payroll.groupBy({
    by: ['status'],
    where: { salaryCycleId: cycleId },
    _count: { _all: true },
    _sum: {
      grossTotalHkd: true,
      deductionTotalHkd: true,
      netPayableHkd: true,
    },
  });
  const totals = {
    headcountTotal: 0,
    headcountConfirmed: 0,
    headcountPaid: 0,
    grossTotalHkd: 0,
    deductionTotalHkd: 0,
    netPayableTotalHkd: 0,
    amountPaidTotalHkd: 0,
  };
  for (const r of agg) {
    const st = normalizePayrollStatus(r.status);
    totals.headcountTotal += r._count._all;
    if (st === 'PENDING_PAYMENT' || st === 'PAID' || st === 'CONFIRMED') {
      totals.headcountConfirmed += r._count._all;
    }
    if (st === 'PAID') {
      totals.headcountPaid += r._count._all;
      totals.amountPaidTotalHkd += r._sum.netPayableHkd ?? 0;
    }
    totals.grossTotalHkd += r._sum.grossTotalHkd ?? 0;
    totals.deductionTotalHkd += r._sum.deductionTotalHkd ?? 0;
    totals.netPayableTotalHkd += r._sum.netPayableHkd ?? 0;
  }
  await prisma.salaryCycle.update({
    where: { id: cycleId },
    data: totals,
  });
  return totals;
}

// ---------- User Profile ----------
export async function getMyProfile(userId: string) {
  const s = await requireSession();
  if (!s.isAdmin && s.userId !== userId) throw new Error('Forbidden');
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return ser(profile);
}

export type UserProfileSaveInput = UserProfileSnapshotInput & {
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  dateOfTermination?: Date | string | null;
};

export async function saveMyProfile(userId: string, profile: UserProfileSaveInput) {
  const s = await requireSession();
  if (!s.isAdmin && s.userId !== userId) throw new Error('Forbidden');
  if (!profile.legalNameEn || !profile.legalNameEn.trim()) {
    throw new Error('legalNameEn 為必填');
  }

  const phoneNorm = normalizeContactPhoneInput(profile.contactPhone);
  if (!phoneNorm.ok) throw new Error(phoneNorm.error);
  const contactPhone = phoneNorm.phoneE164;

  const existing = await prisma.userProfile.findUnique({ where: { userId } });

  // 受僱資料（職稱／部門／入職／離職／預設底薪／年假額度）僅管理員可改；成員儲存時保留原值
  const employment = s.isAdmin
    ? {
        jobTitle: profile.jobTitle || null,
        department: profile.department || null,
        dateJoined: profile.dateJoined ? new Date(profile.dateJoined as string) : null,
        dateOfTermination: profile.dateOfTermination
          ? new Date(profile.dateOfTermination as string)
          : null,
        defaultBaseSalaryHkd: profile.defaultBaseSalaryHkd ?? 0,
        annualLeaveDaysPerYear: profile.annualLeaveDaysPerYear ?? 0,
      }
    : {
        jobTitle: existing?.jobTitle ?? null,
        department: existing?.department ?? null,
        dateJoined: existing?.dateJoined ?? null,
        dateOfTermination: existing?.dateOfTermination ?? null,
        defaultBaseSalaryHkd: existing?.defaultBaseSalaryHkd ?? 0,
        annualLeaveDaysPerYear: existing?.annualLeaveDaysPerYear ?? 0,
      };

  const data = {
    legalNameEn: profile.legalNameEn,
    legalNameZh: profile.legalNameZh || null,
    hkid: profile.hkid || null,
    passportNo: profile.passportNo || null,
    dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth as string) : null,
    ...employment,
    bankName: profile.bankName || null,
    bankAccountNo: profile.bankAccountNo || null,
    mpfAccountNo: profile.mpfAccountNo || null,
    addressLine1: profile.addressLine1 || null,
    addressLine2: profile.addressLine2 || null,
    contactPhone,
    contactEmail: profile.contactEmail || null,
    emergencyName: profile.emergencyName || null,
    emergencyPhone: profile.emergencyPhone || null,
  };

  const saved = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  await syncWhatsAppBindingForUser(userId, contactPhone);
  return ser(saved);
}

export async function adminUpdateUserProfile(userId: string, profile: UserProfileSaveInput) {
  await requireAdmin();
  return saveMyProfile(userId, profile);
}

/** 年假額度／已用／餘額（曆年） */
export async function getAnnualLeaveBalance(userId: string, year?: number) {
  const s = await requireSession();
  if (!s.isAdmin && s.userId !== userId) throw new Error('Forbidden');
  const y = year ?? new Date().getFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const yearEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  const entitlement = Number(profile?.annualLeaveDaysPerYear) || 0;

  const items = await prisma.payrollItem.findMany({
    where: {
      itemCode: 'ANNUAL_LEAVE',
      payroll: {
        userId,
        cycle: {
          periodStart: { lte: yearEnd },
          periodEnd: { gte: yearStart },
        },
        status: { not: 'REJECTED' },
      },
    },
    select: { unitCount: true, amountHkd: true, payrollId: true },
  });
  const used = items.reduce((sum, it) => sum + (Number(it.unitCount) || 0), 0);
  const remaining = Math.max(0, entitlement - used);
  return {
    year: y,
    entitlementDays: entitlement,
    usedDays: Math.round((used + Number.EPSILON) * 100) / 100,
    remainingDays: Math.round((remaining + Number.EPSILON) * 100) / 100,
  };
}

// ---------- Payroll core ----------
export async function batchCreatePayrolls(cycleId: string, userIds: string[]) {
  const s = await requireAdmin();
  const cycle = await prisma.salaryCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new Error('Cycle not found');

  const usersWithProfile = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, profile: true },
  });
  if (usersWithProfile.length === 0) throw new Error('No users');

  const existing = await prisma.payroll.findMany({
    where: { salaryCycleId: cycleId, userId: { in: userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((e) => e.userId));

  const createdIds: string[] = [];
  for (const u of usersWithProfile) {
    if (existingSet.has(u.id)) continue;
    const profileSnapInput = profileFromDb(u);
    const snap = snapshotProfile(profileSnapInput);
    const baseSalary = profileSnapInput.defaultBaseSalaryHkd ?? 0;
    const computed = computePayroll({ baseSalaryHkd: baseSalary });

    const result = await prisma.payroll.create({
      data: {
        salaryCycleId: cycleId,
        userId: u.id,
        snapshotProfileJson: snap,
        baseSalaryHkd: computed.baseSalaryHkd,
        overtimeHkd: computed.overtimeHkd,
        bonusHkd: computed.bonusHkd,
        commissionHkd: computed.commissionHkd,
        allowanceTotalHkd: computed.allowanceTotalHkd,
        deductionTotalHkd: computed.deductionTotalHkd,
        grossTotalHkd: computed.grossTotalHkd,
        netPayableHkd: computed.netPayableHkd,
        status: 'DRAFT',
        items: { create: computed.items.map(itemCreateData) },
      },
    });
    createdIds.push(result.id);
    await appendPayrollAudit(result.id, s.userId, 'CREATE', '建立月度薪金單（草稿）', {
      baseSalaryHkd: baseSalary,
    });
    await applyPendingIouToPayroll(result.id, s.userId);
  }
  await refreshCycleStats(cycleId);
  return { created: createdIds, adminId: s.userId };
}

export async function updatePayrollAmounts(
  payrollId: string,
  amountsInput: PayrollAmountsInput & { adminNote?: string | null; remark?: string | null },
) {
  const s = await requireAdmin();
  const existing = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: { items: true },
  });
  if (!existing) throw new Error('Payroll not found');
  const st = normalizePayrollStatus(existing.status);
  if (st !== 'DRAFT' && st !== 'REJECTED' && st !== 'PENDING_APPROVAL') {
    throw new Error('僅草稿／待審批／已駁回可編輯');
  }

  const beforeItems = existing.items.map((it) => ({
    itemCode: it.itemCode,
    itemName: it.itemName,
    amountHkd: it.amountHkd,
  }));

  const computed = computePayroll(amountsInput);
  await persistComputed(payrollId, computed, {
    status: st === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : 'DRAFT',
    revisedAt: new Date(),
    employeeNote: st === 'REJECTED' ? null : existing.employeeNote,
    rejectedAt: st === 'REJECTED' ? null : existing.rejectedAt,
    adminNote: amountsInput.adminNote ?? existing.adminNote,
    remark: amountsInput.remark ?? existing.remark,
  });

  await appendPayrollAudit(payrollId, s.userId, 'EDIT_CHANGE', '管理員更新薪金明細', {
    before: beforeItems,
    after: computed.items.map((it) => ({
      itemCode: it.itemCode,
      itemName: it.itemName,
      amountHkd: it.amountHkd,
    })),
  });

  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { salaryCycleId: true } });
  if (p?.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return computed;
}

/** 成員上交申報 → 待審批 */
export async function submitPayrollForApproval(payrollId: string) {
  const s = await requireSession();
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    select: { status: true, salaryCycleId: true, userId: true },
  });
  if (!p) throw new Error('Payroll not found');
  if (!s.isAdmin && p.userId !== s.userId) throw new Error('Forbidden');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'DRAFT' && st !== 'REJECTED') throw new Error('僅草稿／已駁回可上交');

  await applyPendingIouToPayroll(payrollId, s.userId);

  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'PENDING_APPROVAL',
      submittedAt: new Date(),
      submittedByUserId: s.userId,
      rejectedAt: null,
    },
  });
  await appendPayrollAudit(payrollId, s.userId, 'SUBMIT', '上交薪金申報（待審批）');
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

/** 管理員審批通過 → 待確認（可同時帶入編輯後金額） */
export async function approvePayroll(
  payrollId: string,
  opts?: { amounts?: PayrollAmountsInput & { adminNote?: string | null; remark?: string | null } },
) {
  const s = await requireAdmin();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId } });
  if (!p) throw new Error('Payroll not found');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'PENDING_APPROVAL' && st !== 'DRAFT' && st !== 'REJECTED') {
    throw new Error('僅待審批／草稿／已駁回可審批送出');
  }

  if (opts?.amounts) {
    const computed = computePayroll(opts.amounts);
    await persistComputed(payrollId, computed, {
      adminNote: opts.amounts.adminNote ?? p.adminNote,
      remark: opts.amounts.remark ?? p.remark,
      revisedAt: new Date(),
    });
    await appendPayrollAudit(payrollId, s.userId, 'EDIT_CHANGE', '審批前調整明細', {
      netPayableHkd: computed.netPayableHkd,
    });
  }

  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'PENDING_CONFIRM',
      approvedAt: new Date(),
      approvedByUserId: s.userId,
      submittedAt: p.submittedAt || new Date(),
      submittedByUserId: p.submittedByUserId || s.userId,
      rejectedAt: null,
      employeeNote: null,
    },
  });
  await appendPayrollAudit(payrollId, s.userId, 'APPROVE', '審批通過（待成員確認）');
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

/** @deprecated 相容舊 UI：改呼叫 approvePayroll */
export async function submitPayrollForConfirmation(payrollId: string) {
  return approvePayroll(payrollId);
}

export async function batchSubmitPayrolls(payrollIds: string[]) {
  for (const id of payrollIds) {
    try { await approvePayroll(id); } catch (_e) { /* non-fatal */ }
  }
  return { ok: true };
}

export async function batchApprovePayrolls(payrollIds: string[]) {
  return batchSubmitPayrolls(payrollIds);
}

export async function withdrawPayroll(payrollId: string) {
  const s = await requireAdmin();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'PENDING_APPROVAL' && st !== 'PENDING_CONFIRM') {
    throw new Error('僅待審批／待確認可撤回');
  }
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'DRAFT',
      submittedAt: null,
      submittedByUserId: null,
      approvedAt: null,
      approvedByUserId: null,
      revisedAt: new Date(),
    },
  });
  await appendPayrollAudit(payrollId, s.userId, 'WITHDRAW', '撤回至草稿');
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

export async function adminRejectPayroll(payrollId: string, reason: string) {
  const s = await requireAdmin();
  if (!reason || reason.trim().length < 2) throw new Error('駁回理由至少 2 字');
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'PENDING_APPROVAL' && st !== 'PENDING_CONFIRM') {
    throw new Error('僅待審批／待確認可駁回');
  }
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
      adminNote: reason.trim(),
      approvedAt: null,
      approvedByUserId: null,
    },
  });
  await appendPayrollAudit(payrollId, s.userId, 'REJECT', `管理員駁回：${reason.trim()}`);
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

async function attachPayslipPdfAndImages(payrollId: string, actorUserId: string) {
  const { pdf } = await buildPdfForPayroll(payrollId, {
    isAdmin: true,
    sessionUserId: actorUserId,
    locale: 'zh',
  });

  // 清掉舊 PDF 頁面附件
  await prisma.attachment.deleteMany({ where: { payrollPdfId: payrollId } });

  const pdfAtt = pdfBytesToDataUrl(pdf);
  await prisma.attachment.create({
    data: {
      fileUrl: pdfAtt.dataUrl,
      size: pdfAtt.size,
      note: '薪金單 PDF',
      uploaderId: actorUserId,
      payrollPdfId: payrollId,
    },
  });

  let pageCount = 0;
  try {
    const rendered = await pdfBytesToPageImages(pdf);
    for (const page of rendered.pages) {
      await prisma.attachment.create({
        data: {
          fileUrl: page.dataUrl,
          size: page.size,
          note: page.note,
          uploaderId: actorUserId,
          payrollPdfId: payrollId,
        },
      });
      pageCount += 1;
    }
  } catch (e) {
    console.error('[attachPayslipPdfAndImages] PDF→image failed:', String(e));
  }

  await prisma.payroll.update({
    where: { id: payrollId },
    data: { pdfGeneratedAt: new Date() },
  });

  return { pageCount, pdfSize: pdfAtt.size };
}

export async function confirmPayroll(payrollId: string, employeeNote?: string) {
  const s = await requireSession();
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    select: { userId: true, status: true, salaryCycleId: true },
  });
  if (!p) throw new Error('Payroll not found');
  if (p.userId !== s.userId) throw new Error('Forbidden (not owner)');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'PENDING_CONFIRM') throw new Error('僅待確認狀態可確認');

  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'PENDING_PAYMENT',
      confirmedAt: new Date(),
      employeeNote: employeeNote || null,
    },
  });
  await appendPayrollAudit(payrollId, s.userId, 'CONFIRM', '成員確認薪金單（待付款）');

  try {
    const att = await attachPayslipPdfAndImages(payrollId, s.userId);
    await appendPayrollAudit(payrollId, s.userId, 'CONFIRM', `已附加薪金 PDF／頁面圖（${att.pageCount} 頁）`, att);
  } catch (e) {
    console.error('[confirmPayroll] attach pdf failed:', String(e));
    await appendPayrollAudit(payrollId, s.userId, 'CONFIRM', `PDF 附件失敗：${String(e).slice(0, 200)}`);
  }

  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

export async function rejectPayroll(payrollId: string, reason: string) {
  const s = await requireSession();
  if (!reason || reason.trim().length < 3) throw new Error('拒絕理由必須至少 3 字');
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    select: { userId: true, status: true, salaryCycleId: true },
  });
  if (!p) throw new Error('Payroll not found');
  if (p.userId !== s.userId) throw new Error('Forbidden');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'PENDING_CONFIRM') throw new Error('僅待確認可拒絕');
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: 'REJECTED', rejectedAt: new Date(), employeeNote: reason.trim() },
  });
  await appendPayrollAudit(payrollId, s.userId, 'REJECT', `成員拒絕：${reason.trim()}`);
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

export async function markPayrollPaid(payrollId: string, info: { paidAt?: string; paidReference?: string; paidAttachmentId?: string }) {
  const s = await requireAdmin();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'PENDING_PAYMENT' && st !== 'PAID' && st !== 'CONFIRMED') {
    throw new Error('僅待付款可標記完成');
  }
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status: 'PAID',
      paidAt: info.paidAt ? new Date(info.paidAt) : new Date(),
      paidByUserId: s.userId,
      paidReference: info.paidReference || null,
      paidAttachmentId: info.paidAttachmentId || null,
    },
  });
  await appendPayrollAudit(payrollId, s.userId, 'MARK_PAID', '標記已付款（完成）', {
    paidReference: info.paidReference || null,
  });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return ser(updated);
}

export async function deletePayroll(payrollId: string) {
  await requireAdmin();
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    select: { status: true, salaryCycleId: true },
  });
  if (!p) return {};
  const st = normalizePayrollStatus(p.status);
  if (st !== 'DRAFT' && st !== 'REJECTED') {
    throw new Error('僅草稿／已駁回可刪除');
  }
  // 解除 IOU 分期綁定
  await prisma.salaryIouInstallment.updateMany({
    where: { payrollId },
    data: { status: 'PENDING', payrollId: null, appliedAt: null },
  });
  await prisma.payroll.delete({ where: { id: payrollId } });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return { deleted: payrollId };
}

// ---------- Member self-report lines ----------
export async function addPayrollClaimLine(
  payrollId: string,
  line: {
    itemCode: string;
    occurredOn: string;
    unitCount?: number | null;
    unitRateHkd?: number | null;
    amountHkd: number;
    note?: string | null;
  },
) {
  const s = await requireSession();
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: { items: true },
  });
  if (!p) throw new Error('Payroll not found');
  if (!s.isAdmin && p.userId !== s.userId) throw new Error('Forbidden');
  const st = normalizePayrollStatus(p.status);
  const adminCanEditPending = s.isAdmin && st === 'PENDING_APPROVAL';
  if (st !== 'DRAFT' && st !== 'REJECTED' && !adminCanEditPending) {
    throw new Error('僅草稿／已駁回可新增申報');
  }

  const code = line.itemCode;
  if (!s.isAdmin && !(MEMBER_CLAIM_CODES as readonly string[]).includes(code)) {
    throw new Error('成員不可申報此項目類型');
  }
  const meta = ITEM_CODE_META[code] || { itemType: 'EARNING' as const, defaultName: code };
  if (meta.unitLabel && !(Number(line.unitCount) > 0)) {
    throw new Error(meta.unitLabel === 'hours' ? '請填寫加班時數' : '請填寫日數');
  }
  if (!line.occurredOn && meta.unitLabel) {
    throw new Error('請填寫發生日期');
  }

  const newLine: PayrollItemInput = {
    itemType: meta.itemType,
    itemCode: code,
    itemName: meta.defaultName,
    sourceText: line.note || undefined,
    origin: s.isAdmin ? 'ADMIN' : 'MEMBER',
    occurredOn: line.occurredOn,
    unitCount: line.unitCount ?? null,
    unitRateHkd: line.unitRateHkd ?? null,
    amountHkd: line.amountHkd,
    sortOrder: 50 + p.items.length,
  };

  const keep = p.items
    .filter((it) => it.itemCode !== 'BASE_SALARY')
    .map((it) => ({
      itemType: (it.itemType === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING') as 'EARNING' | 'DEDUCTION',
      itemCode: it.itemCode,
      itemName: it.itemName,
      sourceText: it.sourceText,
      origin: (it.origin as 'ADMIN' | 'MEMBER' | 'IOU_AUTO') || 'ADMIN',
      occurredOn: it.occurredOn,
      unitCount: it.unitCount,
      unitRateHkd: it.unitRateHkd,
      amountHkd: it.amountHkd,
      sortOrder: it.sortOrder,
    }));

  const computed = computePayroll({
    baseSalaryHkd: p.baseSalaryHkd,
    remark: p.remark,
    lines: [...keep, newLine],
  });
  await persistComputed(payrollId, computed, {
    revisedAt: new Date(),
    status: adminCanEditPending ? 'PENDING_APPROVAL' : 'DRAFT',
  });
  await appendPayrollAudit(
    payrollId,
    s.userId,
    'EDIT_ADD',
    summarizeItemChange(null, { itemCode: newLine.itemCode, itemName: newLine.itemName, amountHkd: newLine.amountHkd }),
    { line: newLine },
  );
  return computed;
}

export async function removePayrollClaimLine(payrollId: string, itemId: string) {
  const s = await requireSession();
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: { items: true },
  });
  if (!p) throw new Error('Payroll not found');
  if (!s.isAdmin && p.userId !== s.userId) throw new Error('Forbidden');
  const st = normalizePayrollStatus(p.status);
  if (st !== 'DRAFT' && st !== 'REJECTED' && !(s.isAdmin && st === 'PENDING_APPROVAL')) {
    throw new Error('目前狀態不可刪除項目');
  }

  const target = p.items.find((it) => it.id === itemId);
  if (!target) throw new Error('項目不存在');
  if (target.itemCode === 'BASE_SALARY') throw new Error('不可刪除底薪');
  if (!s.isAdmin && target.origin === 'IOU_AUTO') throw new Error('不可刪除自動還款項');
  if (!s.isAdmin && target.origin === 'ADMIN') throw new Error('不可刪除管理員項目');

  const keep = p.items
    .filter((it) => it.id !== itemId && it.itemCode !== 'BASE_SALARY')
    .map((it) => ({
      itemType: (it.itemType === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING') as 'EARNING' | 'DEDUCTION',
      itemCode: it.itemCode,
      itemName: it.itemName,
      sourceText: it.sourceText,
      origin: (it.origin as 'ADMIN' | 'MEMBER' | 'IOU_AUTO') || 'ADMIN',
      occurredOn: it.occurredOn,
      unitCount: it.unitCount,
      unitRateHkd: it.unitRateHkd,
      amountHkd: it.amountHkd,
      sortOrder: it.sortOrder,
    }));

  const computed = computePayroll({
    baseSalaryHkd: p.baseSalaryHkd,
    remark: p.remark,
    lines: keep,
  });
  await persistComputed(payrollId, computed, { revisedAt: new Date() });
  await appendPayrollAudit(
    payrollId,
    s.userId,
    'EDIT_REMOVE',
    summarizeItemChange(
      { itemCode: target.itemCode, itemName: target.itemName, amountHkd: target.amountHkd },
      null,
    ),
  );
  return computed;
}

export async function addAdminPayrollLine(
  payrollId: string,
  line: {
    itemCode: string;
    occurredOn?: string | null;
    unitCount?: number | null;
    amountHkd: number;
    note?: string | null;
    itemName?: string | null;
  },
) {
  await requireAdmin();
  const meta = ITEM_CODE_META[line.itemCode] || { itemType: 'EARNING' as const, defaultName: line.itemCode };
  return addPayrollClaimLine(payrollId, {
    itemCode: line.itemCode,
    occurredOn: line.occurredOn || new Date().toISOString().slice(0, 10),
    unitCount: line.unitCount,
    amountHkd: line.amountHkd,
    note: line.note || line.itemName || meta.defaultName,
  });
}

// ---------- IOU ----------
export async function createSalaryIou(input: {
  userId: string;
  totalAmountHkd: number;
  startDate: string;
  note?: string;
  splitMode: 'EVEN' | 'CUSTOM';
  periodCount?: number;
  customAmounts?: number[];
}) {
  const s = await requireAdmin();
  const drafts = buildIouInstallmentDrafts(input);
  const iou = await prisma.salaryIou.create({
    data: {
      userId: input.userId,
      totalAmountHkd: input.totalAmountHkd,
      startDate: new Date(input.startDate),
      note: input.note || null,
      splitMode: input.splitMode,
      createdByUserId: s.userId,
      installments: {
        create: drafts.map((d) => ({
          periodIndex: d.periodIndex,
          dueDate: d.dueDate,
          amountHkd: d.amountHkd,
          status: 'PENDING',
        })),
      },
    },
    include: { installments: { orderBy: { periodIndex: 'asc' } } },
  });

  // 若已有涵蓋 dueDate 的草稿／待審批薪金單，立即帶入
  const openPayrolls = await prisma.payroll.findMany({
    where: {
      userId: input.userId,
      status: { in: ['DRAFT', 'REJECTED', 'PENDING_APPROVAL'] },
    },
    include: { cycle: true },
  });
  for (const p of openPayrolls) {
    const hit = drafts.some((d) => dueDateInPeriod(d.dueDate, p.cycle.periodStart, p.cycle.periodEnd));
    if (hit) await applyPendingIouToPayroll(p.id, s.userId);
  }

  return ser(iou);
}

export async function listSalaryIous(userId?: string) {
  await requireAdmin();
  const rows = await prisma.salaryIou.findMany({
    where: userId ? { userId } : undefined,
    orderBy: [{ createdAt: 'desc' }],
    include: {
      user: { select: { id: true, roleName: true, profile: { select: { legalNameZh: true, legalNameEn: true } } } },
      installments: { orderBy: { periodIndex: 'asc' } },
    },
    take: 200,
  });
  return ser(rows);
}

export async function cancelSalaryIou(iouId: string) {
  const s = await requireAdmin();
  const iou = await prisma.salaryIou.findUnique({
    where: { id: iouId },
    include: { installments: true },
  });
  if (!iou) throw new Error('IOU not found');
  const applied = iou.installments.filter((i) => i.status === 'APPLIED');
  if (applied.length > 0) {
    throw new Error('已有分期套入薪金單，無法取消（請改略過未套用期）');
  }
  await prisma.salaryIouInstallment.updateMany({
    where: { iouId, status: 'PENDING' },
    data: { status: 'SKIPPED' },
  });
  const updated = await prisma.salaryIou.update({
    where: { id: iouId },
    data: { status: 'CANCELLED' },
  });
  void s;
  return ser(updated);
}

export async function syncIouIntoPayroll(payrollId: string) {
  const s = await requireAdmin();
  const result = await applyPendingIouToPayroll(payrollId, s.userId);
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { salaryCycleId: true } });
  if (p?.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return result;
}

// ---------- Queries ----------
export type AdminPayrollQuery = {
  salaryCycleId?: string;
  userId?: string;
  status?: PayrollStatus[];
  department?: string;
  jobTitle?: string;
  periodStartGte?: string;
  periodEndLte?: string;
  searchKeyword?: string;
};

function expandStatusFilter(statuses?: PayrollStatus[]): string[] | undefined {
  if (!statuses || statuses.length === 0) return undefined;
  const set = new Set<string>();
  for (const s of statuses) {
    set.add(s);
    if (s === 'PENDING_CONFIRM') set.add('SUBMITTED');
    if (s === 'PENDING_PAYMENT') set.add('CONFIRMED');
    if (s === 'SUBMITTED') set.add('PENDING_CONFIRM');
    if (s === 'CONFIRMED') set.add('PENDING_PAYMENT');
  }
  return [...set];
}

export async function adminListPayrolls(q: AdminPayrollQuery) {
  const s = await requireAdmin();
  void s;
  const where: Record<string, unknown> = {};
  if (q.salaryCycleId) where.salaryCycleId = q.salaryCycleId;
  if (q.userId) where.userId = q.userId;
  const statusIn = expandStatusFilter(q.status);
  if (statusIn) where.status = { in: statusIn };
  if (q.periodStartGte || q.periodEndLte) {
    where.cycle = {} as Record<string, unknown>;
    if (q.periodStartGte) (where.cycle as Record<string, unknown>).periodStart = { gte: new Date(q.periodStartGte) };
    if (q.periodEndLte) (where.cycle as Record<string, unknown>).periodEnd = { lte: new Date(q.periodEndLte) };
  }
  const rows = await prisma.payroll.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
    include: {
      user: { select: { id: true, roleName: true } },
      cycle: { select: { id: true, cycleType: true, periodStart: true, periodEnd: true, payrollDate: true, status: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      auditLogs: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { roleName: true, profile: { select: { legalNameZh: true, legalNameEn: true } } } } },
      },
      pdfAttachments: { select: { id: true, fileUrl: true, size: true, note: true, createdAt: true } },
    },
  });
  const kw = q.searchKeyword?.trim().toLowerCase();
  const filtered = kw
    ? rows.filter((r) => {
        const snap = r.snapshotProfileJson as unknown as { legalNameEn?: string; legalNameZh?: string; department?: string; jobTitle?: string };
        const hay = [
          snap.legalNameEn, snap.legalNameZh, snap.department, snap.jobTitle,
          (r as unknown as { paidReference?: string }).paidReference,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(kw);
      })
    : rows;

  const normRows = filtered.map((r) => ({
    ...r,
    status: normalizePayrollStatus(r.status),
  }));

  const stats = {
    count: normRows.length,
    grossTotalHkd: normRows.reduce((sum, r) => sum + r.grossTotalHkd, 0),
    deductionTotalHkd: normRows.reduce((sum, r) => sum + r.deductionTotalHkd, 0),
    netTotalHkd: normRows.reduce((sum, r) => sum + r.netPayableHkd, 0),
    countConfirmed: normRows.filter((r) => r.status === 'PENDING_PAYMENT' || r.status === 'PAID').length,
    countPaid: normRows.filter((r) => r.status === 'PAID').length,
    amountPaidHkd: normRows.filter((r) => r.status === 'PAID').reduce((sum, r) => sum + r.netPayableHkd, 0),
    countPendingApproval: normRows.filter((r) => r.status === 'PENDING_APPROVAL').length,
    countPendingConfirm: normRows.filter((r) => r.status === 'PENDING_CONFIRM').length,
    countPendingPayment: normRows.filter((r) => r.status === 'PENDING_PAYMENT').length,
  };
  return JSON.parse(JSON.stringify({ rows: normRows, stats }));
}

export async function listMyPayrolls(userId: string) {
  const s = await requireSession();
  if (!s.isAdmin && s.userId !== userId) throw new Error('Forbidden');
  const rows = await prisma.payroll.findMany({
    where: { userId },
    orderBy: [{ cycle: { periodStart: 'desc' } }],
    include: {
      cycle: { select: { id: true, cycleType: true, periodStart: true, periodEnd: true, payrollDate: true, status: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      auditLogs: { orderBy: { createdAt: 'asc' }, take: 100 },
      pdfAttachments: { select: { id: true, fileUrl: true, size: true, note: true, createdAt: true } },
    },
    take: 200,
  });
  return JSON.parse(JSON.stringify(rows.map((r) => ({ ...r, status: normalizePayrollStatus(r.status) }))));
}

export async function getPayrollAuditLogs(payrollId: string) {
  const s = await requireSession();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { userId: true } });
  if (!p) throw new Error('Payroll not found');
  if (!s.isAdmin && p.userId !== s.userId) throw new Error('Forbidden');
  const logs = await prisma.payrollAuditLog.findMany({
    where: { payrollId },
    orderBy: { createdAt: 'asc' },
    include: {
      actor: { select: { roleName: true, profile: { select: { legalNameZh: true, legalNameEn: true } } } },
    },
  });
  return ser(logs);
}

// ---------- PDF ----------
async function loadCJKFontPackRailwaySafe(): Promise<FontPack> {
  const candidates = [
    join(process.cwd(), 'public', 'fonts'),
    join(process.cwd(), '.next', 'standalone', 'public', 'fonts'),
    join(process.cwd(), '..', 'public', 'fonts'),
  ];
  const tryFs = (fname: string): Uint8Array | null => {
    for (const d of candidates) {
      try {
        const p = join(d, fname);
        if (existsSync(p)) return new Uint8Array(readFileSync(p));
      } catch { /* ignore */ }
    }
    return null;
  };
  const r1 = tryFs('NotoSansSC-Regular.ttf');
  const b1 = tryFs('msyh.ttf');
  if (r1) {
    return {
      regular: r1,
      bold: b1 || r1,
      regularFamily: 'NotoSansSC',
      boldFamily: b1 ? 'MSYaHei' : 'NotoSansSC',
      cjkAvailable: true,
    };
  }
  const baseUrls = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.RAILWAY_STATIC_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
  ].filter(Boolean) as string[];
  for (const base of baseUrls) {
    try {
      const u = base.endsWith('/') ? base.slice(0, -1) : base;
      const resp = await fetch(`${u}/fonts/NotoSansSC-Regular.ttf`, {
        cache: 'force-cache',
        headers: { Accept: 'font/ttf' },
      });
      if (resp.ok && resp.body) {
        const buf = new Uint8Array(await resp.arrayBuffer());
        let boldBuf: Uint8Array | null = null;
        try {
          const resp2 = await fetch(`${u}/fonts/msyh.ttf`, { cache: 'force-cache' });
          if (resp2.ok) boldBuf = new Uint8Array(await resp2.arrayBuffer());
        } catch { /* ignore */ }
        return {
          regular: buf,
          bold: boldBuf || buf,
          regularFamily: 'NotoSansSC',
          boldFamily: boldBuf ? 'MSYaHei' : 'NotoSansSC',
          cjkAvailable: true,
        };
      }
    } catch (_e) { /* try next */ }
  }
  return { regular: null, bold: null, regularFamily: 'helvetica', boldFamily: 'helvetica', cjkAvailable: false };
}

async function buildPdfForPayroll(payrollId: string, { isAdmin, sessionUserId, locale = 'bilingual' }: { isAdmin: boolean; sessionUserId: string; locale?: 'bilingual' | 'zh' | 'en' }) {
  let p: any = null;
  let company: SystemSettingMap = {};
  try {
    p = await prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        cycle: true,
        items: { orderBy: { sortOrder: 'asc' } },
        submittedBy: { select: { profile: { select: { legalNameEn: true, legalNameZh: true } } } },
      },
    });
  } catch (e) {
    throw new Error(`Prisma findUnique failed: ${String(e)}`);
  }
  if (!p) throw new Error('Payroll not found');
  if (!isAdmin && p.userId !== sessionUserId) throw new Error('Forbidden');
  const st = normalizePayrollStatus(p.status);
  if (st === 'DRAFT' || st === 'REJECTED') {
    if (!isAdmin) throw new Error('Payroll not available yet (DRAFT/REJECTED)');
  }
  try {
    company = await getCompanySettings();
  } catch (_e) { /* keep empty defaults */ }
  const pdfGeneratedAt = p.pdfGeneratedAt || new Date();
  const profileInput = (p.snapshotProfileJson ?? {}) as any;
  // 年假額度優先用最新受僱資料，其次 snapshot
  let liveEntitlement: number | null = null;
  try {
    const liveProfile = await prisma.userProfile.findUnique({
      where: { userId: p.userId },
      select: { annualLeaveDaysPerYear: true },
    });
    if (liveProfile?.annualLeaveDaysPerYear != null) {
      liveEntitlement = Number(liveProfile.annualLeaveDaysPerYear) || 0;
    }
  } catch { /* ignore */ }

  const profile = snapshotProfile({
    legalNameEn: profileInput?.legalNameEn ?? p.userId?.slice(0, 8) ?? 'User',
    legalNameZh: profileInput?.legalNameZh ?? null,
    hkid: profileInput?.hkid ?? null,
    passportNo: profileInput?.passportNo ?? null,
    dateOfBirth: profileInput?.dateOfBirth ?? null,
    jobTitle: profileInput?.jobTitle ?? null,
    department: profileInput?.department ?? null,
    dateJoined: profileInput?.dateJoined ?? null,
    defaultBaseSalaryHkd: profileInput?.defaultBaseSalaryHkd ?? 0,
    annualLeaveDaysPerYear:
      liveEntitlement ?? profileInput?.annualLeaveDaysPerYear ?? 0,
    bankName: profileInput?.bankName ?? null,
    bankAccountNo: profileInput?.bankAccountNo ?? null,
    mpfAccountNo: profileInput?.mpfAccountNo ?? null,
    addressLine1: profileInput?.addressLine1 ?? null,
    addressLine2: profileInput?.addressLine2 ?? null,
    contactPhone: profileInput?.contactPhone ?? null,
    contactEmail: profileInput?.contactEmail ?? null,
  });

  const qtySummary = summarizeQuantities(
    (p.items ?? []).map((it: any) => ({
      itemType: (it.itemType as any) === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING',
      itemCode: String(it.itemCode ?? ''),
      itemName: displayItemName(String(it.itemCode ?? ''), it.itemName),
      amountHkd: Number(it.amountHkd) || 0,
      unitCount: it.unitCount == null ? null : Number(it.unitCount),
    })),
  );

  let annualLeaveYtd = { year: new Date().getFullYear(), entitlementDays: 0, usedDays: 0, remainingDays: 0 };
  try {
    const periodEnd =
      p.cycle.periodEnd instanceof Date ? p.cycle.periodEnd : new Date(String(p.cycle.periodEnd));
    const y = periodEnd.getUTCFullYear();
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    const ytdItems = await prisma.payrollItem.findMany({
      where: {
        itemCode: 'ANNUAL_LEAVE',
        payroll: {
          userId: p.userId,
          cycle: { periodStart: { lte: yearEnd }, periodEnd: { gte: yearStart } },
          status: { not: 'REJECTED' },
        },
      },
      select: { unitCount: true },
    });
    const used = ytdItems.reduce((s, it) => s + (Number(it.unitCount) || 0), 0);
    const entitlement = Number(profile.annualLeaveDaysPerYear) || 0;
    annualLeaveYtd = {
      year: y,
      entitlementDays: entitlement,
      usedDays: Math.round((used + Number.EPSILON) * 100) / 100,
      remainingDays: Math.max(0, Math.round((entitlement - used + Number.EPSILON) * 100) / 100),
    };
  } catch { /* ignore */ }

  const pdfInput: Parameters<typeof generatePayslipPdf>[0] = {
    company,
    profile,
    payroll: {
      id: p.id,
      periodStart: p.cycle.periodStart instanceof Date ? p.cycle.periodStart : new Date(String(p.cycle.periodStart)),
      periodEnd: p.cycle.periodEnd instanceof Date ? p.cycle.periodEnd : new Date(String(p.cycle.periodEnd)),
      payrollDate: p.cycle.payrollDate instanceof Date ? p.cycle.payrollDate : new Date(String(p.cycle.payrollDate)),
      currency: p.currency || 'HKD',
      baseSalaryHkd: Number(p.baseSalaryHkd) || 0,
      overtimeHkd: Number(p.overtimeHkd) || 0,
      bonusHkd: Number(p.bonusHkd) || 0,
      commissionHkd: Number(p.commissionHkd) || 0,
      allowanceTotalHkd: Number(p.allowanceTotalHkd) || 0,
      deductionTotalHkd: Number(p.deductionTotalHkd) || 0,
      grossTotalHkd: Number(p.grossTotalHkd) || 0,
      netPayableHkd: Math.max(0, Number(p.netPayableHkd) || 0),
      submittedAt: p.submittedAt ? (p.submittedAt instanceof Date ? p.submittedAt : new Date(String(p.submittedAt))) : null,
      confirmedAt: p.confirmedAt ? (p.confirmedAt instanceof Date ? p.confirmedAt : new Date(String(p.confirmedAt))) : null,
      paidAt: p.paidAt ? (p.paidAt instanceof Date ? p.paidAt : new Date(String(p.paidAt))) : null,
      pdfGeneratedAt,
      adminNote: p.adminNote ?? p.remark ?? null,
    },
    items: (p.items ?? []).map((it: any) => ({
      itemType: (it.itemType as any) === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING',
      itemCode: String(it.itemCode ?? ''),
      itemName: displayItemName(String(it.itemCode ?? ''), it.itemName),
      amountHkd: Number(it.amountHkd) || 0,
      sourceText: it.sourceText ?? null,
      unitCount: it.unitCount == null ? null : Number(it.unitCount),
      occurredOn: it.occurredOn
        ? it.occurredOn instanceof Date
          ? it.occurredOn.toISOString().slice(0, 10)
          : String(it.occurredOn).slice(0, 10)
        : null,
    })),
    quantitySummary: qtySummary,
    annualLeaveBalance: annualLeaveYtd,
    submittedBy: p.submittedBy?.profile ?? null,
    cycleNote: p.cycle?.note ?? null,
  };
  let pdf: Uint8Array;
  let fontPack: FontPack | null = null;
  try {
    fontPack = await loadCJKFontPackRailwaySafe();
  } catch (e) {
    console.error('[buildPdfForPayroll] fontPack load error:', String(e));
    fontPack = null;
  }
  try {
    pdf = generatePayslipPdf(pdfInput, fontPack, locale);
  } catch (e) {
    const msg = String(e);
    console.error('[buildPdfForPayroll] generatePayslipPdf threw; using generateFallbackEnPdf:', msg);
    pdf = generateFallbackEnPdf(pdfInput, msg, locale === 'en' ? 'en' : 'bilingual');
  }
  return { pdf, payroll: p };
}

export async function downloadPayrollPdf(payrollId: string, locale: 'bilingual' | 'zh' | 'en' = 'bilingual'): Promise<{
  filename: string; bytes: Uint8Array;
}> {
  const s = await requireSession();
  const { pdf, payroll } = await buildPdfForPayroll(payrollId, { isAdmin: !!s.isAdmin, sessionUserId: s.userId, locale });
  if (!payroll.pdfGeneratedAt) {
    await prisma.payroll.update({ where: { id: payrollId }, data: { pdfGeneratedAt: new Date() } });
  }
  const ps = payroll.cycle.periodStart instanceof Date
    ? payroll.cycle.periodStart
    : new Date(String(payroll.cycle.periodStart));
  const periodLabel = `${ps.getFullYear()}${String(ps.getMonth() + 1).padStart(2, '0')}`;
  const snap = payroll.snapshotProfileJson as unknown as { legalNameEn?: string };
  const name = (snap.legalNameEn || String(payroll.userId).slice(-6)).replace(/\s+/g, '_');
  const localeSuffix = locale === 'zh' ? '_中文' : locale === 'en' ? '_EN' : '_Bilingual';
  return {
    filename: `Payslip_${periodLabel}_${name}_${String(payrollId).slice(-6)}${localeSuffix}.pdf`,
    bytes: pdf,
  };
}

export async function batchDownloadPdfZip(payrollIds: string[], locale: 'bilingual' | 'zh' | 'en' = 'bilingual'): Promise<{ filename: string; bytes: Uint8Array }> {
  const s = await requireAdmin();
  void s;
  const zip = new JSZip();
  for (const id of payrollIds) {
    try {
      const { filename, bytes } = await downloadPayrollPdf(id, locale);
      zip.file(filename, bytes);
    } catch (_e) { /* skip */ }
  }
  const content = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 10);
  const localeSuffix = locale === 'zh' ? '_中文' : locale === 'en' ? '_EN' : '_Bilingual';
  return {
    filename: `Payslip_Batch_${stamp}_${payrollIds.length}${localeSuffix}.zip`,
    bytes: content,
  };
}

export async function exportPayrollsCsv(q: AdminPayrollQuery): Promise<{ filename: string; bytes: Uint8Array }> {
  const { rows } = await adminListPayrolls(q);
  const header = [
    'PayrollId', 'CyclePeriod', 'PayrollDate', 'User', 'Status',
    'Base', 'Overtime', 'Bonus', 'Commission',
    'AllowanceTotal', 'DeductionTotal', 'Gross', 'Net',
    'ConfirmedAt', 'PaidAt', 'PaidRef', 'AdminNote',
  ];
  const esc = (x: unknown) => {
    const str = x == null ? '' : String(x);
    if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };
  const safeFix = (n: unknown) => (Number.isFinite(n as number) ? Number(n) : 0).toFixed(2);
  const lines = [header.join(',')];
  for (const r of rows) {
    const snap = r.snapshotProfileJson as unknown as { legalNameEn?: string; legalNameZh?: string };
    const who = [snap.legalNameZh, snap.legalNameEn].filter(Boolean).join('/') || String(r.userId);
    lines.push([
      r.id,
      `${toYmd(r.cycle.periodStart)}~${toYmd(r.cycle.periodEnd)}`,
      toYmd(r.cycle.payrollDate),
      esc(who),
      r.status,
      safeFix(r.baseSalaryHkd),
      safeFix(r.overtimeHkd),
      safeFix(r.bonusHkd),
      safeFix(r.commissionHkd),
      safeFix(r.allowanceTotalHkd),
      safeFix(r.deductionTotalHkd),
      safeFix(r.grossTotalHkd),
      safeFix(r.netPayableHkd),
      toYmd((r as unknown as { confirmedAt?: unknown }).confirmedAt),
      toYmd((r as unknown as { paidAt?: unknown }).paidAt),
      esc((r as unknown as { paidReference?: string }).paidReference ?? ''),
      esc((r as unknown as { adminNote?: string }).adminNote ?? ''),
    ].join(','));
  }
  const bom = '\uFEFF';
  const body = bom + lines.join('\n');
  const enc = new TextEncoder();
  const bytes = enc.encode(body);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `Payroll_Export_${stamp}.csv`,
    bytes,
  };
}
