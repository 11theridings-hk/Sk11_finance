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

export type OcrParsedResult = {
  vendor?: string
  orderNumber?: string
  documentDate?: string
  amount?: string
  summary?: string
  keywords?: string[]
}

export const DEFAULT_OCR_SYSTEM_PROMPT = [
  '你是財務單據整理助手。',
  '請從圖片中提取最重要、最適合日後模糊搜尋的資料。',
  '優先識別：公司 / 商戶名稱、訂單 / 單據號碼、文件日期、總金額、內容概括、搜尋關鍵字。',
  '若資訊不確定，請保守輸出，不要虛構。',
  '請只輸出 JSON，不要輸出 markdown、解釋或額外文字。',
].join(' ')

export const DEFAULT_OCR_USER_PROMPT = [
  '請分析這張附件圖片，場景是：{{contextLabel}}。',
  '只輸出以下 JSON 結構：',
  '{"vendor":"","orderNumber":"","documentDate":"","amount":"","summary":"","keywords":["",""]}',
  'summary 請用一句短句概括內容，keywords 請放最適合日後搜尋的詞，例如公司名、產品 / 服務、單號。',
  '如某欄沒有資料可留空字串或空陣列。',
].join('\n')

const OCR_CONTEXT_LABELS: Record<OcrContext, string> = {
  'public-record': '公帳收支備註',
  'private-record': '私帳備註',
  contract: '合約備註',
  activity: '活動備註',
  'record-edit': '公帳修改申請備註',
  'activity-edit': '活動編輯備註',
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

export function normalizeOcrResult(value: any): OcrParsedResult {
  const keywords = Array.isArray(value?.keywords)
    ? value.keywords.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : []

  return {
    vendor: String(value?.vendor || '').trim(),
    orderNumber: String(value?.orderNumber || '').trim(),
    documentDate: String(value?.documentDate || '').trim(),
    amount: String(value?.amount || '').trim(),
    summary: String(value?.summary || '').trim(),
    keywords,
  }
}

export function formatOcrResultForNote(result: OcrParsedResult, locale: 'zh-HK' | 'en') {
  const labels =
    locale === 'en'
      ? {
          title: 'Image Recognition',
          vendor: 'Company',
          orderNumber: 'Order No.',
          documentDate: 'Date',
          amount: 'Amount',
          summary: 'Summary',
          keywords: 'Keywords',
        }
      : {
          title: '圖像辨識附件',
          vendor: '公司',
          orderNumber: '單據號碼',
          documentDate: '日期',
          amount: '金額',
          summary: '概要',
          keywords: '關鍵字',
        }

  const lines = [
    `[${labels.title}]`,
    `${labels.vendor}: ${result.vendor || '-'}`,
    `${labels.orderNumber}: ${result.orderNumber || '-'}`,
    `${labels.documentDate}: ${result.documentDate || '-'}`,
    `${labels.amount}: ${result.amount || '-'}`,
    `${labels.summary}: ${result.summary || '-'}`,
    `${labels.keywords}: ${result.keywords?.length ? result.keywords.join(', ') : '-'}`,
  ]

  return lines.join('\n')
}
