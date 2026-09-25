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
    const body = String(input.body || '').slice(0, BODY_MAX)
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
