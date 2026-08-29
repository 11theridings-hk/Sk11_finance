'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

async function checkAdmin() {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session || !session.isAdmin) {
    throw new Error(t('unauthorized'))
  }
}

// 获取所有分类（包含子分类结构）
export async function getCategories() {
  return await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: true
    },
    orderBy: { createdAt: 'asc' }
  })
}

// 获取平面分类列表
export async function getFlatCategories() {
  return await prisma.category.findMany({
    orderBy: { createdAt: 'asc' }
  })
}

// 确保存在“未分类”
async function ensureUncategorized() {
  let uncategorized = await prisma.category.findFirst({
    where: { name: '未分类', parentId: null }
  })
  if (!uncategorized) {
    uncategorized = await prisma.category.create({
      data: { name: '未分类' }
    })
  }
  return uncategorized
}

// 创建分类
export async function createCategory(name: string, parentId?: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
  try {
    await checkAdmin()
    
    let finalType = type
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } })
      if (parent) {
        finalType = parent.type as 'INCOME' | 'EXPENSE'
      }
    }

    const category = await prisma.category.create({
      data: { name, parentId: parentId || null, type: finalType }
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, category }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 修改分类
export async function updateCategory(id: string, name: string, type?: 'INCOME' | 'EXPENSE') {
  try {
    await checkAdmin()
    const data: any = { name }
    if (type) data.type = type
    
    const category = await prisma.category.update({
      where: { id },
      data
    })
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, category }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 删除分类
export async function deleteCategory(id: string) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    await checkAdmin()
    const uncategorized = await ensureUncategorized()
    
    if (id === uncategorized.id) {
      return { success: false, error: t('deleteDefaultUncategorized') }
    }

    // 将关联该分类的记录转入“未分类”
    await prisma.$transaction([
      prisma.category.updateMany({
        where: { parentId: id },
        data: { parentId: null }
      }),
      prisma.record.updateMany({
        where: { categoryId: id },
        data: { categoryId: uncategorized.id }
      }),
      prisma.record.updateMany({
        where: { subCategoryId: id },
        data: { subCategoryId: null }
      }),
      prisma.category.delete({
        where: { id }
      })
    ])

    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
