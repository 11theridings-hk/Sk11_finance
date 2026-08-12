'use server'

import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'

export async function login(password: string, isAdminLogin: boolean = false) {
  // 查找匹配该密码的用户
  const user = await prisma.user.findUnique({
    where: { password }
  })

  if (!user) {
    return { success: false, error: '密码错误或用户不存在' }
  }

  if (isAdminLogin && !user.isAdmin) {
    return { success: false, error: '该用户没有管理员权限' }
  }

  // 设置 Cookie
  const cookieStore = await cookies()
  cookieStore.set('userId', user.id, { httpOnly: true, path: '/' })
  cookieStore.set('roleName', user.roleName, { httpOnly: true, path: '/' })
  cookieStore.set('isAdmin', user.isAdmin ? 'true' : 'false', { httpOnly: true, path: '/' })

  return { success: true, user }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('userId')
  cookieStore.delete('roleName')
  cookieStore.delete('isAdmin')
  return { success: true }
}

export async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('userId')?.value
  const roleName = cookieStore.get('roleName')?.value
  const isAdmin = cookieStore.get('isAdmin')?.value === 'true'

  if (!userId) return null

  return { userId, roleName, isAdmin }
}