'use server'

import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator, normalizeLocale } from '@/lib/i18n'
import { getAISettings } from './settings'
import {
  fillOcrUserPrompt,
  formatOcrResultForNote,
  normalizeOcrResult,
  parseJsonFromText,
  resolveOcrEndpoint,
  type OcrContext,
} from '@/lib/ocr'

type RecognizeAttachmentInput = {
  imageDataUrl: string
  context: OcrContext
}

function extractAssistantText(payload: any) {
  const firstChoice = payload?.choices?.[0]
  const content = firstChoice?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'output_text') return item.text || ''
        if (item?.type === 'text') return item.text || ''
        return ''
      })
      .join('\n')
  }

  return ''
}

export async function recognizeAttachmentNote(input: RecognizeAttachmentInput) {
  try {
    const locale = normalizeLocale(await getCurrentLocale())
    const t = createTranslator(locale)
    const session = await getSession()

    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    if (!input.imageDataUrl?.startsWith('data:image/')) {
      throw new Error(t('ocrInvalidImage'))
    }

    const apiKey = process.env.OCR_API_KEY
    if (!apiKey) {
      throw new Error(t('ocrApiKeyMissing'))
    }

    const settings = await getAISettings()
    if (!settings.enabled) {
      throw new Error(t('ocrDisabled'))
    }

    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS || 30000)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(resolveOcrEndpoint(process.env.OCR_API_BASE_URL), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: settings.systemPrompt,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: fillOcrUserPrompt(settings.userPrompt, input.context),
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: input.imageDataUrl,
                  },
                },
              ],
            },
          ],
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error?.message || t('ocrRequestFailed'))
      }

      const text = extractAssistantText(payload)
      const parsed = normalizeOcrResult(parseJsonFromText(text))
      const noteText = formatOcrResultForNote(parsed, locale)

      return {
        success: true,
        noteText,
        parsed,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
