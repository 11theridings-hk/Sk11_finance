'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type CreateRecordInput = {
  type: 'INCOME' | 'EXPENSE'
  date: Date
  note?: string
  currency: 'HKD' | 'RMB'
  amount: number
  attachmentUrl?: string
  categoryId: string
  subCategoryId?: string
  poolId: string
  userId: string
  attachmentSize?: number
}

export async function createRecord(data: CreateRecordInput) {
  try {
    // 开启事务：创建记录，更新资金池余额
    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建记录
      const record = await tx.record.create({
        data: {
          type: data.type,
          date: data.date,
          note: data.note,
          currency: data.currency,
          amount: data.amount, // 前端传过来的已处理好正负
          attachmentUrl: data.attachmentUrl,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          poolId: data.poolId,
          userId: data.userId,
        }
      })

      // 2. 记录附件（如果有）
      if (data.attachmentUrl && data.attachmentSize) {
        await tx.attachment.create({
          data: {
            fileUrl: data.attachmentUrl,
            size: data.attachmentSize,
            uploaderId: data.userId,
            categoryId: data.categoryId
          }
        })
      }

      // 3. 更新资金池余额
      if (data.currency === 'HKD') {
        await tx.capitalPool.update({
          where: { id: data.poolId },
          data: { balanceHkd: { increment: data.amount } }
        })
      } else {
        await tx.capitalPool.update({
          where: { id: data.poolId },
          data: { balanceRmb: { increment: data.amount } }
        })
      }

      return record
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/admin')
    return { success: true, record: result }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 获取个人 Hero 统计数据
export async function getUserStats(userId: string) {
  const records = await prisma.record.findMany({
    where: { userId },
    select: { amount: true, currency: true }
  })

  let totalHkd = 0
  let totalRmb = 0

  records.forEach(r => {
    if (r.currency === 'HKD') totalHkd += r.amount
    else if (r.currency === 'RMB') totalRmb += r.amount
  })

  return { totalHkd, totalRmb }
}

// 获取最近 10 条记录
export async function getRecentRecords(userId?: string) {
  return await prisma.record.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      user: { select: { roleName: true } }
    }
  })
}

// 获取所有附件
export async function getAttachments() {
  return await prisma.attachment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      uploader: { select: { roleName: true } },
      category: { select: { name: true } }
    }
  })
}