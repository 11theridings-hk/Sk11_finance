'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

export type CreateRecordInput = {
  type: 'INCOME' | 'EXPENSE'
  date: Date
  note?: string
  amount: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  attachment?: AttachmentPayload
}

function getDeepestCategoryId(data: {
  categoryId: string
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}) {
  return data.thirdCategoryId || data.subCategoryId || data.categoryId
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
          attachmentUrl: data.attachment?.url,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          thirdCategoryId: data.thirdCategoryId,
          poolId: data.poolId,
          userId: session.userId,
        }
      })

      // 3. 记录附件（如果有）
      if (data.attachment) {
        await tx.attachment.create({
          data: {
            fileUrl: data.attachment.url,
            size: data.attachment.size,
            note: data.attachment.note,
            uploaderId: session.userId,
            categoryId: getDeepestCategoryId(data),
            recordId: record.id
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
      thirdCategory: { select: { name: true } },
      user: { select: { roleName: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: {
          uploader: { select: { roleName: true } }
        }
      },
      memos: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { roleName: true } }
        }
      }
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
      category: { select: { name: true } },
      record: { select: { id: true, note: true, date: true } },
      contract: { select: { id: true, title: true, expiryDate: true } }
    }
  })
}

async function assertRecordPermission(recordId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }

  const record = await prisma.record.findUnique({
    where: { id: recordId }
  })

  if (!record) {
    throw new Error(t('recordNotFound'))
  }

  if (record.userId !== session.userId && !session.isAdmin) {
    throw new Error(t('canOnlyModifyOwnRecord'))
  }

  return { session, record, t }
}

export async function addRecordAttachment(recordId: string, attachment: AttachmentPayload) {
  try {
    const { session, record } = await assertRecordPermission(recordId)

    await prisma.$transaction(async (tx) => {
      await tx.attachment.create({
        data: {
          fileUrl: attachment.url,
          size: attachment.size,
          note: attachment.note,
          uploaderId: session.userId,
          categoryId: getDeepestCategoryId(record),
          recordId
        }
      })

      if (!record.attachmentUrl) {
        await tx.record.update({
          where: { id: recordId },
          data: { attachmentUrl: attachment.url }
        })
      }
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/review')
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addRecordMemo(recordId: string, content: string) {
  try {
    const { session } = await assertRecordPermission(recordId)

    await prisma.memo.create({
      data: {
        content,
        authorId: session.userId,
        recordId
      }
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/review')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteRecord(recordId: string) {
  try {
    const { record, session } = await assertRecordPermission(recordId)

    await prisma.$transaction(async (tx) => {
      if (record.originalRecordId) {
        await tx.memo.deleteMany({ where: { recordId } })
        await tx.attachment.deleteMany({ where: { recordId } })
        await tx.record.delete({ where: { id: recordId } })

        if (record.status === 'PENDING') {
          await tx.record.update({
            where: { id: record.originalRecordId },
            data: { isReviewing: false }
          })
        }
        return
      }

      const modificationIds = await tx.record.findMany({
        where: { originalRecordId: recordId },
        select: { id: true }
      })
      const relatedIds = modificationIds.map((item) => item.id)

      if (record.status === 'APPROVED' && record.poolId) {
        await tx.capitalPool.update({
          where: { id: record.poolId },
          data: { balanceHkd: { decrement: record.amount } }
        })
      }

      if (relatedIds.length > 0) {
        await tx.memo.deleteMany({ where: { recordId: { in: relatedIds } } })
        await tx.attachment.deleteMany({ where: { recordId: { in: relatedIds } } })
        await tx.record.deleteMany({ where: { id: { in: relatedIds } } })
      }

      await tx.memo.deleteMany({ where: { recordId } })
      await tx.attachment.deleteMany({ where: { recordId } })
      await tx.record.delete({ where: { id: recordId } })

      if (!session.isAdmin) {
        revalidatePath('/')
      }
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/review')
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
