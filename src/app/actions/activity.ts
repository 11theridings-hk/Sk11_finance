'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getSession } from './auth'
import { getCurrentLocale } from '@/lib/locale'
import { createTranslator } from '@/lib/i18n'
import { maybeSendReminderCatchUp } from '@/lib/reminders/emailReminders'

type AttachmentPayload = {
  url: string
  size: number
  note?: string
}

type CategoryFields = {
  categoryId?: string | null
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}

export type CreateActivityInput = {
  title: string
  content?: string
  note?: string
  eventDate: Date
  reminderDays: number
  visibility: 'PUBLIC' | 'PRIVATE'
  categoryId?: string
  subCategoryId?: string
  thirdCategoryId?: string
  attachment?: AttachmentPayload
  attachments?: AttachmentPayload[]
  initialMemo?: string
}

export type UpdateActivityInput = {
  title: string
  content?: string
  note?: string
  eventDate: Date
  reminderDays: number
  visibility: 'PUBLIC' | 'PRIVATE'
  categoryId?: string | null
  subCategoryId?: string | null
  thirdCategoryId?: string | null
}

function getDeepestCategoryId(data: CategoryFields) {
  return data.thirdCategoryId || data.subCategoryId || data.categoryId || undefined
}

function normalizeCategoryFields(data: CategoryFields) {
  const categoryId = data.categoryId || null
  return {
    categoryId,
    subCategoryId: categoryId ? data.subCategoryId || null : null,
    thirdCategoryId: categoryId ? data.thirdCategoryId || null : null,
  }
}

const activityCategoryInclude = {
  category: { select: { id: true, name: true, type: true } },
  subCategory: { select: { id: true, name: true } },
  thirdCategory: { select: { id: true, name: true } },
} as const

async function assertActivityPermission(activityId: string) {
  const locale = await getCurrentLocale()
  const t = createTranslator(locale)
  const session = await getSession()

  if (!session) {
    throw new Error(t('notLoggedIn'))
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  })

  if (!activity) {
    throw new Error(t('activityNotFound'))
  }

  if (activity.userId !== session.userId && !session.isAdmin) {
    throw new Error(t('canOnlyModifyOwnActivity'))
  }

  return { session, activity }
}

export async function getActivities() {
  const session = await getSession()
  if (!session) return []

  return prisma.activity.findMany({
    where: {
      OR: [
        { visibility: 'PUBLIC' },
        { userId: session.userId },
      ],
    },
    orderBy: [
      { eventDate: 'asc' },
      { createdAt: 'desc' },
    ],
    include: {
      user: { select: { roleName: true } },
      ...activityCategoryInclude,
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: {
          uploader: { select: { roleName: true } },
        },
      },
      memos: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { roleName: true } },
        },
      },
    },
  })
}

