import { Resend } from 'resend'

export function getReminderRecipients(): string[] {
  const raw = process.env.REMINDER_EMAILS || ''
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export function isReminderEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && getReminderRecipients().length > 0)
}

export async function sendReminderEmail(input: {
  to: string[]
  subject: string
  html: string
  text: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'FINNE18 <onboarding@resend.dev>'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  if (!input.to.length) {
    throw new Error('No reminder recipients configured')
  }

  const resend = new Resend(apiKey)
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })

  if (result.error) {
    throw new Error(result.error.message || 'Resend send failed')
  }

  return result.data
}
