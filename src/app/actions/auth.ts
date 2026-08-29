'use server'

import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { SignJWT, jwtVerify } from 'jose'
import { createHash } from 'crypto'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'finance-18-super-secret-key-change-in-prod')
const PWD_SALT = process.env.PWD_SALT || 'finance-18-salt'

export async function hashPassword(password: string) {
  return createHash('sha256').update(password + PWD_SALT).digest('hex')
}

export async function login(password: string, isAdminLogin: boolean = false) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  // 查找匹配该密码的用户（密码需 hash）
  const hashedPassword = await hashPassword(password)
  const user = await prisma.user.findUnique({
    where: { password: hashedPassword }
  })

  if (!user) {
    // 兼容期：尝试用明文查，如果查到则自动升级为 Hash（避免系统突然无法登录）
    const legacyUser = await prisma.user.findUnique({ where: { password } })
    if (legacyUser) {
      await prisma.user.update({
        where: { id: legacyUser.id },
        data: { password: hashedPassword }
      })
      return await performLogin(legacyUser, isAdminLogin)
    }
    return { success: false, error: t('passwordWrongOrUserMissing') }
  }

  return await performLogin(user, isAdminLogin)
}

async function performLogin(user: any, isAdminLogin: boolean) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  if (isAdminLogin && !user.isAdmin) {
    return { success: false, error: t('adminPermissionRequired') }
  }

  // 生成 JWT Token
  const token = await new SignJWT({ 
    userId: user.id, 
    roleName: user.roleName, 
    isAdmin: user.isAdmin 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(JWT_SECRET)

  // 设置 HttpOnly Cookie
  const cookieStore = await cookies()
  cookieStore.set('session_token', token, { 
    httpOnly: true, 
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 // 24 hours
  })

  // 兼容前端代码可能直接读 cookie（如果有的话，但目前最好全走 getSession）
  // 为了安全，不再下发敏感权限字段到普通 cookie

  return { success: true, user: { id: user.id, roleName: user.roleName, isAdmin: user.isAdmin } }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session_token')
  return { success: true }
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    
    // 二次核对数据库确保用户未被删除或撤销权限
    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: { id: true, roleName: true, isAdmin: true }
    })
    
    if (!user) return null

    return { 
      userId: user.id, 
      roleName: user.roleName, 
      isAdmin: user.isAdmin 
    }
  } catch (error) {
    return null
  }
}
