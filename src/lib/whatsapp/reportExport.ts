import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { jsPDF } from 'jspdf'
import prisma from '@/lib/prisma'
import { loadChineseFonts } from '@/lib/fonts/loadChineseFont'
import { getMonthSummaryAdmin } from './ledger'
import { getPrivateMonthSummaryForUser } from './privateLedger'

const META_KEY_PREFIX = 'whatsapp.export.'
const BLOB_KEY_PREFIX = 'whatsapp.export.blob.'
const DEFAULT_TTL_MS = 30 * 60 * 1000

export type WhatsAppExportMeta = {
  token: string
  userId: string
  filename: string
  filePath: string
  expiresAt: number
  createdAt: number
  /** 若 true，位元組另存 SystemSetting（跨實例可讀） */
  hasBlob?: boolean
  kind?: 'public' | 'private'
}

function exportsDir() {
  const dir = join(tmpdir(), 'sk11-wa-exports')
  mkdirSync(dir, { recursive: true })
  return dir
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || '').replace(/\/$/, '') || 'http://localhost:3000'
}

function exportTtlMs() {
  const n = Number(process.env.WHATSAPP_EXPORT_TTL_MS || DEFAULT_TTL_MS)
  return Number.isFinite(n) && n > 60_000 ? n : DEFAULT_TTL_MS
}

async function saveMeta(meta: WhatsAppExportMeta) {
  await prisma.systemSetting.upsert({
    where: { key: `${META_KEY_PREFIX}${meta.token}` },
    create: {
      key: `${META_KEY_PREFIX}${meta.token}`,
      value: JSON.stringify(meta),
    },
    update: { value: JSON.stringify(meta) },
  })
}

async function saveBlob(token: string, bytes: Buffer) {
  const key = `${BLOB_KEY_PREFIX}${token}`
  const value = bytes.toString('base64')
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

async function loadBlob(token: string): Promise<Buffer | null> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: `${BLOB_KEY_PREFIX}${token}` },
  })
  if (!row?.value) return null
  try {
    return Buffer.from(row.value, 'base64')
  } catch {
    return null
  }
}

async function deleteBlob(token: string) {
  await prisma.systemSetting.deleteMany({
    where: { key: `${BLOB_KEY_PREFIX}${token}` },
  })
}

async function loadMeta(token: string): Promise<WhatsAppExportMeta | null> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: `${META_KEY_PREFIX}${token}` },
  })
  if (!row?.value) return null
  try {
    return JSON.parse(row.value) as WhatsAppExportMeta
  } catch {
    return null
  }
}

async function deleteMeta(token: string) {
  await prisma.systemSetting.deleteMany({
    where: { key: `${META_KEY_PREFIX}${token}` },
  })
}

function buildPdfDoc(lines: string[], title: string) {
  const fonts = loadChineseFonts()
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })

  const regularName = fonts.regularFamily || 'NotoSansSC'
  let bin = ''
  for (let i = 0; i < fonts.regular.byteLength; i++) {
    bin += String.fromCharCode(fonts.regular[i]!)
  }
  doc.addFileToVFS(`${regularName}.ttf`, bin)
  doc.addFont(`${regularName}.ttf`, regularName, 'normal')
  doc.addFont(`${regularName}.ttf`, regularName, 'bold')
  doc.setFont(regularName, 'bold')
  doc.setFontSize(18)
  doc.text(title, 40, 56)
  doc.setFont(regularName, 'normal')
  doc.setFontSize(11)
  let y = 90
  for (const line of lines) {
    doc.text(line, 40, y)
    y += 18
    if (y > 780) {
      doc.addPage()
      y = 56
    }
  }
  return Buffer.from(doc.output('arraybuffer'))
}

