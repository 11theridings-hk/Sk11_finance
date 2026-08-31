import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SnapshotProfile } from './calc';
import { loadChineseFonts } from '@/lib/fonts/loadChineseFont';

export type SystemSettingMap = {
  COMPANY_NAME_ZH?: string;
  COMPANY_NAME_EN?: string;
  COMPANY_ADDRESS?: string;
  COMPANY_PHONE?: string;
};

export type PdfPayrollItemRow = {
  itemType: 'EARNING' | 'DEDUCTION';
  itemCode: string;
  itemName: string;
  amountHkd: number;
  sourceText?: string | null;
};

export type GeneratePayslipPdfInput = {
  company: SystemSettingMap;
  profile: SnapshotProfile;
  payroll: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    payrollDate: Date;
    currency?: string;
    baseSalaryHkd: number;
    overtimeHkd: number;
    bonusHkd: number;
    commissionHkd: number;
    allowanceTotalHkd: number;
    deductionTotalHkd: number;
    grossTotalHkd: number;
    netPayableHkd: number;
    submittedAt?: Date | null;
    confirmedAt?: Date | null;
    paidAt?: Date | null;
    pdfGeneratedAt?: Date | null;
    adminNote?: string | null;
  };
  items: PdfPayrollItemRow[];
  submittedBy?: { legalNameZh?: string | null; legalNameEn?: string } | null;
  cycleNote?: string | null;
};

