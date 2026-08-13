'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// 获取所有打开的归结单（主归结单候选）
export async function getOpenOrders() {
  return await prisma.consolidatedOrder.findMany({
    where: { status: 'OPEN' },
    orderBy: { date: 'desc' }, // 最近日期到最远日期
    include: {
      records: {
        select: { amount: true, currency: true, type: true }
      }
    }
  })
}

// 结单
export async function closeOrder(id: string) {
  try {
    await prisma.consolidatedOrder.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() }
    })
    revalidatePath('/consolidated')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 获取结单列表
export async function getClosedOrders() {
  return await prisma.consolidatedOrder.findMany({
    where: { status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
    include: {
      records: {
        include: {
          category: true,
          subCategory: true,
          user: true,
          pool: true
        }
      }
    }
  })
}
