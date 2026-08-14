'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { revalidatePath } from 'next/cache'

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
  const session = await getSession()
  if (!session || !session.isAdmin) return { success: false, error: '权限不足' }

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.record.findUnique({ where: { id } })
      if (!record || record.status !== 'PENDING') throw new Error('记录不存在或已被审核')

      if (action === 'APPROVE') {
        // 如果是修改审核
        if (record.originalRecordId) {
          const oldRecord = await tx.record.findUnique({ where: { id: record.originalRecordId } })
          if (!oldRecord) throw new Error('原记录不存在')

          // 1. 撤销旧记录的影响 (如果是收支)
          if (oldRecord.poolId && (oldRecord.type === 'INCOME' || oldRecord.type === 'EXPENSE')) {
            if (oldRecord.currency === 'HKD') {
              await tx.capitalPool.update({
                where: { id: oldRecord.poolId },
                data: { balanceHkd: { decrement: oldRecord.amount } }
              })
            } else {
              await tx.capitalPool.update({
                where: { id: oldRecord.poolId },
                data: { balanceRmb: { decrement: oldRecord.amount } }
              })
            }
          }

          // 2. 施加新记录的影响 (如果是收支)
          if (record.poolId && (record.type === 'INCOME' || record.type === 'EXPENSE')) {
            if (record.currency === 'HKD') {
              await tx.capitalPool.update({
                where: { id: record.poolId },
                data: { balanceHkd: { increment: record.amount } }
              })
            } else {
              await tx.capitalPool.update({
                where: { id: record.poolId },
                data: { balanceRmb: { increment: record.amount } }
              })
            }
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
            if (record.currency === 'HKD') {
              await tx.capitalPool.update({
                where: { id: record.poolId },
                data: { balanceHkd: { increment: record.amount } }
              })
            } else {
              await tx.capitalPool.update({
                where: { id: record.poolId },
                data: { balanceRmb: { increment: record.amount } }
              })
            }
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

