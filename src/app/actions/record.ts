'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'

export type CreateRecordInput = {
  type: 'INCOME' | 'EXPENSE' | 'AR' | 'AP'
  date: Date
  executionDate?: Date
  note?: string
  currency: 'HKD' | 'RMB'
  amount: number
  attachmentUrl?: string
  categoryId: string
  subCategoryId?: string
  poolId?: string
  attachmentSize?: number
  orderNo?: string // 传入 10 位订单号，如果没有则不创建关联
  orderNote?: string
}

export async function createRecord(data: CreateRecordInput) {
  try {
    const session = await getSession()
    if (!session) throw new Error('未登录')
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. 判断是否需要审核
      let status = 'APPROVED'
      if (data.poolId && (data.type === 'INCOME' || data.type === 'EXPENSE')) {
        const pool = await tx.capitalPool.findUnique({ where: { id: data.poolId } })
        if (pool?.isReviewRequired) {
          status = 'PENDING'
        }
      } else if (data.type === 'AR' || data.type === 'AP') {
        // AR/AP 是否需要审核？用户说：“如果资金池选择了审核账户，则所提交的记录需要被审核...”，AR/AP 没有资金池，所以应该是 APPROVED。
        status = 'APPROVED'
      }

      // 2. 归结单处理
      let orderId = undefined
      if (data.orderNo) {
        let order = await tx.consolidatedOrder.findUnique({ where: { orderNo: data.orderNo } })
        if (!order) {
          order = await tx.consolidatedOrder.create({
            data: {
              orderNo: data.orderNo,
              date: data.date,
              status: 'OPEN',
              note: data.orderNote
            }
          })
        } else {
          if (order.status === 'CLOSED') {
            throw new Error('该归结单已关闭，不可追加记录')
          }
          if (data.orderNote && !order.note) {
            // 如果已有单子但没备注，更新备注
            await tx.consolidatedOrder.update({
              where: { id: order.id },
              data: { note: data.orderNote }
            })
          }
        }
        orderId = order.id
      }

      // 3. 创建记录
      const record = await tx.record.create({
        data: {
          type: data.type,
          status,
          date: data.date,
          executionDate: data.executionDate,
          note: data.note,
          currency: data.currency,
          amount: data.amount, // 前端传过来的已处理好正负
          attachmentUrl: data.attachmentUrl,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          poolId: data.poolId,
          userId: session.userId,
          orderId
        }
      })

      // 4. 记录附件（如果有）
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

      // 5. 更新资金池余额 (如果是已审核且为收支)
      if (status === 'APPROVED' && data.poolId && (data.type === 'INCOME' || data.type === 'EXPENSE')) {
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
      }

      return record
    })

    revalidatePath('/')
    revalidatePath('/report')
    revalidatePath('/admin')
    revalidatePath('/consolidated')
    revalidatePath('/ar-ap')
    return { success: true, record: result }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 获取个人 Hero 统计数据
export async function getUserStats(userId: string) {
  const session = await getSession()
  if (!session) return { hkdCashFlow: 0, hkdAR: 0, hkdAP: 0, rmbCashFlow: 0, rmbAR: 0, rmbAP: 0 }
  if (session.userId !== userId && !session.isAdmin) {
    throw new Error('权限不足')
  }

  const records = await prisma.record.findMany({
    where: { 
      userId,
      status: 'APPROVED'
    },
    select: { amount: true, currency: true, type: true }
  })

  let hkdCashFlow = 0
  let hkdAR = 0
  let hkdAP = 0
  let rmbCashFlow = 0
  let rmbAR = 0
  let rmbAP = 0

  records.forEach(r => {
    if (r.currency === 'HKD') {
      if (r.type === 'INCOME' || r.type === 'EXPENSE') hkdCashFlow += r.amount
      else if (r.type === 'AR') hkdAR += Math.abs(r.amount)
      else if (r.type === 'AP') hkdAP += Math.abs(r.amount)
    } else if (r.currency === 'RMB') {
      if (r.type === 'INCOME' || r.type === 'EXPENSE') rmbCashFlow += r.amount
      else if (r.type === 'AR') rmbAR += Math.abs(r.amount)
      else if (r.type === 'AP') rmbAP += Math.abs(r.amount)
    }
  })

  return { hkdCashFlow, hkdAR, hkdAP, rmbCashFlow, rmbAR, rmbAP }
}

// 获取最近 10 条记录
export async function getRecentRecords(userId?: string) {
  const session = await getSession()
  if (!session) return []
  if (userId && session.userId !== userId && !session.isAdmin) {
    throw new Error('权限不足')
  }
  // 如果是普通用户且没有传 userId，强制只看自己的
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

// 获取所有附件
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