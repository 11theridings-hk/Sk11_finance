'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'

export type ReportFilter = {
  startDate?: Date
  endDate?: Date
  categoryId?: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  userId?: string
  status?: 'PENDING' | 'APPROVED' | 'ALL'
}

export async function getReportRecords(filter: ReportFilter) {
  const session = await getSession()
  if (!session) return []

  const where: any = {}

  if (filter.status && filter.status !== 'ALL') {
    where.status = filter.status
  } else if (!filter.status) {
    where.status = 'APPROVED'
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
    const subCategories = await prisma.category.findMany({
      where: { parentId: filter.categoryId },
      include: { children: { select: { id: true } } }
    })
    const categoryIds = [
      filter.categoryId,
      ...subCategories.map((c) => c.id),
      ...subCategories.flatMap((c) => c.children.map((child) => child.id))
    ]
    where.OR = [
      { categoryId: filter.categoryId },
      { subCategoryId: { in: categoryIds } },
      { thirdCategoryId: { in: categoryIds } }
    ]
  }

  if (filter.subCategoryId) {
    const thirdCategories = await prisma.category.findMany({
      where: { parentId: filter.subCategoryId },
      select: { id: true }
    })
    const subTreeIds = [filter.subCategoryId, ...thirdCategories.map((item) => item.id)]
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { subCategoryId: filter.subCategoryId },
          { thirdCategoryId: { in: subTreeIds } }
        ]
      }
    ]
  }

  if (filter.thirdCategoryId) {
    where.thirdCategoryId = filter.thirdCategoryId
  }

  if (filter.poolId) {
    where.poolId = filter.poolId
  }

  return await prisma.record.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      thirdCategory: { select: { name: true } },
      user: { select: { roleName: true } },
      pool: { select: { name: true } },
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
