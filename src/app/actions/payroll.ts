'use server';

import { getSession } from '@/app/actions/auth';
import prisma from '@/lib/prisma';
import {
  computePayroll,
  snapshotProfile,
  type PayrollAmountsInput,
  type UserProfileSnapshotInput,
} from '@/lib/payroll/calc';
import {
  generatePayslipPdf,
  type SystemSettingMap,
} from '@/lib/payroll/pdf';
import JSZip from 'jszip';

export type PayrollStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'PAID' | 'REJECTED';
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
      cycleType: input.cycleType,
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
  return cycle;
}

export async function listSalaryCycles() {
  await requireSession();
  return prisma.salaryCycle.findMany({
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
    totals.headcountTotal += r._count._all;
    if (r.status === 'CONFIRMED' || r.status === 'PAID') totals.headcountConfirmed += r._count._all;
    if (r.status === 'PAID') {
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
  return prisma.userProfile.findUnique({ where: { userId } });
}

export async function saveMyProfile(userId: string, profile: UserProfileSnapshotInput & { emergencyName?: string | null; emergencyPhone?: string | null }) {
  const s = await requireSession();
  if (!s.isAdmin && s.userId !== userId) throw new Error('Forbidden');
  if (!profile.legalNameEn || !profile.legalNameEn.trim()) {
    throw new Error('legalNameEn 為必填');
  }
  return prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      legalNameEn: profile.legalNameEn,
      legalNameZh: profile.legalNameZh || null,
      hkid: profile.hkid || null,
      passportNo: profile.passportNo || null,
      dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth as string) : null,
      jobTitle: profile.jobTitle || null,
      department: profile.department || null,
      dateJoined: profile.dateJoined ? new Date(profile.dateJoined as string) : null,
      defaultBaseSalaryHkd: profile.defaultBaseSalaryHkd ?? 0,
      bankName: profile.bankName || null,
      bankAccountNo: profile.bankAccountNo || null,
      mpfAccountNo: profile.mpfAccountNo || null,
      addressLine1: profile.addressLine1 || null,
      addressLine2: profile.addressLine2 || null,
      contactPhone: profile.contactPhone || null,
      contactEmail: profile.contactEmail || null,
      emergencyName: profile.emergencyName || null,
      emergencyPhone: profile.emergencyPhone || null,
    },
    update: {
      legalNameEn: profile.legalNameEn,
      legalNameZh: profile.legalNameZh || null,
      hkid: profile.hkid || null,
      passportNo: profile.passportNo || null,
      dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth as string) : null,
      jobTitle: profile.jobTitle || null,
      department: profile.department || null,
      dateJoined: profile.dateJoined ? new Date(profile.dateJoined as string) : null,
      defaultBaseSalaryHkd: profile.defaultBaseSalaryHkd ?? 0,
      bankName: profile.bankName || null,
      bankAccountNo: profile.bankAccountNo || null,
      mpfAccountNo: profile.mpfAccountNo || null,
      addressLine1: profile.addressLine1 || null,
      addressLine2: profile.addressLine2 || null,
      contactPhone: profile.contactPhone || null,
      contactEmail: profile.contactEmail || null,
      emergencyName: profile.emergencyName || null,
      emergencyPhone: profile.emergencyPhone || null,
    },
  });
}

// ---------- Payroll (Admin core) ----------
export async function batchCreatePayrolls(cycleId: string, userIds: string[]) {
  const s = await requireAdmin();
  const usersWithProfile = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      profile: true,
    },
  });
  if (usersWithProfile.length === 0) throw new Error('No users');

  const createdIds: string[] = [];
  for (const u of usersWithProfile) {
    const baseSalary = u.profile?.defaultBaseSalaryHkd ?? 0;
    const profileSnapInput: UserProfileSnapshotInput = {
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
    };
    const snap = snapshotProfile(profileSnapInput);
    const amounts: PayrollAmountsInput = { baseSalaryHkd: baseSalary };
    const computed = computePayroll(amounts);

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
        items: {
          create: computed.items.map((it) => ({
            itemType: it.itemType,
            itemCode: it.itemCode,
            itemName: it.itemName,
            sourceText: it.sourceText || null,
            unitCount: it.unitCount ?? null,
            unitRateHkd: it.unitRateHkd ?? null,
            amountHkd: it.amountHkd,
            sortOrder: it.sortOrder ?? 0,
          })),
        },
      },
    });
    createdIds.push(result.id);
  }
  await refreshCycleStats(cycleId);
  return { created: createdIds, adminId: s.userId };
}

