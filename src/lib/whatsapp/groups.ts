import prisma from '@/lib/prisma'

/** SystemSetting：提醒／廣播目標群組（JSON 陣列） */
export const WHATSAPP_REMINDER_GROUPS_KEY = 'whatsapp.reminder_groups'

export type WhatsAppGroupTarget = {
  /** 穩定群組 JID，例如 1203630…@g.us */
  jid: string
  /** 顯示名稱（可改；發送以 jid 為準） */
  name: string
}

/**
 * 正規化群組 JID：必須為 `數字@g.us`。
 * 僅輸入數字時自動補 `@g.us`。
 */
export function normalizeGroupJid(input: string | null | undefined): string {
  if (!input) return ''
  let raw = String(input).trim()
  if (!raw) return ''

  // 常見完整 JID
  const lower = raw.toLowerCase()
  if (lower.endsWith('@g.us')) {
    const user = raw.slice(0, raw.indexOf('@')).replace(/\D/g, '')
    return user ? `${user}@g.us` : ''
  }

  // 誤貼私人 chat id
  if (lower.endsWith('@c.us') || lower.endsWith('@s.whatsapp.net')) {
    return ''
  }

  const digits = raw.replace(/\D/g, '')
  // 群組 id 通常頗長；至少 10 位避免誤把電話當群組
  if (digits.length < 10) return ''
  return `${digits}@g.us`
}

export function parseReminderGroupsJson(raw: string | null | undefined): WhatsAppGroupTarget[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: WhatsAppGroupTarget[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const jid = normalizeGroupJid(String(rec.jid || rec.id || ''))
      if (!jid || seen.has(jid)) continue
      seen.add(jid)
      const name = String(rec.name || '').trim() || jid
      out.push({ jid, name })
    }
    return out
  } catch {
    return []
  }
}

export async function getWhatsAppReminderGroups(): Promise<WhatsAppGroupTarget[]> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: WHATSAPP_REMINDER_GROUPS_KEY },
    })
    return parseReminderGroupsJson(row?.value)
  } catch {
    return []
  }
}

export async function saveWhatsAppReminderGroups(
  groups: WhatsAppGroupTarget[],
): Promise<WhatsAppGroupTarget[]> {
  const seen = new Set<string>()
  const normalized: WhatsAppGroupTarget[] = []
  for (const g of groups) {
    const jid = normalizeGroupJid(g.jid)
    if (!jid || seen.has(jid)) continue
    seen.add(jid)
    normalized.push({
      jid,
      name: (g.name || '').trim() || jid,
    })
  }

  await prisma.systemSetting.upsert({
    where: { key: WHATSAPP_REMINDER_GROUPS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: WHATSAPP_REMINDER_GROUPS_KEY, value: JSON.stringify(normalized) },
  })
  return normalized
}
