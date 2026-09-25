'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import {
  getWhatsAppAllowedPhones,
  saveWhatsAppAllowedPhones,
  type AllowedPhonesSource,
} from '@/lib/whatsapp/allowlist'
import { normalizePhoneE164 } from '@/lib/whatsapp/phone'
import { mirrorPhoneToUserProfile } from '@/lib/whatsapp/phoneSync'

export type WhatsAppAllowlistSnapshot = {
  phones: string[]
  source: AllowedPhonesSource
  /** 是否有強制白名單（source 非 none） */
  enforced: boolean
}

/**
 * 管理員：讀取目前有效的 WhatsApp 允許電話清單。
 */
export async function getWhatsAppAllowlist(): Promise<WhatsAppAllowlistSnapshot> {
  const session = await getSession()
  if (!session?.isAdmin) {
    return { phones: [], source: 'none', enforced: false }
  }
  try {
    const state = await getWhatsAppAllowedPhones()
    return {
      phones: state.phones,
      source: state.source,
      enforced: state.enforced !== null,
    }
  } catch {
    return { phones: [], source: 'none', enforced: false }
  }
}

/**
 * 管理員：覆寫整份白名單（寫入 SystemSetting）。
 */
export async function updateWhatsAppAllowlist(phones: string[]) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  try {
    const saved = await saveWhatsAppAllowedPhones(phones)
    revalidatePath('/admin')
    return { success: true as const, phones: saved }
  } catch (error: unknown) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : t('whatsappAllowlistFail'),
    }
  }
}

/**
 * 管理員：新增一組白名單電話。
 */
export async function addWhatsAppAllowlistPhone(phone: string) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  const phoneE164 = normalizePhoneE164(phone)
  if (!phoneE164 || phoneE164.length < 8) {
    return { success: false as const, error: t('whatsappAllowlistInvalid') }
  }

  try {
    const current = await getWhatsAppAllowedPhones()
    if (current.phones.includes(phoneE164)) {
      return { success: true as const, phones: current.phones }
    }
    const saved = await saveWhatsAppAllowedPhones([...current.phones, phoneE164])
    revalidatePath('/admin')
    return { success: true as const, phones: saved }
  } catch (error: unknown) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : t('whatsappAllowlistFail'),
    }
  }
}

/**
 * 管理員：從白名單移除一組電話。
 */
export async function removeWhatsAppAllowlistPhone(phone: string) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  const phoneE164 = normalizePhoneE164(phone)
  if (!phoneE164) {
    return { success: false as const, error: t('whatsappAllowlistInvalid') }
  }

  try {
    const current = await getWhatsAppAllowedPhones()
    const next = current.phones.filter((p) => p !== phoneE164)
    const saved = await saveWhatsAppAllowedPhones(next)
    revalidatePath('/admin')
    return { success: true as const, phones: saved }
  } catch (error: unknown) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : t('whatsappAllowlistFail'),
    }
  }
}

/**
 * 管理員：綁定／更新 WhatsApp 電話與用戶。
 */
export async function upsertWhatsAppBinding(userId: string, phone: string, enabled = true) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  const phoneE164 = normalizePhoneE164(phone)
  if (!phoneE164 || phoneE164.length < 8) {
    return { success: false as const, error: '電話格式無效（請含國碼，如 85291234567）' }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return { success: false as const, error: '用戶不存在' }

  // 若電話已被其他人綁定，先解除
  const existing = await prisma.whatsAppBinding.findUnique({ where: { phoneE164 } })
  if (existing && existing.userId !== userId) {
    await prisma.whatsAppBinding.delete({ where: { id: existing.id } })
  }

  // 一人一號：清掉該用戶其他綁定
  await prisma.whatsAppBinding.deleteMany({
    where: { userId, phoneE164: { not: phoneE164 } },
  })

  const binding = await prisma.whatsAppBinding.upsert({
    where: { phoneE164 },
    create: { phoneE164, userId, enabled },
    update: { userId, enabled },
  })

  // 反寫個人資料聯絡電話，方便身份識別與列表顯示
  if (enabled) {
    await mirrorPhoneToUserProfile(userId, phoneE164)
  }

  return { success: true as const, binding }
}

export async function listWhatsAppBindings() {
  const session = await getSession()
  if (!session?.isAdmin) return []

  try {
    return await prisma.whatsAppBinding.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, roleName: true, email: true, isAdmin: true } },
      },
    })
  } catch {
    // 遷移尚未套用時避免管理頁崩潰
    return []
  }
}

export async function removeWhatsAppBinding(bindingId: string) {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session?.isAdmin) {
    return { success: false as const, error: t('unauthorized') }
  }

  await prisma.whatsAppBinding.delete({ where: { id: bindingId } })
  return { success: true as const }
}
