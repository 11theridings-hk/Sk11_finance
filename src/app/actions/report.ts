'use server'

import prisma from '@/lib/prisma'

export type ReportFilter = {
  startDate?: Date
  endDate?: Date
  categoryId?: string
  currency?: 'HKD' | 'RMB' | 'ALL'
  userId?: string
}

export async function getReportRecords(filter: ReportFilter) {
  const where: any = {}

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

  if (filter.currency && filter.currency !== 'ALL') {
    where.currency = filter.currency
  }

  if (filter.userId) {
    where.userId = filter.userId
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