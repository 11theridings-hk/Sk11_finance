import { getWhatsAppLlmConfig, whatsappLlmChatCompletion } from './llm'
import type { WhatsAppLocale } from './locale'

function systemPrompt(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return `You polish SK11 finance WhatsApp messages into clear, concise English.
Rules:
1. Only improve tone/layout; keep meaning.
2. Do not add, remove, or change any numbers, dates, amounts, URLs, phones, or IDs.
3. Do not invent facts or advice.
4. Keep emojis if present.
5. Output only the polished message.`
  }
  return `你是 SK11 財務助手的訊息潤飾器。
規則：
1. 只整理語氣與排版，令粵語／書面中文更易讀。
2. 不可新增、刪除或改動任何數字、日期、金額、連結 URL、電話、單號。
3. 不可改變事實含義；不可加入未提供的建議或免責以外的新內容。
4. 保留 emoji（若原文有）。
5. 只輸出潤飾後全文，不要前言後語。`
}

/**
 * 出站訊息口語化／整理。失敗或未啟用時回傳原文。
 */
export async function polishWhatsAppOutboundText(
  text: string,
  locale: WhatsAppLocale = 'zh',
): Promise<string> {
  const cfg = getWhatsAppLlmConfig()
  if (!cfg.enabled || !cfg.outbound) return text
  const trimmed = text.trim()
  if (!trimmed || trimmed.length < 8) return text

  const result = await whatsappLlmChatCompletion({
    system: systemPrompt(locale),
    user: trimmed,
    temperature: 0.3,
  })
  if (!result.ok) return text

  const polished = result.text.trim()
  if (!polished) return text
  const urlRe = /https?:\/\/\S+/g
  const origUrls = trimmed.match(urlRe) || []
  const newUrls = polished.match(urlRe) || []
  if (origUrls.length > 0 && newUrls.length < origUrls.length) return text

  return polished
}