export async function updatePayrollAmounts(payrollId: string, amountsInput: PayrollAmountsInput & { adminNote?: string | null }) {
  await requireAdmin();
  const existing = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, userId: true } });
  if (!existing) throw new Error('Payroll not found');
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw new Error('Only DRAFT / REJECTED payroll can be updated');
  }
  const computed = computePayroll(amountsInput);
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
        status: 'DRAFT',
        revisedAt: new Date(),
        employeeNote: null,
        rejectedAt: null,
        adminNote: amountsInput.adminNote ?? undefined,
        items: {
          create: computed.items.map((it) => ({
            itemType: it.itemType,
            itemCode: it.itemCode,
            itemName: it.itemName,
            sourceText: it.sourceText || null,
            unitCount: it.unitCount ?? null,
            unitRateHkd: it.unitRateHkd ?? null,
            amountHkd: it.amountHkd,
            sortOrder: it.sortOrder ?? 0,
          })),
        },
      },
    });
  });
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { salaryCycleId: true } });
  if (p?.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return computed;
}

export async function submitPayrollForConfirmation(payrollId: string) {
  const s = await requireAdmin();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  if (p.status !== 'DRAFT' && p.status !== 'REJECTED') throw new Error('Only DRAFT/REJECTED can be submitted');
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: 'SUBMITTED', submittedAt: new Date(), submittedByUserId: s.userId, rejectedAt: null, employeeNote: null },
  });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return updated;
}

export async function batchSubmitPayrolls(payrollIds: string[]) {
  for (const id of payrollIds) {
    try { await submitPayrollForConfirmation(id); } catch (_e) { /* non-fatal for batch */ }
  }
  return { ok: true };
}

export async function withdrawPayroll(payrollId: string) {
  await requireAdmin();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  if (p.status !== 'SUBMITTED') throw new Error('Only SUBMITTED can be withdrawn');
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: 'DRAFT', submittedAt: null, submittedByUserId: null, revisedAt: new Date() },
  });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return updated;
}

export async function confirmPayroll(payrollId: string, employeeNote?: string) {
  const s = await requireSession();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { userId: true, status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  if (p.userId !== s.userId) throw new Error('Forbidden (not owner)');
  if (p.status !== 'SUBMITTED') throw new Error('Only SUBMITTED can be confirmed');
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), employeeNote: employeeNote || null },
  });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return updated;
}

export async function rejectPayroll(payrollId: string, reason: string) {
  const s = await requireSession();
  if (!reason || reason.trim().length < 3) throw new Error('拒絕理由必須至少 3 字');
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { userId: true, status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  if (p.userId !== s.userId) throw new Error('Forbidden');
  if (p.status !== 'SUBMITTED') throw new Error('Only SUBMITTED can be rejected');
  const updated = await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: 'REJECTED', rejectedAt: new Date(), employeeNote: reason.trim() },
  });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return updated;
}

export async function markPayrollPaid(payrollId: string, info: { paidAt?: string; paidReference?: string; paidAttachmentId?: string }) {
  const s = await requireAdmin();
  const p = await prisma.payroll.findUnique({ where: { id: payrollId }, select: { status: true, salaryCycleId: true } });
  if (!p) throw new Error('Payroll not found');
  if (p.status !== 'CONFIRMED' && p.status !== 'PAID') throw new Error('Only CONFIRMED can be marked paid');
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
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return updated;
}

export async function deletePayroll(payrollId: string) {
  await requireAdmin();
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    select: { status: true, salaryCycleId: true },
  });
  if (!p) return {};
  if (p.status === 'SUBMITTED' || p.status === 'CONFIRMED' || p.status === 'PAID') {
    throw new Error('Only DRAFT / REJECTED can be deleted');
  }
  await prisma.payroll.delete({ where: { id: payrollId } });
  if (p.salaryCycleId) await refreshCycleStats(p.salaryCycleId);
  return { deleted: payrollId };
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

