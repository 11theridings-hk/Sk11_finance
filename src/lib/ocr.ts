export const OCR_SETTING_KEYS = {
  enabled: 'ocr.enabled',
  model: 'ocr.model',
  systemPrompt: 'ocr.systemPrompt',
  userPrompt: 'ocr.userPrompt',
} as const

export type OcrContext =
  | 'public-record'
  | 'private-record'
  | 'contract'
  | 'activity'
  | 'record-edit'
  | 'activity-edit'
  | 'recurring'

export type OcrDocumentType =
  | 'INVOICE'
  | 'RECEIPT'
  | 'CONTRACT'
  | 'BANK_SLIP'
  | 'QUOTATION'
  | 'STATEMENT'
  | 'OTHER'
  | 'UNKNOWN'

export type OcrParsedResult = {
  vendor?: string
  orderNumber?: string
  documentDate?: string
  amount?: string
  summary?: string
  keywords?: string[]
  documentType?: OcrDocumentType
  documentTypeNote?: string
}

export const OCR_DOCUMENT_TYPE_LABELS: Record<
  OcrDocumentType,
  { 'zh-HK': string; en: string }
> = {
  INVOICE: { 'zh-HK': '發票', en: 'Invoice' },
  RECEIPT: { 'zh-HK': '收據', en: 'Receipt' },
  CONTRACT: { 'zh-HK': '合約', en: 'Contract' },
  BANK_SLIP: { 'zh-HK': '銀行回單', en: 'Bank slip' },
  QUOTATION: { 'zh-HK': '報價單', en: 'Quotation' },
  STATEMENT: { 'zh-HK': '結單／月結單', en: 'Statement' },
  OTHER: { 'zh-HK': '其他', en: 'Other' },
  UNKNOWN: { 'zh-HK': '無法分辨', en: 'Unable to determine' },
}

export const DEFAULT_OCR_SYSTEM_PROMPT = [
  '你是財務單據整理助手。',
  '請從圖片中提取最重要、最適合日後模糊搜尋的資料。',
  '同時判斷文件類型：INVOICE / RECEIPT / CONTRACT / BANK_SLIP / QUOTATION / STATEMENT / OTHER / UNKNOWN。',
  '優先識別：公司 / 商戶名稱、訂單 / 單據號碼、銀行帳戶關鍵資訊、總金額、簡短關鍵字。',
  '若資訊不確定，請保守輸出，不要虛構。',
  '請只輸出 JSON，不要輸出 markdown、解釋或額外文字。',
].join(' ')

export const DEFAULT_OCR_USER_PROMPT = [
  '請分析這張附件圖片，場景是：{{contextLabel}}。',
  '只輸出以下 JSON 結構：',
  '{"vendor":"","orderNumber":"","documentDate":"","amount":"","summary":"","keywords":["",""],"documentType":"UNKNOWN","documentTypeNote":""}',
  'documentType 必須是：INVOICE、RECEIPT、CONTRACT、BANK_SLIP、QUOTATION、STATEMENT、OTHER、UNKNOWN 之一。',
  'documentTypeNote 請用一句極短說明（中文優先），與類型合共盡量不超過 40 字。',
  'keywords 請只放最重要的短詞（公司名、單號、戶口等），之後會截成 30 字內備註。',
  '如某欄沒有資料可留空字串或空陣列。',
].join('\n')

const OCR_CONTEXT_LABELS: Record<OcrContext, string> = {
  'public-record': '公帳收支備註',
  'private-record': '私帳備註',
  contract: '合約備註',
  activity: '事項備註',
  'record-edit': '公帳修改申請備註',
  'activity-edit': '事項編輯備註',
  recurring: '恆常收支備註',
}

export function getOcrContextLabel(context: OcrContext) {
  return OCR_CONTEXT_LABELS[context]
}

export function fillOcrUserPrompt(template: string, context: OcrContext) {
  return template.replaceAll('{{contextLabel}}', getOcrContextLabel(context))
}

export function resolveOcrEndpoint(baseUrl?: string) {
  const trimmed = (baseUrl || '').trim()
  if (!trimmed) {
    return 'https://api.openai.com/v1/chat/completions'
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed
  }
  return `${trimmed.replace(/\/$/, '')}/chat/completions`
}

export function parseJsonFromText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('OCR returned empty text')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('OCR JSON parse failed')
    }
    return JSON.parse(match[0])
  }
}

const DOC_TYPES = new Set<string>([
  'INVOICE',
  'RECEIPT',
  'CONTRACT',
  'BANK_SLIP',
  'QUOTATION',
  'STATEMENT',
  'OTHER',
  'UNKNOWN',
])

export function normalizeOcrResult(value: any): OcrParsedResult {
  const keywords = Array.isArray(value?.keywords)
    ? value.keywords.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : []

  const rawType = String(value?.documentType || 'UNKNOWN').trim().toUpperCase()
  const documentType = (DOC_TYPES.has(rawType) ? rawType : 'UNKNOWN') as OcrDocumentType

  return {
    vendor: String(value?.vendor || '').trim(),
    orderNumber: String(value?.orderNumber || '').trim(),
    documentDate: String(value?.documentDate || '').trim(),
    amount: String(value?.amount || '').trim(),
    summary: String(value?.summary || '').trim(),
    keywords,
    documentType,
    documentTypeNote: String(value?.documentTypeNote || '').trim(),
  }
}

function truncateChars(text: string, max: number) {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return chars.slice(0, max).join('')
}

/** Short keywords for the record note field (≤30 chars). */
export function formatOcrKeywordsForNote(result: OcrParsedResult, maxChars = 30) {
  const parts = [
    result.vendor,
    result.orderNumber,
    ...(result.keywords || []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  const unique: string[] = []
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part)
  }

  let out = ''
  for (const part of unique) {
    const next = out ? `${out}｜${part}` : part
    if (Array.from(next).length > maxChars) break
    out = next
  }
  return truncateChars(out || (result.summary || ''), maxChars)
}

/** Attachment memo: document type + short note (≤40 chars). */
export function formatOcrAttachmentMemo(
  result: OcrParsedResult,
  locale: 'zh-HK' | 'en',
  maxChars = 40
) {
  const type = result.documentType || 'UNKNOWN'
  const typeLabel = OCR_DOCUMENT_TYPE_LABELS[type][locale === 'en' ? 'en' : 'zh-HK']
  const note = (result.documentTypeNote || result.summary || '').trim()
  const combined = note ? `${typeLabel}｜${note}` : typeLabel
  return truncateChars(combined, maxChars)
}

export function appendAttachmentMemo(existing: string | undefined | null, addition: string) {
  const base = (existing || '').trim()
  const add = (addition || '').trim()
  if (!add) return base
  if (!base) return add
  return `${base}；${add}`
}

export function parseOcrAmount(amount?: string | null): number | null {
  if (!amount) return null
  const cleaned = String(amount).replace(/[^\d.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.abs(n)
}

/** @deprecated kept for admin preview / fallback */
export function formatOcrResultForNote(result: OcrParsedResult, locale: 'zh-HK' | 'en') {
  return formatOcrKeywordsForNote(result, locale === 'en' ? 60 : 30)
}
