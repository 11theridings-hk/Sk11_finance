'use client'

import React, { useMemo, useState } from 'react'
import { createActivity } from '../actions/activity'
import { createTranslator, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'
import ActivityDetailModal from '../ActivityDetailModal'

type ActivityItem = {
  id: string
  title: string
  note?: string | null
  eventDate: string | Date
  reminderDays: number
  visibility: string
  userId: string
  user?: { roleName?: string | null } | null
  attachments?: Array<{
    id: string
    fileUrl: string
    note?: string | null
    createdAt: string | Date
    uploader?: { roleName?: string | null } | null
  }>
}

type Props = {
  locale: Locale
  currentUserId: string
  isAdmin: boolean
  initialActivities: ActivityItem[]
}

export default function ActivitiesClient({ locale, currentUserId, isAdmin, initialActivities }: Props) {
  const t = createTranslator(locale)
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null)
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split('T')[0])
  const [reminderDays, setReminderDays] = useState('15')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [note, setNote] = useState('')
  const [attachment, setAttachment] = useState<ClientAttachment | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const upcomingActivities = useMemo(() => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    return initialActivities
      .map((activity) => {
        const event = new Date(activity.eventDate)
        const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
        const daysUntilEvent = Math.ceil((eventDay.getTime() - startOfToday.getTime()) / 86400000)

        return {
          ...activity,
          daysUntilEvent,
        }
      })
      .filter((activity) => activity.daysUntilEvent >= 0 && activity.daysUntilEvent <= activity.reminderDays)
  }, [initialActivities])

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const compressed = await compressImage(file, 200)
      setAttachment(compressed)
    } catch {
      alert(t('imageCompressionFailed'))
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !eventDate || !reminderDays.trim()) {
      alert(t('fillRequiredFields'))
      return
    }

    setIsSubmitting(true)
    const res = await createActivity({
      title: title.trim(),
      note: note.trim() || undefined,
      eventDate: new Date(eventDate),
      reminderDays: Number(reminderDays),
      visibility,
      attachment: attachment ? { ...attachment, note: attachmentNote || undefined } : undefined,
    })

    if (res.success) {
      window.location.reload()
      return
    }

    alert(`${t('submitFailed')}: ${res.error}`)
    setIsSubmitting(false)
  }

  const inputClass = 'w-full rounded-xl border-transparent bg-white p-3 text-gray-900 shadow-sm outline-none transition-all placeholder-gray-400 focus:border-[#007AFF] focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30'

  return (
    <div className="space-y-4 pt-4 sm:space-y-6 sm:pt-6">
      {upcomingActivities.length > 0 && (
        <section className="rounded-2xl border border-[#FF9500]/20 bg-[#FFF7ED] px-4 py-4 shadow-sm sm:rounded-3xl sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-[#FF9500]/10 p-2 text-[#FF9500]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-[#9A3412]">{t('activityReminder')}</h2>
              <p className="mt-1 text-sm text-[#C2410C]">{t('activitiesUpcomingHint')}</p>
              <div className="mt-3 space-y-2">
                {upcomingActivities.slice(0, 4).map((activity) => (
                  <div key={activity.id} className="flex flex-col gap-1 rounded-xl bg-white/80 px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{activity.title}</div>
                      <div className="text-xs text-gray-500">{activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <span>{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                      <span className="rounded-full bg-[#FFEDD5] px-2 py-0.5 font-medium text-[#C2410C]">
                        {activity.daysUntilEvent === 0 ? t('eventToday') : (locale === 'en' ? `${activity.daysUntilEvent} days left` : `尚餘 ${activity.daysUntilEvent} 天`)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <h2 className="text-xl font-semibold text-gray-900">{t('activitiesPage')}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('activitiesPageHint')}</p>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-[#F2F8FF] p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('activityTitle')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={t('activityTitlePlaceholder')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('activityDate')}</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('reminderDays')}</label>
              <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('activityVisibility')}</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')} className={inputClass}>
                <option value="PUBLIC">{t('publicActivity')}</option>
                <option value="PRIVATE">{t('privateActivity')}</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('noteOptional')}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={inputClass} placeholder={t('notePlaceholder')} />
            </div>
            <div className="space-y-3 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">{t('attachment')}</label>
              <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-[#007AFF]" />
              <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className={inputClass} />
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className={`mt-6 w-full rounded-xl py-4 font-semibold text-white shadow-sm transition-all ${isSubmitting ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : 'bg-[#007AFF] hover:bg-[#0066CC]'}`}>
            {isSubmitting ? t('submitting') : t('createActivity')}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-gray-100 p-4 pb-3 sm:p-6 sm:pb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('activitiesList')}</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">{t('activityTitle')}</th>
                <th className="px-6 py-3 font-medium">{t('activityDate')}</th>
                <th className="px-6 py-3 font-medium">{t('activityVisibility')}</th>
                <th className="px-6 py-3 font-medium">{t('userLabel')}</th>
                <th className="px-6 py-3 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialActivities.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center font-medium text-gray-400">{t('noActivities')}</td></tr>
              ) : (
                initialActivities.map((activity) => (
                  <tr key={activity.id} className="transition-colors hover:bg-gray-50/80">
                    <td className="px-6 py-4 font-medium">{activity.title}</td>
                    <td className="px-6 py-4">{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                    <td className="px-6 py-4">{activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}</td>
                    <td className="px-6 py-4">{activity.user?.roleName || '-'}</td>
                    <td className="px-6 py-4"><button onClick={() => setSelectedActivity(activity)} className="text-sm font-medium text-[#007AFF] hover:underline">{t('detail')}</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-gray-100 md:hidden">
          {initialActivities.length === 0 ? (
            <div className="p-8 text-center font-medium text-gray-400">{t('noActivities')}</div>
          ) : (
            initialActivities.map((activity) => (
              <div key={activity.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">{activity.title}</div>
                  <div className="rounded-full bg-[#007AFF]/10 px-2 py-1 text-[10px] font-semibold text-[#007AFF]">
                    {activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}
                  </div>
                </div>
                <div className="text-sm text-gray-600">{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                  <span className="text-xs text-gray-400">{activity.user?.roleName || '-'}</span>
                  <button onClick={() => setSelectedActivity(activity)} className="rounded bg-[#007AFF]/10 px-3 py-1 text-xs font-medium text-[#007AFF]">{t('detail')}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          locale={locale}
          canManage={isAdmin || selectedActivity.userId === currentUserId}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  )
}
