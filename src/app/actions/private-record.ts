'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { isPrivateLedgerPublic, type PrivateLedgerVisibility } from '@/lib/access'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

export type CreatePrivateRecordInput = {
  type: 'INCOME' | 'EXPENSE'
  date: Date
  note?: string
  amount: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  attachment?: AttachmentPayload
}

function getDeepestCategoryId(data: {
  categoryId: string
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}) {
  return data.thirdCategoryId || data.subCategoryId || data.categoryId
}

async function getPrivateLedgerOwnerOrThrow(ownerId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      roleName: true,
      privateLedgerVisibility: true,
    },
  })

  if (!owner) {
    throw new Error(t('unauthorized'))
  }

  return owner
}

async function assertPrivateLedgerReadable(ownerId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }

  const owner = await getPrivateLedgerOwnerOrThrow(ownerId)
  if (owner.id !== session.userId && !isPrivateLedgerPublic(owner.privateLedgerVisibility)) {
    throw new Error(t('privateLedgerNotPublic'))
  }

  return { session, owner }
}

async function assertPrivateRecordPermission(recordId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }

  const record = await prisma.privateRecord.findUnique({
    where: { id: recordId },
  })

  if (!record) {
    throw new Error(t('privateRecordNotFound'))
  }

  if (record.userId !== session.userId) {
    throw new Error(t('canOnlyModifyOwnPrivateRecord'))
  }

  return { session, record }
}

export async function getPrivateLedgerSummary(ownerId?: string) {
  const session = await getSession()
  if (!session) return { balance: 0 }

  const targetOwnerId = ownerId || session.userId
  await assertPrivateLedgerReadable(targetOwnerId)

  const records = await prisma.privateRecord.findMany({
    where: { userId: targetOwnerId },
    select: { amount: true },
  })

  return {
    balance: records.reduce((sum, record) => sum + record.amount, 0),
  }
}

export async function getPrivateRecords(ownerId?: string) {
  const session = await getSession()
  if (!session) return []

  const targetOwnerId = ownerId || session.userId
  await assertPrivateLedgerReadable(targetOwnerId)

  return prisma.privateRecord.findMany({
    where: { userId: targetOwnerId },
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      thirdCategory: { select: { name: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: {
          uploader: { select: { roleName: true } },
        },
      },
    },
  })
}

export async function getSharedPrivateLedgerUsers() {
  const session = await getSession()
  if (!session) return []

  return prisma.user.findMany({
    where: {
      id: { not: session.userId },
      privateLedgerVisibility: 'PUBLIC',
    },
    orderBy: { roleName: 'asc' },
    select: {
      id: true,
      roleName: true,
    },
  })
}

export async function getPrivateLedgerOwner(ownerId?: string) {
  const session = await getSession()
  if (!session) return null

  const targetOwnerId = ownerId || session.userId
  const { owner } = await assertPrivateLedgerReadable(targetOwnerId)
  return owner
}

export async function updatePrivateLedgerVisibility(visibility: PrivateLedgerVisibility) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()

    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { privateLedgerVisibility: visibility },
    })

    revalidatePath('/private-ledger')
    revalidatePath(`/private-ledger/${session.userId}`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createPrivateRecord(data: CreatePrivateRecordInput) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.privateRecord.create({
        data: {
          type: data.type,
          date: data.date,
          note: data.note,
          amount: data.amount,
          attachmentUrl: data.attachment?.url,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          thirdCategoryId: data.thirdCategoryId,
          userId: session.userId,
        },
      })

      if (data.attachment) {
        await tx.attachment.create({
          data: {
            fileUrl: data.attachment.url,
            size: data.attachment.size,
            note: data.attachment.note,
            uploaderId: session.userId,
            categoryId: getDeepestCategoryId(data),
            privateRecordId: created.id,
          },
        })
      }

      return created
    })

    revalidatePath('/private-ledger')
    revalidatePath(`/private-ledger/${session.userId}`)
    return { success: true, record }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addPrivateRecordAttachment(recordId: string, attachment: AttachmentPayload) {
  try {
    const { session, record } = await assertPrivateRecordPermission(recordId)

    await prisma.$transaction(async (tx) => {
      await tx.attachment.create({
        data: {
          fileUrl: attachment.url,
          size: attachment.size,
          note: attachment.note,
          uploaderId: session.userId,
          categoryId: getDeepestCategoryId(record),
          privateRecordId: recordId,
        },
      })

      if (!record.attachmentUrl) {
        await tx.privateRecord.update({
          where: { id: recordId },
          data: { attachmentUrl: attachment.url },
        })
      }
    })

    revalidatePath('/private-ledger')
    revalidatePath(`/private-ledger/${session.userId}`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deletePrivateRecord(recordId: string) {
  try {
    const { record } = await assertPrivateRecordPermission(recordId)

    await prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { privateRecordId: recordId } })
      await tx.privateRecord.delete({ where: { id: recordId } })
    })

    revalidatePath('/private-ledger')
    revalidatePath(`/private-ledger/${record.userId}`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
