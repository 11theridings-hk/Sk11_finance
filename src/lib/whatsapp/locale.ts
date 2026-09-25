export type WhatsAppLocale = 'zh' | 'en'

const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/
const LATIN_WORD_RE = /[A-Za-z]{2,}/g

/**
 * 由用戶訊息推斷回覆語系：有明顯中日韓字 → zh；否則若有英文詞 → en；預設 zh。
 */
export function detectWhatsAppLocale(text: string): WhatsAppLocale {
  const t = text.trim()
  if (!t) return 'zh'
  if (CJK_RE.test(t)) return 'zh'

  const lower = t.toLowerCase()
  // 明確中文指令關鍵字（無 CJK 時極少見，仍兜底）
  if (/^(幫助|提醒|最近|分類|資金池|報表|確認|取消)/.test(t)) return 'zh'

  const enHints = [
    'help',
    'menu',
    'remind',
    'reminder',
    'reminders',
    'recent',
    'categories',
    'category',
    'pools',
    'pool',
    'report',
    'pdf',
    'summary',
    'confirm',
    'cancel',
    'ledger',
    'expense',
    'income',
    'spend',
  ]
  if (enHints.some((h) => lower === h || lower.startsWith(h + ' ') || lower.includes(' ' + h))) {
    return 'en'
  }

  const words = t.match(LATIN_WORD_RE) || []
  if (words.length >= 1) return 'en'
  return 'zh'
}

export function isEn(locale: WhatsAppLocale) {
  return locale === 'en'
}
