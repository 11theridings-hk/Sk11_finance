import prisma from '@/lib/prisma'
import {
  getReminderRecipients,
  isReminderEmailConfigured,
  sendReminderEmail,
} from '@/lib/email/resend'

export type ReminderEntityType = 'CONTRACT' | 'ACTIVITY'
export type ReminderKind =
  | 'advance'
  | 'd5'
  | 'due'
  | 'overdue_1'
  | 'overdue_7'
  | 'overdue_30'

export type ReminderCandidate = {
  entityType: ReminderEntityType
  entityId: string
  title: string
  targetDate: Date
  reminderDays: number
  daysDiff: number
  kinds: ReminderKind[]
  hrefPath: string
}

const KIND_LABEL_ZH: Record<ReminderKind, string> = {
  advance: '提前提醒日',
  d5: '到期前 5 天',
  due: '到期當天',
  overdue_1: '過期第 1 天',
  overdue_7: '過期第 7 天',
  overdue_30: '過期第 30 天',
}

/** Calendar YYYY-MM-DD in Asia/Hong_Kong */
export function hongKongYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

/** daysDiff = targetDay - today (HK calendar days) */
export function daysDiffHongKong(targetDate: Date, todayYmd = hongKongYmd()): number {
  const today = parseYmd(todayYmd)
  const targetYmd = hongKongYmd(targetDate)
  const target = parseYmd(targetYmd)
  const t0 = Date.UTC(today.y, today.m - 1, today.d)
  const t1 = Date.UTC(target.y, target.m - 1, target.d)
  return Math.round((t1 - t0) / 86400000)
}

export function matchReminderKinds(daysDiff: number, reminderDays: number): ReminderKind[] {
  const kinds: ReminderKind[] = []
  if (reminderDays > 0 && daysDiff === reminderDays) kinds.push('advance')
  if (daysDiff === 5) kinds.push('d5')
  if (daysDiff === 0) kinds.push('due')
  if (daysDiff === -1) kinds.push('overdue_1')
  if (daysDiff === -7) kinds.push('overdue_7')
  if (daysDiff === -30) kinds.push('overdue_30')

  // If advance and d5 collide (reminderDays === 5), keep both labels but one email;
  // still return both so logs cover each kind.
  return kinds
}

export function anchorDateYmd(targetDate: Date): string {
  return hongKongYmd(targetDate)
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || '').replace(/\/$/, '') || 'http://localhost:3000'
}

function formatDaysDiffLabel(daysDiff: number) {
  if (daysDiff > 0) return `尚餘 ${daysDiff} 天`
  if (daysDiff === 0) return '今天到期'
  return `已逾期 ${Math.abs(daysDiff)} 天`
}