export async function adminListPayrolls(q: AdminPayrollQuery) {
  const s = await requireAdmin();
  void s;
  const where: Record<string, unknown> = {};
  if (q.salaryCycleId) where.salaryCycleId = q.salaryCycleId;
  if (q.userId) where.userId = q.userId;
  if (q.status && q.status.length) where.status = { in: q.status };
  if (q.periodStartGte || q.periodEndLte) {
    where.cycle = {} as Record<string, unknown>;
    if (q.periodStartGte) (where.cycle as Record<string, unknown>).periodStart = { gte: new Date(q.periodStartGte) };
    if (q.periodEndLte) (where.cycle as Record<string, unknown>).periodEnd = { lte: new Date(q.periodEndLte) };
  }
  if (q.department || q.jobTitle) {
    // Use snapshotProfileJson path
    const snapshotFilter: Record<string, unknown> = {};
    if (q.department) snapshotFilter['department'] = q.department;
    if (q.jobTitle) snapshotFilter['jobTitle'] = q.jobTitle;
    where.snapshotProfileJson = { equals: snapshotFilter };
  }
  const rows = await prisma.payroll.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
    include: {
      user: { select: { id: true, roleName: true } },
      cycle: { select: { id: true, cycleType: true, periodStart: true, periodEnd: true, payrollDate: true, status: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  });
  // keyword search (in-memory after retrieval)
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
  const stats = {
    count: filtered.length,
    grossTotalHkd: filtered.reduce((s, r) => s + r.grossTotalHkd, 0),
    deductionTotalHkd: filtered.reduce((s, r) => s + r.deductionTotalHkd, 0),
    netTotalHkd: filtered.reduce((s, r) => s + r.netPayableHkd, 0),
    countConfirmed: filtered.filter((r) => r.status === 'CONFIRMED' || r.status === 'PAID').length,
    countPaid: filtered.filter((r) => r.status === 'PAID').length,
    amountPaidHkd: filtered.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.netPayableHkd, 0),
  };
  return { rows: filtered, stats };
}

