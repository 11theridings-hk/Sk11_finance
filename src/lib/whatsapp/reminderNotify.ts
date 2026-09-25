import { sendWhatsAppText } from './client'
import { getWhatsAppConfig, isWhatsAppOutboundReady } from './config'
import { getWhatsAppReminderGroups } from './groups'
import { normalizePhoneE164 } from './phone'

/**
 * 到期提醒的 WhatsApp 私人收件人（純數字 E.164）。
 * 環境變數 WHATSAPP_REMINDER_PHONES="85291111111,85292222222"
 */
export function getWhatsAppReminderRecipients(): string[] {
  const raw = process.env.WHATSAPP_REMINDER_PHONES || ''
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => normalizePhoneE164(s))
        .filter((p) => p.length >= 8),
    ),
  ]
}

export async function isWhatsAppReminderConfigured() {
  if (!isWhatsAppOutboundReady(getWhatsAppConfig())) return false
  const phones = getWhatsAppReminderRecipients()
  if (phones.length > 0) return true
  const groups = await getWhatsAppReminderGroups()
  return groups.length > 0
}

export async function sendWhatsAppReminder(input: {
  subject: string
  body: string
}): Promise<{ ok: boolean; sent: number; failed: number; errors: string[] }> {
  if (!(await isWhatsAppReminderConfigured())) {
    return { ok: false, sent: 0, failed: 0, errors: ['WhatsApp reminders not configured'] }
  }

  const phones = getWhatsAppReminderRecipients()
  const groups = await getWhatsAppReminderGroups()
  if (phones.length === 0 && groups.length === 0) {
    return { ok: false, sent: 0, failed: 0, errors: ['WhatsApp reminders not configured'] }
  }

  const text = `🔔 ${input.subject}\n\n${input.body}`
  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const phone of phones) {
    const result = await sendWhatsAppText(phone, text)
    if (result.ok) sent += 1
    else {
      failed += 1
      errors.push(`${phone}: ${result.error || 'send failed'}`)
    }
  }

  for (const group of groups) {
    const result = await sendWhatsAppText(group.jid, text)
    if (result.ok) sent += 1
    else {
      failed += 1
      errors.push(`${group.name || group.jid}: ${result.error || 'send failed'}`)
    }
  }

  return { ok: failed === 0, sent, failed, errors }
}
