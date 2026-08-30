'use client'

import { useState } from 'react'
import { addRecordAttachment, addRecordMemo, deleteRecord } from './actions/record'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'

export default function RecordDetailModal({
  record,
  locale,
  onClose,
}: {
  record: any
  locale: Locale
  onClose: () => void
}) {
  const t = createTranslator(locale)
  const [attachment, setAttachment] = useState<ClientAttachment | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [memoContent, setMemoContent] = useState('')
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
    const res = await addRecordAttachment(record.id, {
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

  const handleAddMemo = async () => {
    if (!memoContent.trim()) return
    setLoading(true)
    const res = await addRecordMemo(record.id, memoContent.trim())
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
    const res = await deleteRecord(record.id)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] max-w-3xl overflow-hidden shadow-xl flex flex-col sm:rounded-3xl">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900">{t('recordDetails')}</h3>
          <button onClick={onClose} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500 mb-1">{t('date')}</div>
              <div className="font-semibold text-gray-900">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">{t('status')}</div>
              <div className="font-semibold text-gray-900">{record.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">{t('type')}</div>
              <div className="font-semibold text-gray-900">{record.type === 'INCOME' ? t('income') : t('expense')}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">{t('amount')}</div>
              <div className={`font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, record.amount)}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">{t('category')}</div>
              <div className="font-semibold text-gray-900">
                {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
              </div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">{t('pool')}</div>
              <div className="font-semibold text-gray-900">{record.pool?.name || '-'}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-gray-500 mb-1">{t('note')}</div>
              <div className="font-semibold text-gray-900">{record.note || '-'}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
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
                      <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-[#007AFF] hover:underline font-medium">
                        {t('viewAttachment')}
                      </a>
                      <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                    </div>
                    <div className="text-gray-500 mt-1">{item.note || '-'}</div>
                    <div className="text-xs text-gray-400 mt-1">{item.uploader?.roleName || '-'}</div>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3 pt-3 border-t border-gray-100">
              <input type="file" accept="image/*" onChange={handleAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF]" />
              <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className="w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none" />
              <button onClick={handleAppendAttachment} disabled={loading || !attachment} className="px-5 py-3 bg-[#007AFF] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('appendAttachment')}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('memoHistory')}</h4>
              <span className="text-xs text-gray-400">{record.memos?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(record.memos || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noMemoData')}</div>
              ) : (
                record.memos.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-gray-900">{item.author?.roleName || '-'}</div>
                      <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                    </div>
                    <div className="text-gray-600 mt-1 whitespace-pre-wrap">{item.content}</div>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-col gap-3 pt-3 border-t border-gray-100 sm:flex-row">
              <input value={memoContent} onChange={(e) => setMemoContent(e.target.value)} placeholder={t('memoPlaceholder')} className="flex-1 rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none" />
              <button onClick={handleAddMemo} disabled={loading || !memoContent.trim()} className="px-5 py-3 bg-[#34C759] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('addMemo')}
              </button>
            </div>
          </div>
        </div>

        <div className="mobile-safe-sheet p-4 sm:p-5 border-t border-gray-100 bg-white flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button onClick={onClose} className="w-full px-5 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold sm:w-auto">
            {t('close')}
          </button>
          <button onClick={handleDelete} disabled={loading} className="px-5 py-3 bg-[#FF3B30] text-white rounded-xl font-semibold disabled:opacity-50">
            {t('deleteRecord')}
          </button>
        </div>
      </div>
    </div>
  )
}
