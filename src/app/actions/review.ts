'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { revalidatePath } from 'next/cache'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export async function getPendingReviewCount() {
  const session = await getSession()
  if (!session || !session.isAdmin) return 0

  return await prisma.record.count({
    where: { status: 'PENDING' }
  })
}

export async function getReviewRecords(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  const session = await getSession()
  if (!session || !session.isAdmin) return []

  return await prisma.record.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      subCategory: true,
      user: true,
      pool: true,
      originalRecord: true
    }
  })
}

export async function reviewRecord(id: string, action: 'APPROVE' | 'REJECT') {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()
  if (!session || !session.isAdmin) return { success: false, error: t('unauthorized') }

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.record.findUnique({ where: { id } })
      if (!record || record.status !== 'PENDING') throw new Error(t('recordAlreadyReviewed'))

      if (action === 'APPROVE') {
        // 如果是修改审核
        if (record.originalRecordId) {
          const oldRecord = await tx.record.findUnique({ where: { id: record.originalRecordId } })
          if (!oldRecord) throw new Error(t('originalRecordNotFound'))

          // 1. 撤销旧记录的影响 (如果是收支)
          if (oldRecord.poolId && (oldRecord.type === 'INCOME' || oldRecord.type === 'EXPENSE')) {
            await tx.capitalPool.update({
              where: { id: oldRecord.poolId },
              data: { balanceHkd: { decrement: oldRecord.amount } }
            })
          }

          // 2. 施加新记录的影响 (如果是收支)
          if (record.poolId && (record.type === 'INCOME' || record.type === 'EXPENSE')) {
            await tx.capitalPool.update({
              where: { id: record.poolId },
              data: { balanceHkd: { increment: record.amount } }
            })
          }

          // 3. 替换旧记录的值
          await tx.record.update({
            where: { id: record.originalRecordId },
            data: {
              amount: record.amount,
              categoryId: record.categoryId,
              subCategoryId: record.subCategoryId,
              note: record.note,
              date: record.date,
              type: record.type,
              poolId: record.poolId,
              isReviewing: false
            }
          })
          // 删除 pending 的修改副本
          await tx.record.delete({ where: { id } })
        } else {
          // 新增审核
          await tx.record.update({
            where: { id },
            data: { status: 'APPROVED' }
          })
          // 更新资金池
          if (record.poolId && (record.type === 'INCOME' || record.type === 'EXPENSE')) {
            await tx.capitalPool.update({
              where: { id: record.poolId },
              data: { balanceHkd: { increment: record.amount } }
            })
          }
        }
      } else {
        // REJECT
        if (record.originalRecordId) {
          // 恢复旧记录状态
          await tx.record.update({
            where: { id: record.originalRecordId },
            data: { isReviewing: false }
          })
        }
        await tx.record.update({
          where: { id },
          data: { status: 'REJECTED' }
        })
      }
    })

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath('/report')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
