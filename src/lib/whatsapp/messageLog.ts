import prisma from '@/lib/prisma'

export type WhatsAppLogDirection = 'IN' | 'OUT'
export type WhatsAppLogKind =
  | 'command'
  | 'command_reply'
  | 'push'
  | 'deny'
  | 'error'
export type WhatsAppLogStatus = 'OK' | 'DENIED' | 'FAILED' | 'IGNORED'

const MAX_ROWS = Number(process.env.WHATSAPP_MESSAGE_LOG_MAX || 1000)
const BODY_MAX = 4000

export type WhatsAppMessageLogRow = {
  id: string
  direction: string
  kind: string
  peer: string
  body: string
  status: string
  error: string | null
  messageId: string | null
  meta: string | null
  createdAt: Date
}

/** 是否像私帳相關進出站（含指令與確認卡） */
function looksLikePrivateLedgerLog(body: string): boolean {
  return /私帳|私账|【私帳】|【PRIVATE】|PRIVATE\s*ledger|private\s+ledger|私帳摘要|private\s+report|private\s+(expense|income|exp|inc)\b|^private\b/i.test(
    body,
  )
}

/** 脫敏：匯出連結＋私帳金額／備註數字，避免管理員日誌讀取他人私帳 */
function redactLogBody(body: string): string {
  let out = body.replace(
    /https?:\/\/\S*\/api\/exports\/whatsapp\/[^\s]+/gi,
    '[export-link-redacted]',
  )
  if (looksLikePrivateLedgerLog(out)) {
    // 金額與夾雜數字；保留關鍵字結構便於排查
    out = out.replace(/[+\-]?\d+(?:\.\d{1,2})?/g, '[n]')
  }
  return out
}

/**
 * 寫入一筆進出訊息日誌（失敗不影響主流程）。
 */
export async function logWhatsAppMessage(input: {
  direction: WhatsAppLogDirection
  kind?: WhatsAppLogKind
  peer: string
  body: string
  status?: WhatsAppLogStatus
  error?: string | null
  messageId?: string | null
  meta?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const peer = String(input.peer || '').trim().slice(0, 128)
    if (!peer) return
    const body = redactLogBody(String(input.body || '')).slice(0, BODY_MAX)
    await prisma.whatsAppMessageLog.create({
      data: {
        direction: input.direction,
        kind: input.kind || 'command',
        peer,
        body,
        status: input.status || 'OK',
        error: input.error ? String(input.error).slice(0, 500) : null,
        messageId: input.messageId ? String(input.messageId).slice(0, 200) : null,
        meta: input.meta ? JSON.stringify(input.meta).slice(0, 2000) : null,
      },
    })

    // 偶爾清理舊資料，避免表無限長大
    if (Math.random() < 0.05) {
      const overflow = await prisma.whatsAppMessageLog.count()
      if (overflow > MAX_ROWS) {
        const cutoff = await prisma.whatsAppMessageLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip: MAX_ROWS,
          take: 1,
          select: { createdAt: true },
        })
        if (cutoff[0]) {
          await prisma.whatsAppMessageLog.deleteMany({
            where: { createdAt: { lt: cutoff[0].createdAt } },
          })
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp-message-log] write failed', e)
  }
}

export async function listWhatsAppMessageLogs(limit = 80): Promise<WhatsAppMessageLogRow[]> {
  const take = Math.min(200, Math.max(10, limit))
  return prisma.whatsAppMessageLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  })
}

export async function clearWhatsAppMessageLogs(): Promise<number> {
  const result = await prisma.whatsAppMessageLog.deleteMany({})
  return result.count
}
