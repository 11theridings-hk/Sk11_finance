'use server'

import prisma from '@/lib/prisma'

export async function initAdmin() {
  const count = await prisma.user.count()
  if (count === 0) {
    await prisma.user.create({
      data: {
        password: 'admin', // 默认密码
        roleName: '超级管理员',
        isAdmin: true,
        poolEnabled: false,
      }
    })
    return { success: true, message: '初始化管理员成功 (密码: admin)' }
  }
  return { success: false, message: '已存在用户，无需初始化' }
}