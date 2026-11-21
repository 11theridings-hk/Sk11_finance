import prisma from '@/lib/prisma'
import type { WhatsAppActor } from './identity'
import { parseYmd } from './matters'
import { resolveDefaultPool } from './ledger'

/**
 * 管理員經 WhatsApp 建立合約草稿（標題／類型／日期；金額可選，預設 0）。
 */
export async function createContractDraftForWhatsApp(input: {
  actor: WhatsAppActor
  title: string
  type: 'INCOME' | 'EXPENSE'
  effectiveDate: Date
  expiryDate: Date
  reminderDays: number
  amount: number
  poolId?: string
  note?: string
}) {
  if (!input.actor.isAdmin) {
    throw new Error('Contract create is admin-only')
  }
  if (input.expiryDate.getTime() < input.effectiveDate.getTime()) {
    throw new Error('expiry before effective')
  }

  const note = input.note ? `[WhatsApp] ${input.note}` : '[WhatsApp]'

  const contract = await prisma.contract.create({
    data: {
      title: input.title.trim(),
      type: input.type,
      effectiveDate: input.effectiveDate,
      expiryDate: input.expiryDate,
      reminderDays: Math.max(0, Math.floor(input.reminderDays)),
      amount: input.amount,
      note,
      poolId: input.poolId,
      userId: input.actor.userId,
    },
  })

  return { contract }
}

/**
 * 合約草稿 標題|收|生效YYYY-MM-DD|到期YYYY-MM-DD[|金額[|提醒天]] [@池] [備註]
 * contract draft Title|income|YYYY-MM-DD|YYYY-MM-DD[|amount[|days]] [@pool] [note]
 */
export async function parseContractDraftCommand(
  text: string,
  actor: WhatsAppActor,
): Promise<{
  title: string
  type: 'INCOME' | 'EXPENSE'
  effectiveDate: Date
  expiryDate: Date
  reminderDays: number
  amount: number
  poolId?: string
  poolLabel?: string
  note?: string
} | null> {
  const matched =
    /^(合約草稿|合同草稿|新建合約|建立合約|contract\s+draft|new\s+contract|create\s+contract)\s+(.+)$/iu.exec(
      text.trim(),
    )
  if (!matched) return null

  let body = matched[2]!.trim()
  let poolHint: string | undefined
  const atIdx = body.lastIndexOf('@')
  if (atIdx >= 0) {
    const afterAt = body.slice(atIdx + 1).trim()
    const atParts = afterAt.split(/\s+/)
    poolHint = atParts[0] || undefined
    const afterPool = atParts.slice(1).join(' ').trim()
    body = `${body.slice(0, atIdx).trim()}${afterPool ? ` ${afterPool}` : ''}`.trim()
  }

  const parts = body.split('|').map((p) => p.trim())
  if (parts.length < 4) return null

  const title = parts[0]
  const typeRaw = parts[1]
  const effectiveDate = parseYmd(parts[2] || '')
  const expiryDate = parseYmd(parts[3] || '')
  if (!title || !effectiveDate || !expiryDate) return null

  const type: 'INCOME' | 'EXPENSE' | null =
    /^(收|收入|income|inc)$/i.test(typeRaw || '')
      ? 'INCOME'
      : /^(支|支出|expense|exp)$/i.test(typeRaw || '')
        ? 'EXPENSE'
        : null
  if (!type) return null

  let amount = 0
  let reminderDays = 15
  const noteParts: string[] = []

  if (parts[4] !== undefined && parts[4] !== '') {
    const a = Number(parts[4])
    if (Number.isFinite(a) && a >= 0) amount = a
    else noteParts.push(parts[4])
  }
  if (parts[5] !== undefined && parts[5] !== '') {
    const r = Number(parts[5])
    if (Number.isFinite(r) && r >= 0 && Number.isInteger(r)) reminderDays = r
    else noteParts.push(parts[5])
  }
  for (const extra of parts.slice(6)) {
    if (extra) noteParts.push(extra)
  }

  const pool = await resolveDefaultPool(actor, poolHint)

  return {
    title,
    type,
    effectiveDate,
    expiryDate,
    reminderDays,
    amount,
    poolId: pool.poolId,
    poolLabel: pool.poolLabel,
    note: noteParts.length ? noteParts.join(' ') : undefined,
  }
}
