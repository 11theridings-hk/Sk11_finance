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
  /** Short category label only, e.g. 消費月結單 — never a long sentence */
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
  STATEMENT: { 'zh-HK': '月結單', en: 'Statement' },
  OTHER: { 'zh-HK': '其他', en: 'Other' },
  UNKNOWN: { 'zh-HK': '無法分辨', en: 'Unable to determine' },
}

export const DEFAULT_OCR_SYSTEM_PROMPT = [
  '你是香港財務單據整理助手。',
  '請從圖片中提取最重要、最適合日後模糊搜尋的資料。',
  '同時判斷文件類型：INVOICE / RECEIPT / CONTRACT / BANK_SLIP / QUOTATION / STATEMENT / OTHER / UNKNOWN。',
  'documentTypeNote 只能是極短的類型名稱（2–8 字），例如：發票、收據、報價單、合約、銀行回單、轉帳憑證、消費月結單、信用卡月結單、水費單、電費單、煤氣單、差餉單、稅單、薪金單。',
  '若無法清楚判斷類型：documentType 填 UNKNOWN，documentTypeNote 必須留空字串，禁止寫「無法分辨」「其他」「不明」等字。',
  '優先識別：公司 / 商戶名稱、訂單 / 單據號碼、總金額、內容概括、搜尋關鍵字。',
  '若資訊不確定，請保守輸出，不要虛構。',
  '請只輸出 JSON，不要輸出 markdown、解釋或額外文字。',
].join(' ')

export const DEFAULT_OCR_USER_PROMPT = [
  '請分析這張附件圖片，場景是：{{contextLabel}}。',
  '只輸出以下 JSON 結構：',
  '{"vendor":"","orderNumber":"","documentDate":"","amount":"","summary":"","keywords":["",""],"documentType":"UNKNOWN","documentTypeNote":""}',
  'documentType 必須是：INVOICE、RECEIPT、CONTRACT、BANK_SLIP、QUOTATION、STATEMENT、OTHER、UNKNOWN 之一。',
  'documentTypeNote：只填短類型名（2–8 字）。常見對照：',
  '- 商戶收據／小票 → RECEIPT +「收據」',
  '- 正式發票／Invoice → INVOICE +「發票」',
  '- 報價單／Quotation → QUOTATION +「報價單」',
  '- 合約首頁／協議 → CONTRACT +「合約」',
  '- 銀行入帳／轉帳／FPS 憑證 → BANK_SLIP +「銀行回單」或「轉帳憑證」',
  '- 信用卡／消費月結單 → STATEMENT +「消費月結單」或「信用卡月結單」',
  '- 水務／中電／港燈／煤氣 → STATEMENT 或 INVOICE +「水費單／電費單／煤氣單」',
  '- 差餉／地租／稅單 → STATEMENT 或 INVOICE +「差餉單」或「稅單」',
  '- 薪金／工資單 → OTHER +「薪金單」',
  '認不出類型時：documentType=UNKNOWN 且 documentTypeNote=""（留空），不要寫無法分辨或說明句。',
  'summary：詳細文字敘述（如「包含一些消費項目與稅項說明」），會寫入記錄備註欄，不要寫進內容欄或附件備註。',
  'keywords：短關鍵詞（公司名、單號、品類短詞），會寫入記錄內容欄。',
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

const WEAK_TYPE_LABELS = new Set([
  '無法分辨',
  '不能分辨',
  '不明',
  '未知',
  '其他',
  'unable to determine',
  'unknown',
  'other',
  'n/a',
  'na',
])

/** Strong enum types that are safe to use as attachment name fallbacks. */
const STRONG_DOCUMENT_TYPES = new Set<OcrDocumentType>([
  'INVOICE',
  'RECEIPT',
  'CONTRACT',
  'BANK_SLIP',
  'QUOTATION',
  'STATEMENT',
])

export function looksLikeShortTypeLabel(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return false
  // Reject descriptions / compound attachment memos
  if (/[｜|，,。；;：:]/.test(trimmed)) return false
  if (/包含|包括|明細|項目|詳情|內容/.test(trimmed)) return false
  if (WEAK_TYPE_LABELS.has(trimmed.toLowerCase()) || WEAK_TYPE_LABELS.has(trimmed)) return false
  return Array.from(trimmed).length <= 12
}

/**
 * Infer a short HK document-type label from vendor/keywords when the model
 * leaves documentTypeNote empty or returns a weak UNKNOWN/OTHER.
 */
export function inferDocumentTypeNote(result: OcrParsedResult): string {
  const haystack = [
    result.vendor,
    result.documentTypeNote,
    ...(result.keywords || []),
    result.summary,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!haystack) return ''

  const rules: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /水費|水務|水務署|water\s*bill/, label: '水費單' },
    { pattern: /電費|中電|港燈|電燈|clp|hkelectric|electricity/, label: '電費單' },
    { pattern: /煤氣|towngas|gas\s*bill/, label: '煤氣單' },
    { pattern: /差餉|地租|rates/, label: '差餉單' },
    { pattern: /稅單|稅務|稅款|ird|tax\s*bill|tax\s*return/, label: '稅單' },
    { pattern: /信用卡|credit\s*card|消費月結|月結單|statement/, label: '消費月結單' },
    { pattern: /轉帳|轉賬|fps|faster\s*payment|銀行回單|入帳|入賬|bank\s*slip|bank\s*transfer/, label: '轉帳憑證' },
    { pattern: /薪金|工資|出糧|payroll|salary/, label: '薪金單' },
    { pattern: /報價|quotation|quote/, label: '報價單' },
    { pattern: /合約|合同|協議|contract|agreement/, label: '合約' },
    { pattern: /發票|invoice/, label: '發票' },
    { pattern: /收據|小票|receipt/, label: '收據' },
  ]

  for (const rule of rules) {
    if (rule.pattern.test(haystack)) return rule.label
  }

  if (result.documentType === 'STATEMENT') return '月結單'
  if (result.documentType === 'BANK_SLIP') return '銀行回單'
  return ''
}

