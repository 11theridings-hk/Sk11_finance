import { resolveWhatsAppActor } from './identity'
import { handleWhatsAppCommand } from './commands'

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
  const { actor, reason, silent } = await resolveWhatsAppActor(from)
  if (!actor) {
    if (silent) return null
    return `⛔ ${reason || '未授權'}`
  }
  return handleWhatsAppCommand(actor, text)
}