function buildEmailContent(candidate: ReminderCandidate, kinds: ReminderKind[]) {
  const typeLabel = candidate.entityType === 'CONTRACT' ? '合約' : '公開活動'
  const reasonText = kinds.map((k) => KIND_LABEL_ZH[k]).join('、')
  const dateStr = hongKongYmd(candidate.targetDate)
  const link = `${appBaseUrl()}${candidate.hrefPath}`
  const subject = `[FINNE18 提醒] ${typeLabel}「${candidate.title}」· ${reasonText}`

  const text = [
    `FINNE18 到期提醒`,
    ``,
    `類型：${typeLabel}`,
    `標題：${candidate.title}`,
    `目標日：${dateStr}`,
    `狀態：${formatDaysDiffLabel(candidate.daysDiff)}`,
    `觸發原因：${reasonText}`,
    `提前提醒設定：${candidate.reminderDays} 天`,
    ``,
    `前往系統：${link}`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin: 0 0 12px; color: #1e3a5f;">FINNE18 到期提醒</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">類型</td><td style="padding: 6px 0; font-weight: 600;">${typeLabel}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">標題</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(candidate.title)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">目標日</td><td style="padding: 6px 0;">${dateStr}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">狀態</td><td style="padding: 6px 0;">${formatDaysDiffLabel(candidate.daysDiff)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">觸發原因</td><td style="padding: 6px 0;">${reasonText}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">提前提醒</td><td style="padding: 6px 0;">${candidate.reminderDays} 天</td></tr>
      </table>
      <p style="margin: 20px 0 0;">
        <a href="${link}" style="display: inline-block; background: #1e3a5f; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">開啟系統</a>
      </p>
    </div>
  `

  return { subject, html, text }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function collectReminderCandidates(todayYmd = hongKongYmd()): Promise<ReminderCandidate[]> {
  const [contracts, activities] = await Promise.all([
    prisma.contract.findMany({
      select: {
        id: true,
        title: true,
        expiryDate: true,
        reminderDays: true,
      },
    }),
    prisma.activity.findMany({
      where: { visibility: 'PUBLIC' },
      select: {
        id: true,
        title: true,
        eventDate: true,
        reminderDays: true,
      },
    }),
  ])

  const candidates: ReminderCandidate[] = []

  for (const c of contracts) {
    const daysDiff = daysDiffHongKong(c.expiryDate, todayYmd)
    const kinds = matchReminderKinds(daysDiff, c.reminderDays)
    if (!kinds.length) continue
    candidates.push({
      entityType: 'CONTRACT',
      entityId: c.id,
      title: c.title,
      targetDate: c.expiryDate,
      reminderDays: c.reminderDays,
      daysDiff,
      kinds,
      hrefPath: '/contracts',
    })
  }

  for (const a of activities) {
    const daysDiff = daysDiffHongKong(a.eventDate, todayYmd)
    const kinds = matchReminderKinds(daysDiff, a.reminderDays)
    if (!kinds.length) continue
    candidates.push({
      entityType: 'ACTIVITY',
      entityId: a.id,
      title: a.title,
      targetDate: a.eventDate,
      reminderDays: a.reminderDays,
      daysDiff,
      kinds,
      hrefPath: '/activities',
    })
  }

  return candidates
}

export type ReminderJobResult = {
  ok: boolean
  skippedReason?: string
  today: string
  sent: number
  skipped: number
  failed: number
  details: Array<{
    entityType: ReminderEntityType
    entityId: string
    title: string
    kinds: ReminderKind[]
    status: 'SENT' | 'SKIPPED' | 'FAILED'
    error?: string
  }>
}

export async function runReminderEmailJob(): Promise<ReminderJobResult> {
  const today = hongKongYmd()
  const details: ReminderJobResult['details'] = []

  if (!isReminderEmailConfigured()) {
    return {
      ok: true,
      skippedReason: 'RESEND_API_KEY or REMINDER_EMAILS not configured',
      today,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [],
    }
  }

  const recipients = getReminderRecipients()
  const candidates = await collectReminderCandidates(today)
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    const anchorDate = anchorDateYmd(candidate.targetDate)
    const pendingKinds: ReminderKind[] = []

    for (const kind of candidate.kinds) {
      const existing = await prisma.reminderEmailLog.findUnique({
        where: {
          entityType_entityId_kind_anchorDate: {
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            kind,
            anchorDate,
          },
        },
      })
      if (existing?.status === 'SENT') continue
      pendingKinds.push(kind)
    }

    if (!pendingKinds.length) {
      skipped += 1
      details.push({
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        title: candidate.title,
        kinds: candidate.kinds,
        status: 'SKIPPED',
      })
      continue
    }

    const { subject, html, text } = buildEmailContent(candidate, pendingKinds)
    const toEmails = recipients.join(',')

    try {
      await sendReminderEmail({ to: recipients, subject, html, text })

      for (const kind of pendingKinds) {
        await prisma.reminderEmailLog.upsert({
          where: {
            entityType_entityId_kind_anchorDate: {
              entityType: candidate.entityType,
              entityId: candidate.entityId,
              kind,
              anchorDate,
            },
          },
          create: {
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            kind,
            anchorDate,
            toEmails,
            subject,
            status: 'SENT',
          },
          update: {
            toEmails,
            subject,
            status: 'SENT',
            error: null,
            sentAt: new Date(),
          },
        })
      }

      sent += 1
      details.push({
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        title: candidate.title,
        kinds: pendingKinds,
        status: 'SENT',
      })
    } catch (e: any) {
      const message = e?.message || String(e)
      failed += 1

      for (const kind of pendingKinds) {
        try {
          await prisma.reminderEmailLog.upsert({
            where: {
              entityType_entityId_kind_anchorDate: {
                entityType: candidate.entityType,
                entityId: candidate.entityId,
                kind,
                anchorDate,
              },
            },
            create: {
              entityType: candidate.entityType,
              entityId: candidate.entityId,
              kind,
              anchorDate,
              toEmails,
              subject,
              status: 'FAILED',
              error: message.slice(0, 1000),
            },
            update: {
              status: 'FAILED',
              error: message.slice(0, 1000),
              subject,
              toEmails,
            },
          })
        } catch (_logErr) {
          /* ignore log write failure */
        }
      }

      details.push({
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        title: candidate.title,
        kinds: pendingKinds,
        status: 'FAILED',
        error: message,
      })
    }
  }

  return { ok: failed === 0, today, sent, skipped, failed, details }
}