export async function createActivity(data: CreateActivityInput) {
  try {
    const locale = await getCurrentLocale()
    const t = createTranslator(locale)
    const session = await getSession()
    if (!session) {
      throw new Error(t('notLoggedIn'))
    }

    const categories = normalizeCategoryFields(data)

    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.activity.create({
        data: {
          title: data.title,
          content: data.content,
          note: data.note,
          eventDate: data.eventDate,
          reminderDays: data.reminderDays,
          visibility: data.visibility,
          userId: session.userId,
          ...categories,
        },
      })

      const attachmentList =
        data.attachments && data.attachments.length > 0
          ? data.attachments
          : data.attachment
            ? [data.attachment]
            : []

      const deepestCategoryId = getDeepestCategoryId(categories)

      for (const item of attachmentList) {
        await tx.attachment.create({
          data: {
            fileUrl: item.url,
            size: item.size,
            note: item.note,
            uploaderId: session.userId,
            activityId: created.id,
            categoryId: deepestCategoryId,
          },
        })
      }

      if (data.initialMemo?.trim()) {
        await tx.memo.create({
          data: {
            content: data.initialMemo.trim(),
            authorId: session.userId,
            activityId: created.id,
          },
        })
      }

      return created
    })

    // If create day is a trigger day (30/15/7/3/1/due/…), send immediately.
    if (activity.visibility === 'PUBLIC') {
      try {
        await maybeSendReminderCatchUp({
          entityType: 'ACTIVITY',
          entityId: activity.id,
          title: activity.title,
          targetDate: activity.eventDate,
          reminderDays: activity.reminderDays,
          eligible: true,
        })
      } catch (e) {
        console.error('[createActivity] reminder catch-up failed', e)
      }
    }

    revalidatePath('/activities')
    revalidatePath('/report')
    return { success: true, activity }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateActivity(activityId: string, data: UpdateActivityInput) {
  try {
    await assertActivityPermission(activityId)
    const categories = normalizeCategoryFields(data)

    const activity = await prisma.activity.update({
      where: { id: activityId },
      data: {
        title: data.title,
        content: data.content,
        note: data.note,
        eventDate: data.eventDate,
        reminderDays: data.reminderDays,
        visibility: data.visibility,
        ...categories,
      },
    })

    if (activity.visibility === 'PUBLIC') {
      try {
        await maybeSendReminderCatchUp({
          entityType: 'ACTIVITY',
          entityId: activity.id,
          title: activity.title,
          targetDate: activity.eventDate,
          reminderDays: activity.reminderDays,
          eligible: true,
        })
      } catch (e) {
        console.error('[updateActivity] reminder catch-up failed', e)
      }
    }

    revalidatePath('/activities')
    revalidatePath('/report')
    return { success: true, activity }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addActivityAttachment(activityId: string, attachment: AttachmentPayload) {
  try {
    const { session, activity } = await assertActivityPermission(activityId)

    await prisma.attachment.create({
      data: {
        fileUrl: attachment.url,
        size: attachment.size,
        note: attachment.note,
        uploaderId: session.userId,
        activityId,
        categoryId: getDeepestCategoryId(activity),
      },
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addActivityMemo(activityId: string, content: string) {
  try {
    const { session } = await assertActivityPermission(activityId)

    await prisma.memo.create({
      data: {
        content,
        authorId: session.userId,
        activityId,
      },
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function appendActivityOcrFields(
  activityId: string,
  fields: { contentText?: string; noteText?: string }
) {
  try {
    const { session, activity } = await assertActivityPermission(activityId)
    const contentAdd = (fields.contentText || '').trim()
    const noteAdd = (fields.noteText || '').trim()
    if (!contentAdd && !noteAdd) return { success: true }

    const nextContent = contentAdd
      ? activity.content?.trim()
        ? `${activity.content.trim()}\n${contentAdd}`
        : contentAdd
      : activity.content
    const nextNote = noteAdd
      ? activity.note?.trim()
        ? `${activity.note.trim()}\n${noteAdd}`
        : noteAdd
      : activity.note

    const memoBody = [contentAdd && `內容: ${contentAdd}`, noteAdd && `備註: ${noteAdd}`]
      .filter(Boolean)
      .join('\n')

    await prisma.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activityId },
        data: { content: nextContent, note: nextNote },
      })
      if (memoBody) {
        await tx.memo.create({
          data: {
            content: `圖像辨識:\n${memoBody}`,
            authorId: session.userId,
            activityId,
          },
        })
      }
    })

    revalidatePath('/activities')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function appendActivityNoteKeywords(activityId: string, noteText: string) {
  return appendActivityOcrFields(activityId, { noteText })
}

export async function deleteActivity(activityId: string) {
  try {
    await assertActivityPermission(activityId)

    await prisma.$transaction(async (tx) => {
      await tx.memo.deleteMany({ where: { activityId } })
      await tx.attachment.deleteMany({ where: { activityId } })
      await tx.activity.delete({ where: { id: activityId } })
    })

    revalidatePath('/activities')
    revalidatePath('/report')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