async function persistExport(input: {
  userId: string
  filename: string
  pdfBytes: Buffer
  kind: 'public' | 'private'
  summaryLabel: string
}): Promise<{ ok: true; url: string; expiresAt: number; summaryLabel: string } | { ok: false; error: string }> {
  try {
    const token = randomBytes(24).toString('hex')
    const filePath = join(exportsDir(), `${token}.pdf`)
    try {
      writeFileSync(filePath, input.pdfBytes)
    } catch {
      /* /tmp 寫入失敗仍可依賴 DB blob */
    }

    await saveBlob(token, input.pdfBytes)

    const expiresAt = Date.now() + exportTtlMs()
    await saveMeta({
      token,
      userId: input.userId,
      filename: input.filename,
      filePath,
      expiresAt,
      createdAt: Date.now(),
      hasBlob: true,
      kind: input.kind,
    })

    return {
      ok: true,
      url: `${appBaseUrl()}/api/exports/whatsapp/${token}`,
      expiresAt,
      summaryLabel: input.summaryLabel,
    }
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'PDF generation failed',
    }
  }
}

/**
 * 產生本月公帳摘要 PDF（伺服器端），回傳短時下載 URL。
 * locale=en → 英文版文件；zh → 中文版。
 * 位元組同時寫 /tmp 與 SystemSetting，避免 Railway 多實例 404。
 */
export async function createWhatsAppMonthReportPdf(input: {
  userId: string
  locale?: 'zh' | 'en'
}): Promise<{ ok: true; url: string; expiresAt: number; summaryLabel: string } | { ok: false; error: string }> {
  try {
    const locale = input.locale === 'en' ? 'en' : 'zh'
    const summary = await getMonthSummaryAdmin()
    const monthPad = String(summary.month).padStart(2, '0')
    const title =
      locale === 'en'
        ? `SK11 Public Ledger Summary ${summary.year}/${monthPad}`
        : `SK11 公帳摘要 ${summary.year}/${monthPad}`
    const lines =
      locale === 'en'
        ? [
            `Period: ${summary.year}-${monthPad}`,
            `Approved entries: ${summary.count}`,
            `Income: +${summary.income.toFixed(2)} HKD`,
            `Expense: -${summary.expense.toFixed(2)} HKD`,
            `Net: ${summary.net >= 0 ? '+' : ''}${summary.net.toFixed(2)} HKD`,
            `Pools total: ${summary.poolTotal.toFixed(2)} HKD`,
            '',
            'Pools:',
            ...summary.pools.map((p) => `• ${p.name}: ${p.balanceHkd.toFixed(2)} HKD`),
            '',
            `Generated: ${new Date().toLocaleString('en-HK')}`,
            'Generated via WhatsApp. For internal use only.',
          ]
        : [
            `統計月份：${summary.year} 年 ${summary.month} 月`,
            `核准筆數：${summary.count}`,
            `收入：+${summary.income.toFixed(2)} HKD`,
            `支出：-${summary.expense.toFixed(2)} HKD`,
            `淨額：${summary.net >= 0 ? '+' : ''}${summary.net.toFixed(2)} HKD`,
            `資金池合計：${summary.poolTotal.toFixed(2)} HKD`,
            '',
            '資金池明細：',
            ...summary.pools.map((p) => `• ${p.name}：${p.balanceHkd.toFixed(2)} HKD`),
            '',
            `產生時間：${new Date().toLocaleString('zh-HK')}`,
            '本檔由 WhatsApp 指令產生，僅供內部參考。',
          ]

    const pdfBytes = buildPdfDoc(lines, title)
    const filename =
      locale === 'en'
        ? `sk11-report-${summary.year}-${monthPad}-en.pdf`
        : `sk11-report-${summary.year}-${monthPad}.pdf`

    return persistExport({
      userId: input.userId,
      filename,
      pdfBytes,
      kind: 'public',
      summaryLabel: `${summary.year}/${summary.month}`,
    })
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'PDF generation failed',
    }
  }
}

/**
 * 產生本月「本人」私帳摘要 PDF（短時連結）。
 */
