'use server'

import prisma from '@/lib/prisma'
import { getSession } from './auth'
import { revalidatePath } from 'next/cache'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { paymentProofNote, RECORD_STATUS } from '@/lib/recordStatus'

export type PaymentAttachmentInput = {
  url: string
  size: number
  note?: string
}

function getDeepestCategoryId(record: {
  categoryId: string
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}) {
  return record.thirdCategoryId || record.subCategoryId || record.categoryId
}

const paymentRecordInclude = {
  category: true,
  subCategory: true,
  thirdCategory: true,
  user: true,
  pool: true,
  originalRecord: true,
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      uploader: { select: { roleName: true } },
    },
  },
  memos: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      author: { select: { roleName: true } },
    },
  },
}

export async function getPendingPaymentCount() {
  const session = await getSession()
  if (!session || !session.isAdmin) return 0

  return prisma.record.count({
    where: { status: RECORD_STATUS.PENDING_PAYMENT },
  })
}

export async function getPendingPaymentRecords() {
  const session = await getSession()
  if (!session || !session.isAdmin) return []

  return prisma.record.findMany({
    where: { status: RECORD_STATUS.PENDING_PAYMENT },
    orderBy: { updatedAt: 'desc' },
    include: paymentRecordInclude,
  })
}

/**
 * Complete the pending-payment gate:
 * - optional payment-proof attachment upload, or
 * - manual admin pass (no attachment).
 * Then mark as APPROVED and apply capital-pool / modification merge.
 */
export async function completePayment(
  id: string,
  options?: {
    attachment?: PaymentAttachmentInput
    attachments?: PaymentAttachmentInput[]
    manual?: boolean
  }
) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()
  if (!session || !session.isAdmin) return { success: false, error: t('unauthorized') }

  const attachmentList =
    options?.attachments && options.attachments.length > 0
      ? options.attachments
      : options?.attachment
        ? [options.attachment]
        : []
  const hasAttachment = attachmentList.some((item) => Boolean(item.url))
  if (!hasAttachment && !options?.manual) {
    return { success: false, error: t('paymentCompleteRequiresAction') }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.record.findUnique({ where: { id } })
      if (!record || record.status !== RECORD_STATUS.PENDING_PAYMENT) {
        throw new Error(t('recordNotPendingPayment'))
      }

      const paymentUrl = attachmentList[0]?.url || null
      if (hasAttachment) {
        const attachmentRecordId = record.originalRecordId || id
        for (const item of attachmentList) {
          if (!item.url) continue
          const note = item.note?.trim() || paymentProofNote(locale)
          await tx.attachment.create({
            data: {
              fileUrl: item.url,
              size: item.size,
              note,
              uploaderId: session.userId,
              categoryId: getDeepestCategoryId(record),
              recordId: attachmentRecordId,
            },
          })
        }
      }

      const memoContent = hasAttachment
        ? locale === 'en'
          ? 'Payment proof uploaded; marked complete'
          : '已上傳支付附件並標記完成'
        : locale === 'en'
          ? 'Manually passed pending-payment gate'
          : '人工通過待付款關卡'

      if (record.originalRecordId) {
        const oldRecord = await tx.record.findUnique({
          where: { id: record.originalRecordId },
        })
        if (!oldRecord) throw new Error(t('originalRecordNotFound'))

        if (oldRecord.poolId && (oldRecord.type === 'INCOME' || oldRecord.type === 'EXPENSE')) {
          await tx.capitalPool.update({
            where: { id: oldRecord.poolId },
            data: { balanceHkd: { decrement: oldRecord.amount } },
          })
        }

        if (record.poolId && (record.type === 'INCOME' || record.type === 'EXPENSE')) {
          await tx.capitalPool.update({
            where: { id: record.poolId },
            data: { balanceHkd: { increment: record.amount } },
          })
        }

        await tx.record.update({
          where: { id: record.originalRecordId },
          data: {
            amount: record.amount,
            categoryId: record.categoryId,
            subCategoryId: record.subCategoryId,
            thirdCategoryId: record.thirdCategoryId,
            content: record.content,
            note: record.note,
            date: record.date,
            type: record.type,
            poolId: record.poolId,
            attachmentUrl:
              record.attachmentUrl || paymentUrl || oldRecord.attachmentUrl,
            status: RECORD_STATUS.APPROVED,
            isReviewing: false,
          },
        })

        await tx.memo.updateMany({
          where: { recordId: id },
          data: { recordId: record.originalRecordId },
        })

        await tx.attachment.updateMany({
          where: { recordId: record.id },
          data: { recordId: record.originalRecordId },
        })

        await tx.memo.create({
          data: {
            content: memoContent,
            authorId: session.userId,
            recordId: record.originalRecordId,
          },
        })

        await tx.record.delete({ where: { id } })
      } else {
        await tx.record.update({
          where: { id },
          data: {
            status: RECORD_STATUS.APPROVED,
            ...(paymentUrl && !record.attachmentUrl
              ? { attachmentUrl: paymentUrl }
              : {}),
          },
        })

        if (record.poolId && (record.type === 'INCOME' || record.type === 'EXPENSE')) {
          await tx.capitalPool.update({
            where: { id: record.poolId },
            data: { balanceHkd: { increment: record.amount } },
          })
        }

        await tx.memo.create({
          data: {
            content: memoContent,
            authorId: session.userId,
            recordId: id,
          },
        })
      }
    })

    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath('/payment')
    revalidatePath('/report')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
