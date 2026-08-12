'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// 获取所有资金池（含关联用户状态，用于判定是否置灰）
export async function getCapitalPools() {
  return await prisma.capitalPool.findMany({
    include: {
      user: {
        select: { poolEnabled: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// 创建资金池
export async function createCapitalPool(name: string) {
  try {
    const pool = await prisma.capitalPool.create({
      data: { name }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, pool }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 修改资金池
export async function updateCapitalPool(id: string, name: string) {
  try {
    const pool = await prisma.capitalPool.update({
      where: { id },
      data: { name }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, pool }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 删除资金池
export async function deleteCapitalPool(id: string) {
  try {
    // 检查是否有记录关联
    const records = await prisma.record.count({
      where: { poolId: id }
    })
    if (records > 0) {
      return { success: false, error: '该资金池下已有收支记录，无法直接删除' }
    }

    await prisma.capitalPool.delete({
      where: { id }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}