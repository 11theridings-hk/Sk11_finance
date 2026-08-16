'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'

export async function requestModifyRecord(originalId: string, data: any) {
  try {
    const session = await getSession()
    if (!session) return { success: false, error: '未登录' }

    const originalRecord = await prisma.record.findUnique({ where: { id: originalId } })
    if (!originalRecord) return { success: false, error: '原记录不存在' }
    
    // 权限校验：必须是记录所有者或管理员
    if (originalRecord.userId !== session.userId && !session.isAdmin) {
      return { success: false, error: '权限不足：只能修改自己的记录' }
    }

    if (originalRecord.isReviewing) return { success: false, error: '该记录正在修改审核中' }

    await prisma.$transaction(async (tx) => {
      // 标记原记录正在审核中
      await tx.record.update({
        where: { id: originalId },
        data: { isReviewing: true }
      })

      // 创建一个 Pending 的新记录
      await tx.record.create({
        data: {
          type: data.type,
          status: 'PENDING',
          date: new Date(data.date),
          note: data.note,
          currency: data.currency,
          amount: data.amount,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId || undefined,
          poolId: data.poolId || undefined,
          userId: originalRecord.userId, // 保持原作者
          originalRecordId: originalId,
        }
      })
    })

    revalidatePath('/report')
    revalidatePath('/review')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