export async function createWhatsAppPrivateMonthReportPdf(input: {
  userId: string
  locale?: 'zh' | 'en'
}): Promise<{ ok: true; url: string; expiresAt: number; summaryLabel: string } | { ok: false; error: string }> {
  try {
    const locale = input.locale === 'en' ? 'en' : 'zh'
    const summary = await getPrivateMonthSummaryForUser(input.userId)
    const monthPad = String(summary.month).padStart(2, '0')
    const title =
      locale === 'en'
        ? `SK11 Private Ledger Summary ${summary.year}/${monthPad}`
        : `SK11 私帳摘要 ${summary.year}/${monthPad}`
    const lines =
      locale === 'en'
        ? [
            'PRIVATE LEDGER — owner only',
            `Period: ${summary.year}-${monthPad}`,
            `Entries: ${summary.count}`,
            `Income: +${summary.income.toFixed(2)} HKD`,
            `Expense: -${summary.expense.toFixed(2)} HKD`,
            `Net: ${summary.net >= 0 ? '+' : ''}${summary.net.toFixed(2)} HKD`,
            '',
            `Generated: ${new Date().toLocaleString('en-HK')}`,
            'Generated via WhatsApp. Do not forward the link.',
          ]
        : [
            '【私帳】僅本人資料',
            `統計月份：${summary.year} 年 ${summary.month} 月`,
            `筆數：${summary.count}`,
            `收入：+${summary.income.toFixed(2)} HKD`,
            `支出：-${summary.expense.toFixed(2)} HKD`,
            `淨額：${summary.net >= 0 ? '+' : ''}${summary.net.toFixed(2)} HKD`,
            '',
            `產生時間：${new Date().toLocaleString('zh-HK')}`,
            '本檔由 WhatsApp 指令產生；請勿轉發下載連結。',
          ]

    const pdfBytes = buildPdfDoc(lines, title)
    const filename =
      locale === 'en'
        ? `sk11-private-${summary.year}-${monthPad}-en.pdf`
        : `sk11-private-${summary.year}-${monthPad}.pdf`

    return persistExport({
      userId: input.userId,
      filename,
      pdfBytes,
      kind: 'private',
      summaryLabel: `${summary.year}/${summary.month}`,
    })
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'PDF generation failed',
    }
  }
}

export async function readWhatsAppExport(
  token: string,
): Promise<
  | {
      ok: true
      filename: string
      bytes: Buffer
      kind: 'public' | 'private'
      userId: string
    }
  | { ok: false; status: 404 | 410; error: string }
> {
  const safe = token.replace(/[^a-f0-9]/gi, '')
  if (safe.length < 16) return { ok: false, status: 404, error: 'Not found' }

  const meta = await loadMeta(safe)
  if (!meta) return { ok: false, status: 404, error: 'Not found' }

  if (Date.now() > meta.expiresAt) {
    try {
      if (existsSync(meta.filePath)) unlinkSync(meta.filePath)
    } catch {
      /* ignore */
    }
    await deleteBlob(safe)
    await deleteMeta(safe)
    return { ok: false, status: 410, error: 'Link expired' }
  }

  let bytes: Buffer | null = null
  if (existsSync(meta.filePath)) {
    bytes = readFileSync(meta.filePath)
  } else {
    const blob = await loadBlob(safe)
    if (blob) {
      try {
        writeFileSync(meta.filePath, blob)
      } catch {
        /* ignore */
      }
      bytes = blob
    }
  }

  if (!bytes) {
    await deleteMeta(safe)
    return { ok: false, status: 404, error: 'File missing' }
  }

  return {
    ok: true,
    filename: meta.filename,
    bytes,
    kind: meta.kind === 'private' ? 'private' : 'public',
    userId: meta.userId,
  }
}

/** 私帳匯出單次下載後銷毀（降低轉發／日誌外洩窗口） */
export async function consumeWhatsAppExport(token: string) {
  const safe = token.replace(/[^a-f0-9]/gi, '')
  if (safe.length < 16) return
  const meta = await loadMeta(safe)
  if (meta?.filePath) {
    try {
      if (existsSync(meta.filePath)) unlinkSync(meta.filePath)
    } catch {
      /* ignore */
    }
  }
  await deleteBlob(safe)
  await deleteMeta(safe)
}
