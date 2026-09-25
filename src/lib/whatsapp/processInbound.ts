import { resolveWhatsAppActor } from './identity'
import { handleWhatsAppCommand } from './commands'

/**
 * 處理一則入站文字，回傳應回覆用戶的訊息（不含發送）。
 * Meta webhook 與 WS-BOT 閘道入站 API 共用。
 */
export async function processWhatsAppInboundText(from: string, text: string): Promise<string> {
  const { actor, reason } = await resolveWhatsAppActor(from)
  if (!actor) {
    return `⛔ ${reason || '未授權'}`
  }
  return handleWhatsAppCommand(actor, text)
}