export async function listMyPayrolls(userId: string) {
  const s = await requireSession();
  if (!s.isAdmin && s.userId !== userId) throw new Error('Forbidden');
  return prisma.payroll.findMany({
    where: { userId },
    orderBy: [{ cycle: { periodStart: 'desc' } }],
    include: {
      cycle: { select: { id: true, cycleType: true, periodStart: true, periodEnd: true, payrollDate: true, status: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
    take: 200,
  });
}

// ---------- PDF ----------
async function buildPdfForPayroll(payrollId: string, { isAdmin, sessionUserId }: { isAdmin: boolean; sessionUserId: string }) {
  const p = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: {
      cycle: true,
      items: { orderBy: { sortOrder: 'asc' } },
      submittedBy: { select: { profile: { select: { legalNameEn: true, legalNameZh: true } } } },
    },
  });
  if (!p) throw new Error('Payroll not found');
  if (!isAdmin && p.userId !== sessionUserId) throw new Error('Forbidden');
  if (p.status === 'DRAFT' || p.status === 'REJECTED') {
    // only admins can preview before confirmation; users must wait SUBMITTED
    if (!isAdmin) throw new Error('Payroll not available yet (DRAFT/REJECTED)');
  }
  const company = await getCompanySettings();
  const pdfGeneratedAt = p.pdfGeneratedAt || new Date();
  const pdf = generatePayslipPdf({
    company,
    profile: p.snapshotProfileJson as unknown as Parameters<typeof snapshotProfile>[0] extends never ? never : ReturnType<typeof snapshotProfile>,
    payroll: {
      id: p.id,
      periodStart: p.cycle.periodStart,
      periodEnd: p.cycle.periodEnd,
      payrollDate: p.cycle.payrollDate,
      currency: p.currency,
      baseSalaryHkd: p.baseSalaryHkd,
      overtimeHkd: p.overtimeHkd,
      bonusHkd: p.bonusHkd,
      commissionHkd: p.commissionHkd,
      allowanceTotalHkd: p.allowanceTotalHkd,
      deductionTotalHkd: p.deductionTotalHkd,
      grossTotalHkd: p.grossTotalHkd,
      netPayableHkd: p.netPayableHkd,
      submittedAt: p.submittedAt,
      confirmedAt: p.confirmedAt,
      paidAt: p.paidAt,
      pdfGeneratedAt,
      adminNote: p.adminNote,
    },
    items: p.items.map((it) => ({
      itemType: it.itemType as 'EARNING' | 'DEDUCTION',
      itemCode: it.itemCode,
      itemName: it.itemName,
      amountHkd: it.amountHkd,
      sourceText: it.sourceText,
    })),
    submittedBy: p.submittedBy?.profile ?? null,
    cycleNote: p.cycle.note,
  });
  return { pdf, payroll: p };
}

export async function downloadPayrollPdf(payrollId: string): Promise<{
  filename: string; bytes: Uint8Array;
}> {
  const s = await requireSession();
  const { pdf, payroll } = await buildPdfForPayroll(payrollId, { isAdmin: !!s.isAdmin, sessionUserId: s.userId });
  // If first time generating, also set pdfGeneratedAt (not attachment; for statelessness we don't persist binary to attachment).
  if (!payroll.pdfGeneratedAt) {
    await prisma.payroll.update({ where: { id: payrollId }, data: { pdfGeneratedAt: new Date() } });
  }
  const periodLabel = `${payroll.cycle.periodStart.getFullYear()}${String(payroll.cycle.periodStart.getMonth()+1).padStart(2,'0')}`;
  const snap = payroll.snapshotProfileJson as unknown as { legalNameEn?: string };
  const name = (snap.legalNameEn || payroll.userId.slice(-6)).replace(/\s+/g, '_');
  return {
    filename: `Payslip_${periodLabel}_${name}_${payrollId.slice(-6)}.pdf`,
    bytes: pdf,
  };
}

export async function batchDownloadPdfZip(payrollIds: string[]): Promise<{ filename: string; bytes: Uint8Array }> {
  const s = await requireAdmin();
  void s;
  const zip = new JSZip();
  for (const id of payrollIds) {
    try {
      const { filename, bytes } = await downloadPayrollPdf(id);
      zip.file(filename, bytes);
    } catch (_e) {
      /* skip individually failed */
    }
  }
  const content = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `Payslip_Batch_${stamp}_${payrollIds.length}.zip`,
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
    const s = x == null ? '' : String(x);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    const snap = r.snapshotProfileJson as unknown as { legalNameEn?: string; legalNameZh?: string };
    const who = [snap.legalNameZh, snap.legalNameEn].filter(Boolean).join('/') || r.userId;
    lines.push([
      r.id,
      `${r.cycle.periodStart.toISOString().slice(0,10)}~${r.cycle.periodEnd.toISOString().slice(0,10)}`,
      r.cycle.payrollDate.toISOString().slice(0,10),
      esc(who),
      r.status,
      r.baseSalaryHkd.toFixed(2),
      r.overtimeHkd.toFixed(2),
      r.bonusHkd.toFixed(2),
      r.commissionHkd.toFixed(2),
      r.allowanceTotalHkd.toFixed(2),
      r.deductionTotalHkd.toFixed(2),
      r.grossTotalHkd.toFixed(2),
      r.netPayableHkd.toFixed(2),
      r.confirmedAt?.toISOString().slice(0,10) ?? '',
      r.paidAt?.toISOString().slice(0,10) ?? '',
      esc((r as unknown as { paidReference?: string }).paidReference ?? ''),
      esc((r as unknown as { adminNote?: string }).adminNote ?? ''),
    ].join(','));
  }
  const bom = '\uFEFF'; // Excel 正確 UTF-8 BOM
  const body = bom + lines.join('\n');
  const enc = new TextEncoder();
  const bytes = enc.encode(body);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `Payroll_Export_${stamp}.csv`,
    bytes,
  };
}
