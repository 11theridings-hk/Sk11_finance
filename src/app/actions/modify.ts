'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export async function requestModifyRecord(originalId: string, data: any) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) return { success: false, error: t('notLoggedIn') }

    const originalRecord = await prisma.record.findUnique({ where: { id: originalId } })
    if (!originalRecord) return { success: false, error: t('originalRecordNotFound') }
    
    // 权限校验：必须是记录所有者或管理员
    if (originalRecord.userId !== session.userId && !session.isAdmin) {
      return { success: false, error: t('canOnlyModifyOwnRecord') }
    }

    if (originalRecord.isReviewing) return { success: false, error: t('reviewingInProgress') }

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
