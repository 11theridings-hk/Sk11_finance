import { resolveOcrEndpoint } from '@/lib/ocr'

/** 預設 WhatsApp LLM 模型；與 OCR 的 getAISettings().model 分開。 */
export const DEFAULT_WHATSAPP_LLM_MODEL = 'deepseek/deepseek-v4-pro-0813'

export type WhatsAppLlmConfig = {
  enabled: boolean
  inbound: boolean
  outbound: boolean
  model: string
  apiKey: string
  endpoint: string
  timeoutMs: number
}

export function getWhatsAppLlmConfig(): WhatsAppLlmConfig {
  const apiKey = process.env.OCR_API_KEY?.trim() || ''
  const enabledEnv = (process.env.WHATSAPP_LLM_ENABLED || 'true').toLowerCase()
  const inboundEnv = (process.env.WHATSAPP_LLM_INBOUND || 'true').toLowerCase()
  const outboundEnv = (process.env.WHATSAPP_LLM_OUTBOUND || 'true').toLowerCase()
  return {
    enabled: enabledEnv !== 'false' && Boolean(apiKey),
    inbound: inboundEnv !== 'false',
    outbound: outboundEnv !== 'false',
    model: process.env.WHATSAPP_LLM_MODEL?.trim() || DEFAULT_WHATSAPP_LLM_MODEL,
    apiKey,
    endpoint: resolveOcrEndpoint(process.env.OCR_API_BASE_URL),
    timeoutMs: Number(process.env.WHATSAPP_LLM_TIMEOUT_MS || 25000),
  }
}

export async function whatsappLlmChatCompletion(input: {
  system: string
  user: string
  temperature?: number
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cfg = getWhatsAppLlmConfig()
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, error: 'WhatsApp LLM not configured' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: input.temperature ?? 0.2,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
      choices?: Array<{ message?: { content?: string } }>
    }

    if (!response.ok) {
      return {
        ok: false,
        error: json?.error?.message || `LLM HTTP ${response.status}`,
      }
    }

    const text = json.choices?.[0]?.message?.content?.trim() || ''
    if (!text) return { ok: false, error: 'LLM returned empty content' }
    return { ok: true, text }
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? e.name === 'AbortError'
          ? 'LLM timeout'
          : e.message
        : 'LLM request failed'
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}
