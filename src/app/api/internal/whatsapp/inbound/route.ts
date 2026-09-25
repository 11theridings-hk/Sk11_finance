import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { getWhatsAppConfig } from '@/lib/whatsapp/config'
import { processWhatsAppInboundText } from '@/lib/whatsapp/processInbound'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function extractBearer(request: Request): string {
  const h = request.headers.get('authorization') || ''
  if (h.startsWith('Bearer ')) return h.slice(7).trim()
  return (request.headers.get('x-bridge-secret') || '').trim()
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a || '', 'utf8')
  const bufB = Buffer.from(b || '', 'utf8')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * WS-BOT（wwebjs 閘道）入站。
 * POST /api/internal/whatsapp/inbound
 * Authorization: Bearer $WHATSAPP_BRIDGE_SECRET
 * Body: { from, text, messageId? } → { ok, reply }
 *
 * 閘道負責把 reply 發回 WhatsApp；此端點不呼叫 send。
 */
export async function POST(request: Request) {
  const config = getWhatsAppConfig()
  if (!config.bridgeSecret) {
    return NextResponse.json(
      { ok: false, error: 'WHATSAPP_BRIDGE_SECRET not configured' },
      { status: 503 },
    )
  }

  if (!safeEqual(extractBearer(request), config.bridgeSecret)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { from?: string; text?: string; messageId?: string }
  try {
    body = (await request.json()) as { from?: string; text?: string; messageId?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const from = String(body.from || '').replace(/\D/g, '')
  const text = typeof body.text === 'string' ? body.text : ''
  if (!from || !text.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Need { from, text }' },
      { status: 400 },
    )
  }

  try {
    const reply = await processWhatsAppInboundText(from, text)
    return NextResponse.json({
      ok: true,
      reply,
      messageId: body.messageId || undefined,
    })
  } catch (e: unknown) {
    console.error('[whatsapp-bridge] inbound error', e)
    return NextResponse.json(
      {
        ok: true,
        reply: '系統處理時發生錯誤，請稍後再試或登入網頁操作。',
      },
      { status: 200 },
    )
  }
}
