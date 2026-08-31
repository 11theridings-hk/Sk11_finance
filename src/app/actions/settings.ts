'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import {
  DEFAULT_OCR_SYSTEM_PROMPT,
  DEFAULT_OCR_USER_PROMPT,
  OCR_SETTING_KEYS,
} from '@/lib/ocr'

export type AISettings = {
  enabled: boolean
  model: string
  systemPrompt: string
  userPrompt: string
}

function getDefaultAISettings(): AISettings {
  return {
    enabled: (process.env.OCR_ENABLED || 'true') !== 'false',
    model: process.env.OCR_MODEL || 'gpt-4.1-mini',
    systemPrompt: DEFAULT_OCR_SYSTEM_PROMPT,
    userPrompt: DEFAULT_OCR_USER_PROMPT,
  }
}

async function assertAdmin() {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session || !session.isAdmin) {
    throw new Error(t('unauthorized'))
  }
}

export async function getAISettings() {
  const defaults = getDefaultAISettings()

  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: Object.values(OCR_SETTING_KEYS),
      },
    },
  })

  const map = new Map(settings.map((item) => [item.key, item.value]))

  return {
    enabled: map.get(OCR_SETTING_KEYS.enabled)
      ? map.get(OCR_SETTING_KEYS.enabled) === 'true'
      : defaults.enabled,
    model: map.get(OCR_SETTING_KEYS.model) || defaults.model,
    systemPrompt: map.get(OCR_SETTING_KEYS.systemPrompt) || defaults.systemPrompt,
    userPrompt: map.get(OCR_SETTING_KEYS.userPrompt) || defaults.userPrompt,
  } satisfies AISettings
}

export async function updateAISettings(input: AISettings) {
  try {
    await assertAdmin()

    const entries: Array<[string, string]> = [
      [OCR_SETTING_KEYS.enabled, String(input.enabled)],
      [OCR_SETTING_KEYS.model, input.model.trim()],
      [OCR_SETTING_KEYS.systemPrompt, input.systemPrompt.trim()],
      [OCR_SETTING_KEYS.userPrompt, input.userPrompt.trim()],
    ]

    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    )

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