/**
 * Content field: short keywords only (vendor, order no., keywords[]).
 * Default ≤60 chars for scannable list display.
 */
export function formatOcrKeywordsForContent(result: OcrParsedResult, maxChars = 60) {
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
  return truncateChars(out, maxChars)
}

/**
 * Note field: detailed narrative (summary). Does not include short keywords.
 */
export function formatOcrDetailForNote(result: OcrParsedResult, maxChars = 200) {
  const summary = String(result.summary || '').trim()
  if (!summary) return ''
  return truncateChars(summary, maxChars)
}

/**
 * @deprecated Prefer formatOcrKeywordsForContent + formatOcrDetailForNote.
 * Legacy: mixed keywords + summary into one note string.
 */
export function formatOcrKeywordsForNote(result: OcrParsedResult, maxChars = 80) {
  const parts = [
    result.vendor,
    result.orderNumber,
    result.summary,
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
  return truncateChars(out, maxChars)
}

/**
 * Attachment memo: category name ONLY (e.g. 消費月結單).
 * Never append summary / description.
 * Returns empty string when type cannot be determined (do not write「無法分辨」).
 */
export function formatOcrAttachmentMemo(
  result: OcrParsedResult,
  locale: 'zh-HK' | 'en',
  maxChars = 12
) {
  const type = result.documentType || 'UNKNOWN'
  const custom = (result.documentTypeNote || '').trim()
  if (looksLikeShortTypeLabel(custom)) {
    return truncateChars(custom, maxChars)
  }

  const inferred = inferDocumentTypeNote(result)
  if (looksLikeShortTypeLabel(inferred)) {
    return truncateChars(inferred, maxChars)
  }

  // Only fall back to localized enum labels for strong types — never OTHER/UNKNOWN.
  if (STRONG_DOCUMENT_TYPES.has(type)) {
    const fallback = OCR_DOCUMENT_TYPE_LABELS[type][locale === 'en' ? 'en' : 'zh-HK']
    return truncateChars(fallback, maxChars)
  }

  return ''
}

export function appendAttachmentMemo(existing: string | undefined | null, addition: string) {
  const base = (existing || '').trim()
  const add = (addition || '').trim()
  if (!add) return base
  if (!base) return add
  // Prefer replacing a previous short type label rather than growing a long memo
  if (looksLikeShortTypeLabel(base) && looksLikeShortTypeLabel(add)) {
    return add
  }
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
  return formatOcrKeywordsForNote(result, locale === 'en' ? 100 : 80)
}
