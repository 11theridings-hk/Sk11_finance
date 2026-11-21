import prisma from '@/lib/prisma'
import {
  DEFAULT_PLUGIN_FLAGS,
  PLUGIN_SETTING_KEYS,
  type PluginFlags,
  type PluginId,
} from '@/lib/plugins'
import type { WhatsAppActor } from './identity'

export async function loadWhatsAppPluginFlags(): Promise<PluginFlags> {
  const keys = Object.values(PLUGIN_SETTING_KEYS)
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const flags = { ...DEFAULT_PLUGIN_FLAGS }
  for (const id of Object.keys(PLUGIN_SETTING_KEYS) as PluginId[]) {
    const raw = map.get(PLUGIN_SETTING_KEYS[id])
    if (raw === '0' || raw === 'false') flags[id] = false
    if (raw === '1' || raw === 'true') flags[id] = true
  }
  return flags
}

/**
 * 以指定用戶身分建立事項（不依賴 cookie session）。
 */
export async function createMatterForWhatsApp(input: {
  actor: WhatsAppActor
  title: string
  eventDate: Date
  reminderDays: number
  visibility: 'PUBLIC' | 'PRIVATE'
  note?: string
}) {
  const note = input.note
    ? `[WhatsApp] ${input.note}`
    : '[WhatsApp]'

  const activity = await prisma.activity.create({
    data: {
      title: input.title.trim(),
      note,
      eventDate: input.eventDate,
      reminderDays: Math.max(0, Math.floor(input.reminderDays)),
      visibility: input.visibility,
      userId: input.actor.userId,
    },
  })

  return { activity }
}

export async function listMattersForWhatsApp(actor: WhatsAppActor, limit = 8) {
  return prisma.activity.findMany({
    where: {
      OR: [{ visibility: 'PUBLIC' }, { userId: actor.userId }],
    },
    orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      eventDate: true,
      reminderDays: true,
      visibility: true,
      userId: true,
      note: true,
    },
  })
}

export function parseMatterCreateCommand(text: string): {
  title: string
  eventDate: Date
  reminderDays: number
  visibility: 'PUBLIC' | 'PRIVATE'
  note?: string
} | null {
  // 事項 標題|YYYY-MM-DD[|提醒天][|公開|私人][|備註]
  // matter Title|YYYY-MM-DD[|days][|public|private][|note]
  const matched =
    /^(新建事項|建立事項|新增事項|事項建立|事項|create\s+matter|new\s+matter|matter)\s+(.+)$/iu.exec(
      text.trim(),
    )
  if (!matched) return null

  const stripped = matched[2]!.trim()
  const pipeParts = stripped.split('|').map((p) => p.trim())
  if (pipeParts.length < 2) return null

  const title = pipeParts[0]
  const dateRaw = pipeParts[1]
  if (!title || !dateRaw) return null

  const eventDate = parseYmd(dateRaw)
  if (!eventDate) return null

  let reminderDays = 15
  let visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE'
  const restTokens: string[] = []

  for (const part of pipeParts.slice(2)) {
    const tokens = part.split(/\s+/).filter(Boolean)
    for (const tok of tokens) {
      if (/^\d+$/.test(tok)) {
        reminderDays = Number(tok)
        continue
      }
      if (/^(公開|公|public)$/i.test(tok)) {
        visibility = 'PUBLIC'
        continue
      }
      if (/^(私人|私|private)$/i.test(tok)) {
        visibility = 'PRIVATE'
        continue
      }
      restTokens.push(tok)
    }
  }

  return {
    title,
    eventDate,
    reminderDays,
    visibility,
    note: restTokens.length ? restTokens.join(' ') : undefined,
  }
}

function parseYmd(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

export { parseYmd }