function formatHkd(value: number): string {
  return value.toLocaleString('en-HK', {
    style: 'currency',
    currency: 'HKD',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace('HKD', 'HKD ');
}

function shortDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = typeof d === 'string' ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

function numberToEnglishWords(n: number): string {
  // HKD amount in English, pragmatic for common salary ranges
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scale = [
    { v: 1e9, label: 'Billion' },
    { v: 1e6, label: 'Million' },
    { v: 1e3, label: 'Thousand' },
    { v: 1, label: '' },
  ];
  const cents = Math.round((n - Math.floor(n)) * 100);
  const whole = Math.floor(n);
  if (whole === 0 && cents === 0) return 'Hong Kong Dollars Zero Only.';
  const wordify = (x: number): string => {
    if (x === 0) return '';
    if (x < 20) return ones[x];
    if (x < 100) return (tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : '')).trim();
    if (x < 1000) {
      const h = Math.floor(x / 100);
      const rest = x % 100;
      return (ones[h] + ' Hundred' + (rest ? ' and ' + wordify(rest) : '')).trim();
    }
    for (const s of scale) {
      if (x >= s.v) {
        const hi = Math.floor(x / s.v);
        const lo = x % s.v;
        const label = s.label ? ' ' + s.label : '';
        return (wordify(hi) + label + (lo ? ' ' + wordify(lo) : '')).trim();
      }
    }
    return '';
  };
  let result = wordify(whole).replace(/\s+/g, ' ').trim();
  if (cents > 0) {
    result += ` and Cents ${wordify(cents).replace(/\s+/g, ' ').trim()}`;
  }
  return `Hong Kong Dollars ${result} Only.`;
}

export function generatePayslipPdf(input: GeneratePayslipPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  let FONT_REG = 'helvetica';
  let FONT_BOLD = 'helvetica';
  let useCjkFallback = false;
  try {
    const fonts = loadChineseFonts();
    FONT_REG = fonts.regularFamily;
    FONT_BOLD = fonts.boldFamily;
    const toBinaryStr = (bytes: Uint8Array): string => {
      let bin = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) bin += String.fromCharCode(bytes[i]);
      return bin;
    };
    doc.addFileToVFS(`${FONT_REG}.ttf`, toBinaryStr(fonts.regular));
    doc.addFont(`${FONT_REG}.ttf`, FONT_REG, 'normal');
    if (FONT_BOLD !== FONT_REG) {
      doc.addFileToVFS(`${FONT_BOLD}.ttf`, toBinaryStr(fonts.bold));
      doc.addFont(`${FONT_BOLD}.ttf`, FONT_BOLD, 'bold');
    } else {
      doc.addFont(`${FONT_REG}.ttf`, FONT_BOLD, 'bold');
    }
  } catch (err) {
    useCjkFallback = true;
    FONT_REG = 'helvetica';
    FONT_BOLD = 'helvetica';
    // 字型載入失敗，繼續使用 helvetica，盡量用英文抬頭 (仍保留中文但會變亂碼, 至少 PDF 可出)
    console.error('[generatePayslipPdf] CJK font load failed (fallback to helvetica):', String(err));
  }
  const setBold = (bold: boolean) => doc.setFont(bold ? FONT_BOLD : FONT_REG, bold ? 'bold' : 'normal');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let cursorY = margin;

  // --- Header (company) ---
  const companyZh = input.company.COMPANY_NAME_ZH || '';
  const companyEn = input.company.COMPANY_NAME_EN || 'SK11 Finance Limited';
  const companyAddr = input.company.COMPANY_ADDRESS || '';
  const companyPhone = input.company.COMPANY_PHONE || '';

  doc.setFontSize(16);
  setBold(true);
  if (!useCjkFallback && companyZh) doc.text(companyZh, pageW / 2, cursorY, { align: 'center' });
  cursorY += 20;
  doc.setFontSize(12);
  doc.text(companyEn, pageW / 2, cursorY, { align: 'center' });
  cursorY += 14;
  if (companyAddr) {
    doc.setFontSize(10);
    setBold(false);
    doc.text(companyAddr, pageW / 2, cursorY, { align: 'center' });
    cursorY += 12;
  }
  if (companyPhone) {
    doc.setFontSize(10);
    doc.text(`Tel: ${companyPhone}`, pageW / 2, cursorY, { align: 'center' });
    cursorY += 12;
  }
  cursorY += 4;
  doc.setDrawColor(150);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 16;

  doc.setFontSize(18);
  setBold(true);
  doc.text('PAYSLIP CERTIFICATE', pageW / 2, cursorY, { align: 'center' });
  cursorY += 16;
  doc.setFontSize(14);
  doc.text('支 薪 證 明', pageW / 2, cursorY, { align: 'center' });
  cursorY += 22;

  // --- Meta info (payslip #, dates) ---
  setBold(false);
  doc.setFontSize(10);
  const currency = input.payroll.currency || 'HKD';
  const payslipNo = `SK11-PAY-${String(input.payroll.id).slice(-8).toUpperCase()}`;
  doc.text(`Payslip No.: ${payslipNo}`, margin, cursorY);
  doc.text(`Currency: ${currency}`, pageW - margin, cursorY, { align: 'right' });
  cursorY += 12;
  doc.text(`Period: ${shortDate(input.payroll.periodStart)} ~ ${shortDate(input.payroll.periodEnd)}`, margin, cursorY);
  doc.text(`Payroll Date: ${shortDate(input.payroll.payrollDate)}`, pageW - margin, cursorY, { align: 'right' });
  cursorY += 18;

  // --- Employee Info Block ---
  const p = input.profile;
  const col1X = margin;
  const col2X = margin + 230;
  const col3X = margin + 400;
  doc.setFontSize(10);
  setBold(true);
  doc.text('Employee / 僱員資料', margin, cursorY);
  cursorY += 14;
  setBold(false);

  const rowsInfo = [
    ['Name (EN):', p.legalNameEn, 'Department:', p.department || '—'],
    ['Name (中):', p.legalNameZh || '—', 'Job Title:', p.jobTitle || '—'],
    ['HKID / Passport:', (p.hkidMasked || p.passportNoMasked) ? `${p.hkidMasked || ''} ${p.passportNoMasked || ''}`.trim() : '—',
     'Date Joined:', p.dateJoinedIso ? shortDate(p.dateJoinedIso) : '—'],
    ['MPF No.:', p.mpfAccountNoMasked || '—',
     'Bank:', (p.bankName || '—') + (p.bankAccountNoLast4 ? ` (尾 4 碼 ${p.bankAccountNoLast4})` : '')],
    ['Contact:', [p.contactPhone, p.contactEmail].filter(Boolean).join(' / ') || '—',
     'DOB:', p.dateOfBirthIso ? shortDate(p.dateOfBirthIso) : '—'],
  ];
  for (const [k1, v1, k2, v2] of rowsInfo) {
    setBold(true);
    doc.text(k1, col1X, cursorY);
    setBold(false);
    doc.text(String(v1), col2X, cursorY);
    setBold(true);
    doc.text(k2, col3X, cursorY);
    setBold(false);
    doc.text(String(v2), col3X + 80, cursorY);
    cursorY += 14;
  }
  cursorY += 6;

  // --- Two-table layout: Earnings | Deductions ---
  const earnings = input.items.filter((it) => it.itemType === 'EARNING');
  const deductions = input.items.filter((it) => it.itemType === 'DEDUCTION');

  // Ensure at least 6 rows each for visual alignment
  const minRows = Math.max(6, earnings.length, deductions.length);
  const pad = <T extends PdfPayrollItemRow>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    while (copy.length < n) copy.push({ itemType: 'EARNING', itemCode: '', itemName: '', amountHkd: 0 } as T);
    return copy;
  };
  const earnPad = pad(earnings, minRows);
  const dedPad = pad(deductions, minRows);

  const leftBody: (string | number)[][] = earnPad.map((it) => [
    it.itemName,
    it.itemCode,
    it.amountHkd ? formatHkd(it.amountHkd) : '',
  ]);
  const rightBody: (string | number)[][] = dedPad.map((it) => [
    it.itemName,
    it.itemCode,
    it.amountHkd ? formatHkd(it.amountHkd) : '',
  ]);

  const totalEarning = earnings.reduce((s, it) => s + it.amountHkd, 0);
  const totalDeduct = deductions.reduce((s, it) => s + it.amountHkd, 0);

  const leftHead = [['Income / 收入項目', 'Code / 編碼', 'Amount / 金額']];
  const rightHead = [['Deductions / 扣除項目', 'Code / 編碼', 'Amount / 金額']];

  const leftFoot = [['', '收入總額 / Gross Total', formatHkd(totalEarning)]];
  const rightFoot = [['', '扣除總額 / Deduction Total', formatHkd(totalDeduct)]];

  // Left table
  const halfW = (pageW - margin * 2 - 16) / 2;
  const commonTableStyles = {
    font: FONT_REG as unknown as undefined,
    fontStyle: 'normal' as const,
    fontSize: 9,
    cellPadding: 3,
    overflow: 'linebreak' as const,
  };
  autoTable(doc, {
    startY: cursorY,
    head: leftHead,
    body: leftBody,
    foot: leftFoot,
    margin: { left: margin, right: pageW - margin - halfW },
    styles: { ...commonTableStyles },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    footStyles: { fillColor: [226, 232, 240], fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    columnStyles: { 0: { cellWidth: halfW * 0.5 }, 1: { cellWidth: halfW * 0.2 }, 2: { halign: 'right' as const, cellWidth: halfW * 0.3 } },
    tableWidth: halfW,
    showFoot: 'lastPage',
  });
  const leftFinalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY;

  // Right table aligned
  autoTable(doc, {
    startY: cursorY,
    head: rightHead,
    body: rightBody,
    foot: rightFoot,
    margin: { left: margin + halfW + 16, right: margin },
    styles: { ...commonTableStyles },
    headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    footStyles: { fillColor: [254, 226, 226], fontStyle: 'bold', font: FONT_BOLD as unknown as undefined },
    columnStyles: { 0: { cellWidth: halfW * 0.5 }, 1: { cellWidth: halfW * 0.2 }, 2: { halign: 'right' as const, cellWidth: halfW * 0.3 } },
    tableWidth: halfW,
    showFoot: 'lastPage',
  });
  const rightFinalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY;

  cursorY = Math.max(leftFinalY, rightFinalY) + 20;

  // --- Totals Banner ---
  doc.setFillColor(254, 243, 199);
  doc.rect(margin, cursorY, pageW - margin * 2, 40, 'F');
  setBold(true);
  doc.setFontSize(12);
  doc.text('Net Payable / 應發淨額:', margin + 14, cursorY + 25);
  doc.setFontSize(18);
  doc.text(formatHkd(input.payroll.netPayableHkd), pageW - margin - 14, cursorY + 27, { align: 'right' });
  cursorY += 54;

  doc.setFontSize(10);
  setBold(false);
  const wording = numberToEnglishWords(input.payroll.netPayableHkd);
  doc.text(`Say: ${wording}`, margin, cursorY, { maxWidth: pageW - margin * 2 });
  cursorY += 18;

  // --- Admin note (optional) ---
  if (input.payroll.adminNote) {
    setBold(false);
    doc.setFontSize(9);
    doc.text(`Note / 備註: ${input.payroll.adminNote}`, margin, cursorY, { maxWidth: pageW - margin * 2 });
    cursorY += 14;
  }
  cursorY += 8;

  // --- Electronic Signatures ---
  doc.setFontSize(10);
  setBold(true);
  const signY = cursorY;
  doc.text('Issued by / 發出人 (管理員):', margin, signY);
  doc.text('Acknowledged by / 僱員確認:', margin + 270, signY);
  doc.text('Paid / 已發薪:', pageW - margin, signY, { align: 'right' });
  cursorY += 18;
  setBold(false);
  const issuer = input.submittedBy
    ? ((input.submittedBy.legalNameZh ? `${input.submittedBy.legalNameZh} (${input.submittedBy.legalNameEn || ''})` : input.submittedBy.legalNameEn) || '—')
    : '—';
  doc.text(issuer, margin, cursorY);
  doc.text(
    input.payroll.confirmedAt
      ? `已確認 (${shortDate(input.payroll.confirmedAt)})  Electronic Acceptance`
      : '—',
    margin + 270,
    cursorY,
  );
  doc.text(
    input.payroll.paidAt ? `PAID (${shortDate(input.payroll.paidAt)})` : 'Not yet paid',
    pageW - margin,
    cursorY,
    { align: 'right' },
  );
  cursorY += 24;

  // --- Footer ---
  doc.setFontSize(8);
  setBold(false);
  doc.setTextColor(100);
  doc.text(
    `此支薪證明為電腦簽發，毋須蓋章。Generated: ${new Date(input.payroll.pdfGeneratedAt || Date.now()).toLocaleString('en-HK')}. Payslip: ${payslipNo}.`,
    pageW / 2,
    doc.internal.pageSize.getHeight() - 30,
    { align: 'center' },
  );
  doc.setTextColor(0);

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
