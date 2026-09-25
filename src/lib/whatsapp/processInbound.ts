import { resolveWhatsAppActor } from './identity'
import { handleWhatsAppCommand } from './commands'
import { polishWhatsAppOutboundText } from './llmOutbound'
import { detectWhatsAppLocale } from './locale'
import { logWhatsAppMessage } from './messageLog'

/**
 * 處理一則入站文字，回傳應回覆用戶的訊息（不含發送）。
 * Meta webhook 與 WS-BOT 閘道入站 API 共用。
 *
 * 回傳 null = 不應回覆（非白名單等）；閘道／webhook 須略過發送。
 */
export async function processWhatsAppInboundText(
  from: string,
  text: string,
): Promise<string | null> {
  const peer = String(from || '').replace(/\D/g, '') || String(from || '')
  const { actor, reason, silent } = await resolveWhatsAppActor(from)
  if (!actor) {
    await logWhatsAppMessage({
      direction: 'IN',
      kind: silent ? 'deny' : 'deny',
      peer,
      body: text,
      status: 'DENIED',
      error: reason || 'unauthorized',
    })
    if (silent) return null
    const locale = detectWhatsAppLocale(text)
    const denyReply =
      locale === 'en'
        ? `⛔ ${reason || 'Unauthorized'}`
        : `⛔ ${reason || '未授權'}`
    await logWhatsAppMessage({
      direction: 'OUT',
      kind: 'command_reply',
      peer,
      body: denyReply,
      status: 'OK',
    })
    return denyReply
  }

  await logWhatsAppMessage({
    direction: 'IN',
    kind: 'command',
    peer,
    body: text,
    status: 'OK',
    meta: { userId: actor.userId },
  })

  const locale = detectWhatsAppLocale(text)
  let reply = await handleWhatsAppCommand(actor, text)
  // 結構化確認卡／說明不潤飾
  if (
    !(
      /^(請確認公帳|Please confirm this ledger|✅ 已入帳|✅ Posted|你好，|Hi,|未能辨識|Could not understand|已取消|Pending action cancelled|沒有待確認|No pending ledger)/.test(
        reply,
      ) ||
      reply.includes('回覆「確認」提交') ||
      reply.includes('Reply confirm to submit')
    )
  ) {
    reply = await polishWhatsAppOutboundText(reply, locale)
  }

  await logWhatsAppMessage({
    direction: 'OUT',
    kind: 'command_reply',
    peer,
    body: reply,
    status: 'OK',
    meta: { locale },
  })
  return reply
}
