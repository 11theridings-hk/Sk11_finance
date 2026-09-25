import { resolveWhatsAppActor } from './identity'
import { handleWhatsAppCommand } from './commands'
import { polishWhatsAppOutboundText } from './llmOutbound'

/**
 * 處理一則入站文字，回傳應回覆用戶的訊息（不含發送）。
 * Meta webhook 與 WS-BOT 閘道入站 API 共用。
 *
 * 回傳 null = 不應回覆（非白名單等）；閘道／webhook 須略過發送。
 *
 * 注意：群組訊息應由閘道層 skip（@g.us）；本層只服務 1 對 1。
 */
export async function processWhatsAppInboundText(
  from: string,
  text: string,
): Promise<string | null> {
  const { actor, reason, silent } = await resolveWhatsAppActor(from)
  if (!actor) {
    if (silent) return null
    return `⛔ ${reason || '未授權'}`
  }
  const reply = await handleWhatsAppCommand(actor, text)
  // 結構化確認卡／說明不潤飾，避免破壞固定格式
  if (
    /^(請確認公帳|✅ 已入帳|你好，|未能辨識|已取消|沒有待確認)/.test(reply) ||
    reply.includes('回覆「確認」提交')
  ) {
    return reply
  }
  return polishWhatsAppOutboundText(reply)
}
