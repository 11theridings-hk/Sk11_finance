'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

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
    const category = await prisma.category.create({
      data: { name, parentId: parentId || null, type }
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
    const uncategorized = await ensureUncategorized()
    
    if (id === uncategorized.id) {
      return { success: false, error: '不能删除默认的“未分类”' }
    }

    // 将该分类下的子分类的 parentId 置为空或转给未分类
    await prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: null } // 变成一级分类
    })

    // 将关联该分类的记录转入“未分类”
    await prisma.record.updateMany({
      where: { categoryId: id },
      data: { categoryId: uncategorized.id }
    })
    await prisma.record.updateMany({
      where: { subCategoryId: id },
      data: { subCategoryId: null }
    })

    // 最后删除分类
    await prisma.category.delete({
      where: { id }
    })

    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}