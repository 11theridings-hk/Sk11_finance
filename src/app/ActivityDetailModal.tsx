'use client'

import { useState } from 'react'
import { addActivityAttachment, deleteActivity, updateActivity } from './actions/activity'
import { createTranslator, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'
import OcrNoteButton from '@/components/OcrNoteButton'

export default function ActivityDetailModal({
  activity,
  locale,
  canManage,
  onClose,
}: {
  activity: any
  locale: Locale
  canManage: boolean
  onClose: () => void
}) {
  const t = createTranslator(locale)
  const [title, setTitle] = useState(activity.title)
  const [eventDate, setEventDate] = useState(new Date(activity.eventDate).toISOString().split('T')[0])
  const [reminderDays, setReminderDays] = useState(String(activity.reminderDays))
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(activity.visibility)
  const [note, setNote] = useState(activity.note || '')
  const [attachment, setAttachment] = useState<ClientAttachment | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const compressed = await compressImage(file, 200)
      setAttachment(compressed)
    } catch {
      alert(t('imageCompressionFailed'))
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !eventDate || !reminderDays.trim()) {
      alert(t('fillRequiredFields'))
      return
    }

    setLoading(true)
    const res = await updateActivity(activity.id, {
      title: title.trim(),
      note: note.trim() || undefined,
      eventDate: new Date(eventDate),
      reminderDays: Number(reminderDays),
      visibility,
    })
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  const handleAppendAttachment = async () => {
    if (!attachment) return
    setLoading(true)
    const res = await addActivityAttachment(activity.id, {
      ...attachment,
      note: attachmentNote || undefined,
    })
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!window.confirm(t('deleteActivity'))) return
    setLoading(true)
    const res = await deleteActivity(activity.id)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  const appendRecognizedText = (recognizedText: string) => {
    setNote((current) => (current.trim() ? `${current.trim()}\n${recognizedText}` : recognizedText))
  }

  const readOnlyFieldClass = 'font-semibold text-gray-900'
  const inputClass = 'w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4 sm:p-5">
          <h3 className="text-lg font-bold text-gray-900">{t('activityDetails')}</h3>
          <button onClick={onClose} className="rounded-full bg-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="mb-1 text-gray-500">{t('activityTitle')}</div>
              {canManage ? (
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{activity.title}</div>
              )}
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('activityDate')}</div>
              {canManage ? (
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{new Date(activity.eventDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
              )}
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('reminderDays')}</div>
              {canManage ? (
                <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{activity.reminderDays}</div>
              )}
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('activityVisibility')}</div>
              {canManage ? (
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')} className={inputClass}>
                  <option value="PUBLIC">{t('publicActivity')}</option>
                  <option value="PRIVATE">{t('privateActivity')}</option>
                </select>
              ) : (
                <div className={readOnlyFieldClass}>{activity.visibility === 'PUBLIC' ? t('publicActivity') : t('privateActivity')}</div>
              )}
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('userLabel')}</div>
              <div className={readOnlyFieldClass}>{activity.user?.roleName || '-'}</div>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-gray-500">{t('note')}</div>
              {canManage ? (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={inputClass} />
              ) : (
                <div className={`${readOnlyFieldClass} whitespace-pre-wrap`}>{activity.note || '-'}</div>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('attachmentsHistory')}</h4>
              <span className="text-xs text-gray-400">{activity.attachments?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(activity.attachments || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noAttachmentData')}</div>
              ) : (
                activity.attachments.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <a href={item.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-[#007AFF] hover:underline">
                        {t('viewAttachment')}
                      </a>
                      <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                    </div>
                    <div className="mt-1 text-gray-500">{item.note || '-'}</div>
                    <div className="mt-1 text-xs text-gray-400">{item.uploader?.roleName || '-'}</div>
                  </div>
                ))
              )}
            </div>
            {canManage && (
              <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 md:grid-cols-[1fr,1fr,auto]">
                <input type="file" accept="image/*" onChange={handleAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-4 file:py-2 file:font-semibold file:text-[#007AFF]" />
                <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className={inputClass} />
                <div className="flex flex-col gap-3 md:flex-row">
                  <OcrNoteButton locale={locale} attachment={attachment} context="activity-edit" onResolved={appendRecognizedText} disabled={loading} />
                  <button onClick={handleAppendAttachment} disabled={loading || !attachment} className="rounded-xl bg-[#007AFF] px-5 py-3 font-semibold text-white disabled:opacity-50">
                    {t('appendAttachment')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mobile-safe-sheet flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
          <button onClick={onClose} className="w-full rounded-xl bg-gray-200 px-5 py-3 font-semibold text-gray-700 sm:w-auto">
            {t('close')}
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            {canManage && (
              <>
                <button onClick={handleDelete} disabled={loading} className="rounded-xl bg-[#FF3B30] px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {t('deleteActivity')}
                </button>
                <button onClick={handleSave} disabled={loading} className="rounded-xl bg-[#34C759] px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {t('saveActivity')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
