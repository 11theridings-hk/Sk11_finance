'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'

export async function getARAPRecords() {
  const session = await getSession()
  if (!session) return []
  
  const where: any = {
    type: { in: ['AR', 'AP'] }
  }
  
  if (!session.isAdmin) {
    where.userId = session.userId
  }

  return await prisma.record.findMany({
    where,
    orderBy: { executionDate: 'asc' },
    include: {
      category: true,
      subCategory: true,
      user: true,
      remarkLogs: {
        orderBy: { createdAt: 'desc' },
        include: { user: true }
      }
    }
  })
}

export async function updateARAPAmount(id: string, amount: number) {
  try {
    const session = await getSession()
    if (!session) throw new Error('未登录')

    await prisma.$transaction(async (tx) => {
      const oldRecord = await tx.record.findUnique({ where: { id } })
      if (!oldRecord) throw new Error('记录不存在')

      await tx.record.update({
        where: { id },
        data: { amount }
      })

      const typeName = oldRecord.type === 'AR' ? '应收' : '应付'
      const logContent = `将${typeName}金额从 ${Math.abs(oldRecord.amount)} ${oldRecord.currency} 修改为 ${Math.abs(amount)} ${oldRecord.currency}`

      await tx.remarkLog.create({
        data: {
          content: logContent,
          recordId: id,
          userId: session.userId
        }
      })
    })

    revalidatePath('/ar-ap')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addRemarkLog(recordId: string, content: string) {
  try {
    const session = await getSession()
    if (!session) throw new Error('未登录')

    await prisma.remarkLog.create({
      data: {
        content,
        recordId,
        userId: session.userId
      }
    })
    revalidatePath('/ar-ap')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
