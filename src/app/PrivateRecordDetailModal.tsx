'use client'

import { useState } from 'react'
import { addPrivateRecordAttachment, deletePrivateRecord } from './actions/private-record'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'

export default function PrivateRecordDetailModal({
  record,
  locale,
  canManage,
  onClose,
}: {
  record: any
  locale: Locale
  canManage: boolean
  onClose: () => void
}) {
  const t = createTranslator(locale)
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

  const handleAppendAttachment = async () => {
    if (!attachment) return
    setLoading(true)
    const res = await addPrivateRecordAttachment(record.id, {
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
    if (!window.confirm(t('deleteRecordConfirm'))) return
    setLoading(true)
    const res = await deletePrivateRecord(record.id)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4 sm:p-5">
          <h3 className="text-lg font-bold text-gray-900">{t('privateLedgerDetails')}</h3>
          <button onClick={onClose} className="rounded-full bg-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1 text-gray-500">{t('date')}</div>
              <div className="font-semibold text-gray-900">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('type')}</div>
              <div className="font-semibold text-gray-900">{record.type === 'INCOME' ? t('income') : t('expense')}</div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('category')}</div>
              <div className="font-semibold text-gray-900">
                {record.customCategory?.trim() || [record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || t('uncategorized')}
              </div>
            </div>
            <div>
              <div className="mb-1 text-gray-500">{t('amount')}</div>
              <div className={`font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, record.amount)}</div>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-gray-500">{t('note')}</div>
              <div className="font-semibold text-gray-900">{record.note || '-'}</div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('attachmentsHistory')}</h4>
              <span className="text-xs text-gray-400">{record.attachments?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(record.attachments || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noAttachmentData')}</div>
              ) : (
                record.attachments.map((item: any) => (
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
                <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className="w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none" />
                <button onClick={handleAppendAttachment} disabled={loading || !attachment} className="rounded-xl bg-[#007AFF] px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {t('appendAttachment')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mobile-safe-sheet flex flex-col-reverse gap-3 border-t border-gray-100 bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
          <button onClick={onClose} className="w-full rounded-xl bg-gray-200 px-5 py-3 font-semibold text-gray-700 sm:w-auto">
            {t('close')}
          </button>
          {canManage ? (
            <button onClick={handleDelete} disabled={loading} className="rounded-xl bg-[#FF3B30] px-5 py-3 font-semibold text-white disabled:opacity-50">
              {t('deleteRecord')}
            </button>
          ) : <div />}
        </div>
      </div>
    </div>
  )
}