'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function getARAPRecords() {
  return await prisma.record.findMany({
    where: {
      type: { in: ['AR', 'AP'] }
    },
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
    await prisma.record.update({
      where: { id },
      data: { amount }
    })
    revalidatePath('/ar-ap')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addRemarkLog(recordId: string, content: string, userId: string) {
  try {
    await prisma.remarkLog.create({
      data: {
        content,
        recordId,
        userId
      }
    })
    revalidatePath('/ar-ap')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
