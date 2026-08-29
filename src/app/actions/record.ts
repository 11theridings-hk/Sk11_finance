'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

export type CreateRecordInput = {
  type: 'INCOME' | 'EXPENSE'
  date: Date
  note?: string
  amount: number
  attachmentUrl?: string
  categoryId: string
  subCategoryId?: string
  poolId?: string
  attachmentSize?: number
}

export async function createRecord(data: CreateRecordInput) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) throw new Error(t('notLoggedIn'))
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. 判断是否需要审核
      let status = 'APPROVED'
      if (data.poolId) {
        const pool = await tx.capitalPool.findUnique({ where: { id: data.poolId } })
        if (pool?.isReviewRequired) {
          status = 'PENDING'
        }
      }

      // 2. 创建记录
      const record = await tx.record.create({
        data: {
          type: data.type,
          status,
          date: data.date,
          note: data.note,
          amount: data.amount, // 前端传过来的已处理好正负
          attachmentUrl: data.attachmentUrl,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          poolId: data.poolId,
          userId: session.userId,
        }
      })

      // 3. 记录附件（如果有）
      if (data.attachmentUrl && data.attachmentSize) {
        await tx.attachment.create({
          data: {
            fileUrl: data.attachmentUrl,
            size: data.attachmentSize,
            uploaderId: session.userId,
            categoryId: data.categoryId
          }
        })
      }

      // 4. 更新资金池余额 (如果是已审核的收支)
      if (status === 'APPROVED' && data.poolId) {
        await tx.capitalPool.update({
          where: { id: data.poolId },
          data: { balanceHkd: { increment: data.amount } }
        })
      }

      return record
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/admin')
    revalidatePath('/review')
    return { success: true, record: result }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getUserStats(userId: string) {
  const session = await getSession()
  if (!session) return { balance: 0 }
  if (session.userId !== userId && !session.isAdmin) {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    throw new Error(t('unauthorized'))
  }

  const records = await prisma.record.findMany({
    where: { 
      userId,
      status: 'APPROVED'
    },
    select: { amount: true }
  })

  const balance = records.reduce((sum, record) => sum + record.amount, 0)
  return { balance }
}

export async function getRecentRecords(userId?: string) {
  const session = await getSession()
  if (!session) return []
  if (userId && session.userId !== userId && !session.isAdmin) {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    throw new Error(t('unauthorized'))
  }

  const queryUserId = (!session.isAdmin && !userId) ? session.userId : userId

  return await prisma.record.findMany({
    where: queryUserId ? { userId: queryUserId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      user: { select: { roleName: true } }
    }
  })
}

export async function getAttachments() {
  const session = await getSession()
  if (!session) return []
  
  return await prisma.attachment.findMany({
    where: !session.isAdmin ? { uploaderId: session.userId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      uploader: { select: { roleName: true } },
      category: { select: { name: true } }
    }
  })
}
