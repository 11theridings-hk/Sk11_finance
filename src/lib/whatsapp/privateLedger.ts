import prisma from '@/lib/prisma'
import type { WhatsAppActor } from './identity'
import { resolveCategoryPath } from './ledger'

/**
 * 以指定用戶身分建立私帳收支（不依賴 cookie session）。
 * 僅寫入 actor.userId 擁有之 PrivateRecord。
 */
export async function createPrivateLedgerForWhatsApp(input: {
  actor: WhatsAppActor
  type: 'INCOME' | 'EXPENSE'
  amountAbs: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  customCategory?: string
  note?: string
  date?: Date
}) {
  const amount =
    input.type === 'EXPENSE' ? -Math.abs(input.amountAbs) : Math.abs(input.amountAbs)
  const date = input.date || new Date()
  const note = input.note ? `[WhatsApp] ${input.note}` : '[WhatsApp]'

  const record = await prisma.privateRecord.create({
    data: {
      type: input.type,
      date,
      note,
      customCategory: input.customCategory?.trim() || null,
      amount,
      categoryId: input.categoryId,
      subCategoryId: input.subCategoryId,
      thirdCategoryId: input.thirdCategoryId,
      userId: input.actor.userId,
    },
  })

  return { record, amount }
}

export async function resolvePrivateCategoryPath(
  type: 'INCOME' | 'EXPENSE',
  nameHint: string | undefined,
) {
  // 私帳與公帳共用 Category 樹；未指定時走未分类／未分類
  return resolveCategoryPath(type, nameHint)
}

export async function getRecentPrivateRecordsForUser(userId: string, limit = 5) {
  return prisma.privateRecord.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      category: { select: { name: true } },
    },
  })
}

export async function getPrivateMonthSummaryForUser(userId: string) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const records = await prisma.privateRecord.findMany({
    where: {
      userId,
      date: { gte: start, lte: end },
    },
    select: { type: true, amount: true },
  })

  let income = 0
  let expense = 0
  for (const r of records) {
    if (r.amount >= 0) income += r.amount
    else expense += Math.abs(r.amount)
  }

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    income,
    expense,
    net: income - expense,
    count: records.length,
  }
}
