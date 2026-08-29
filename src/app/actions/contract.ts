'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

export type CreateContractInput = {
  title: string
  type: 'INCOME' | 'EXPENSE'
  effectiveDate: Date
  expiryDate: Date
  note?: string
  amount: number
  categoryId: string
  subCategoryId?: string
  thirdCategoryId?: string
  poolId?: string
  attachment?: AttachmentPayload
}

function getDeepestCategoryId(data: {
  categoryId: string
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}) {
  return data.thirdCategoryId || data.subCategoryId || data.categoryId
}

async function assertContractPermission(contractId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId }
  })

  if (!contract) {
    throw new Error(t('contractNotFound'))
  }

  if (contract.userId !== session.userId && !session.isAdmin) {
    throw new Error(t('canOnlyModifyOwnContract'))
  }

  return { session, contract }
}

export async function getContracts() {
  const session = await getSession()
  if (!session) return []

  return await prisma.contract.findMany({
    where: session.isAdmin ? undefined : { userId: session.userId },
    orderBy: [
      { expiryDate: 'asc' },
      { createdAt: 'desc' }
    ],
    include: {
      user: { select: { roleName: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      thirdCategory: { select: { name: true } },
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

export async function createContract(data: CreateContractInput) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    const result = await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          title: data.title,
          type: data.type,
          effectiveDate: data.effectiveDate,
          expiryDate: data.expiryDate,
          note: data.note,
          amount: data.amount,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          thirdCategoryId: data.thirdCategoryId,
          poolId: data.poolId,
          userId: session.userId
        }
      })

      if (data.attachment) {
        await tx.attachment.create({
          data: {
            fileUrl: data.attachment.url,
            size: data.attachment.size,
            note: data.attachment.note,
            uploaderId: session.userId,
            categoryId: getDeepestCategoryId(data),
            contractId: contract.id
          }
        })
      }

      return contract
    })

    revalidatePath('/contracts')
    revalidatePath('/admin')
    return { success: true, contract: result }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addContractAttachment(contractId: string, attachment: AttachmentPayload) {
  try {
    const { session, contract } = await assertContractPermission(contractId)

    await prisma.attachment.create({
      data: {
        fileUrl: attachment.url,
        size: attachment.size,
        note: attachment.note,
        uploaderId: session.userId,
        categoryId: getDeepestCategoryId(contract),
        contractId
      }
    })

    revalidatePath('/contracts')
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addContractMemo(contractId: string, content: string) {
  try {
    const { session } = await assertContractPermission(contractId)

    await prisma.memo.create({
      data: {
        content,
        authorId: session.userId,
        contractId
      }
    })

    revalidatePath('/contracts')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteContract(contractId: string) {
  try {
    await assertContractPermission(contractId)

    await prisma.$transaction(async (tx) => {
      await tx.memo.deleteMany({ where: { contractId } })
      await tx.attachment.deleteMany({ where: { contractId } })
      await tx.contract.delete({ where: { id: contractId } })
    })

    revalidatePath('/contracts')
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
