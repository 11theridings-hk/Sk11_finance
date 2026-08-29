'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'

export type ReportFilter = {
  startDate?: Date
  endDate?: Date
  categoryId?: string
  userId?: string
}

export async function getReportRecords(filter: ReportFilter) {
  const session = await getSession()
  if (!session) return []

  const where: any = {
    status: 'APPROVED' // B06: 报表口径限制为已生效记录
  }

  // B02: 普通用户默认只允许查自己的记录
  if (!session.isAdmin) {
    where.userId = session.userId
  } else if (filter.userId) {
    where.userId = filter.userId
  }
  if (filter.startDate || filter.endDate) {
    where.date = {}
    if (filter.startDate) where.date.gte = filter.startDate
    if (filter.endDate) where.date.lte = filter.endDate
  }

  if (filter.categoryId) {
    // 如果选择了一级分类，可能还需要包含其子分类的记录
    const subCategories = await prisma.category.findMany({
      where: { parentId: filter.categoryId },
      select: { id: true }
    })
    const categoryIds = [filter.categoryId, ...subCategories.map(c => c.id)]
    where.OR = [
      { categoryId: { in: categoryIds } },
      { subCategoryId: { in: categoryIds } }
    ]
  }

  return await prisma.record.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      user: { select: { roleName: true } },
      pool: { select: { name: true } }
    }
  })
}
