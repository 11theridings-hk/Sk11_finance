import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { jsPDF } from 'jspdf'
import prisma from '@/lib/prisma'
import { loadChineseFonts } from '@/lib/fonts/loadChineseFont'
import { getMonthSummaryAdmin } from './ledger'

const META_KEY_PREFIX = 'whatsapp.export.'
const DEFAULT_TTL_MS = 30 * 60 * 1000

export type WhatsAppExportMeta = {
  token: string
  userId: string
  filename: string
  filePath: string
  expiresAt: number
  createdAt: number
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

/**
 * 產生本月公帳摘要 PDF（伺服器端），回傳短時下載 URL。
 */
export async function createWhatsAppMonthReportPdf(input: {
  userId: string
}): Promise<{ ok: true; url: string; expiresAt: number; summaryLabel: string } | { ok: false; error: string }> {
  try {
    const summary = await getMonthSummaryAdmin()
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

    const title = `SK11 公帳摘要 ${summary.year}/${String(summary.month).padStart(2, '0')}`
    doc.setFontSize(18)
    doc.text(title, 40, 56)
    doc.setFont(regularName, 'normal')
    doc.setFontSize(11)
    let y = 90
    const lines = [
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
    for (const line of lines) {
      doc.text(line, 40, y)
      y += 18
      if (y > 780) {
        doc.addPage()
        y = 56
      }
    }

    const pdfBytes = Buffer.from(doc.output('arraybuffer'))
    const token = randomBytes(24).toString('hex')
    const filename = `sk11-report-${summary.year}-${String(summary.month).padStart(2, '0')}.pdf`
    const filePath = join(exportsDir(), `${token}.pdf`)
    writeFileSync(filePath, pdfBytes)

    const expiresAt = Date.now() + exportTtlMs()
    await saveMeta({
      token,
      userId: input.userId,
      filename,
      filePath,
      expiresAt,
      createdAt: Date.now(),
    })

    return {
      ok: true,
      url: `${appBaseUrl()}/api/exports/whatsapp/${token}`,
      expiresAt,
      summaryLabel: `${summary.year}/${summary.month}`,
    }
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
  | { ok: true; filename: string; bytes: Buffer }
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
    await deleteMeta(safe)
    return { ok: false, status: 410, error: 'Link expired' }
  }

  if (!existsSync(meta.filePath)) {
    await deleteMeta(safe)
    return { ok: false, status: 404, error: 'File missing' }
  }

  return {
    ok: true,
    filename: meta.filename,
    bytes: readFileSync(meta.filePath),
  }
}
