'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession, hashPassword } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import type { PublicLedgerRole } from '@/lib/access'

async function checkAdmin() {
  const session = await getSession()
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (!session || !session.isAdmin) {
    throw new Error(t('unauthorized'))
  }
}

// 获取所有用户 (仅管理员可调用所有，非管理员只能获取自己)
export async function getUsers() {
  const session = await getSession()
  if (!session) return []
  if (session.isAdmin) {
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    })
  } else {
    return await prisma.user.findMany({
      where: { id: session.userId }
    })
  }
}

// 创建白名单用户
export async function createUser(data: { password: string; roleName: string; isAdmin: boolean; publicLedgerRole?: PublicLedgerRole }) {
  try {
    await checkAdmin()
    const user = await prisma.user.create({
      data: {
        password: await hashPassword(data.password),
        roleName: data.roleName,
        isAdmin: data.isAdmin,
        poolEnabled: false,
        publicLedgerRole: data.isAdmin ? 'MEMBER' : (data.publicLedgerRole ?? 'NONE'),
      }
    })
    revalidatePath('/admin')
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message || '创建失败，可能密码已存在' }
  }
}

// 更新用户
export async function updateUser(id: string, data: { password?: string; roleName?: string; isAdmin?: boolean; publicLedgerRole?: PublicLedgerRole }) {
  try {
    await checkAdmin()
    const updateData: any = { ...data }
    if (data.password) {
      updateData.password = await hashPassword(data.password)
    }
    if (data.isAdmin) {
      updateData.publicLedgerRole = 'MEMBER'
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData
      })
      
      // 如果 roleName 改变且 poolEnabled，同步更新对应资金池名称
      if (data.roleName && updated.poolEnabled) {
        await tx.capitalPool.updateMany({
          where: { userId: id },
          data: { name: data.roleName }
        })
      }
      return updated
    })
    
    revalidatePath('/admin')
    revalidatePath('/')
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 删除用户
export async function deleteUser(id: string) {
  try {
    await checkAdmin()
    await prisma.user.delete({
      where: { id }
    })
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 切换资金池状态
export async function toggleUserPool(id: string, enabled: boolean) {
  try {
    await checkAdmin()
    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: { poolEnabled: enabled }
      })

      if (enabled) {
        // 启用：如果不存在对应的资金池，则创建一个
        const existingPool = await tx.capitalPool.findFirst({
          where: { userId: id }
        })
        if (!existingPool) {
          await tx.capitalPool.create({
            data: {
              name: updatedUser.roleName,
              userId: updatedUser.id
            }
          })
        }
      }
      return updatedUser
    })
    // 如果禁用，在页面上资金池置灰即可，不删除历史数据
    revalidatePath('/admin')
    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
