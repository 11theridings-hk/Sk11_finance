'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'

// 获取所有打开的归结单（主归结单候选）
export async function getOpenOrders() {
  const session = await getSession()
  if (!session) return []

  const where: any = { status: 'OPEN' }
  // 如果是普通用户，只能看到自己参与的归结单？
  // 归结单是包含多条记录的，如果限制只能看到自己的，那么需要查询该归结单下的 records 有自己 userId 的
  if (!session.isAdmin) {
    where.records = {
      some: { userId: session.userId }
    }
  }

  return await prisma.consolidatedOrder.findMany({
    where,
    orderBy: { date: 'desc' }, // 最近日期到最远日期
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

// 结单
export async function closeOrder(id: string) {
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) {
      throw new Error('权限不足，只有管理员可以结单')
    }

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
  const session = await getSession()
  if (!session) return []

  const where: any = { status: 'CLOSED' }
  if (!session.isAdmin) {
    where.records = {
      some: { userId: session.userId }
    }
  }

  return await prisma.consolidatedOrder.findMany({
    where,
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
