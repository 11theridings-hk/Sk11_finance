'use client'

import { useState } from 'react'
import { completePayment } from '../actions/payment'
import { openAttachment, compressImage, MAX_PDF_PAGES, prepareAttachments, type ClientAttachment } from '@/lib/image'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import NoteTimeline from '@/components/NoteTimeline'

export default function PaymentClient({
  pendingPaymentRecords,
  locale,
  title,
}: {
  pendingPaymentRecords: any[]
  locale: Locale
  title: string
}) {
  const t = createTranslator(locale)
  const [loading, setLoading] = useState(false)
  const [modalRecord, setModalRecord] = useState<any>(null)
  const [paymentFiles, setPaymentFiles] = useState<ClientAttachment[]>([])
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const prepared = await prepareAttachments(file)
      setPaymentFiles(prepared.attachments)
      if (prepared.truncated) {
        alert(
          t('pdfPagesTruncated')
            .replace('{{total}}', String(prepared.totalPages))
            .replace('{{max}}', String(MAX_PDF_PAGES))
        )
      }
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setPaymentFiles([fallback])
      } catch {
        alert(t('ocrInvalidImage'))
      }
    } finally {
      setUploading(false)
    }
  }

  const handleComplete = async (mode: 'attachment' | 'manual') => {
    if (!modalRecord) return
    if (mode === 'attachment' && paymentFiles.length === 0) {
      alert(t('paymentProofRequired'))
      return
    }
    setLoading(true)
    const res = await completePayment(
      modalRecord.id,
      mode === 'attachment'
        ? { attachments: paymentFiles }
        : { manual: true }
    )
    if (res.success) {
      alert(t('paymentCompleted'))
      window.location.reload()
    } else {
      alert(res.error)
      setLoading(false)
    }
  }

  const closeModal = () => {
    setModalRecord(null)
    setPaymentFiles([])
  }

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('paymentPageHint')}</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">{t('time')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('category')}</th>
                <th className="px-6 py-3 font-medium">{t('role')}</th>
                <th className="px-6 py-3 font-medium">{t('pool')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('content')}</th>
                <th className="px-6 py-3 font-medium">{t('note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingPaymentRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center font-medium text-gray-400">
                    {t('noData')}
                  </td>
                </tr>
              ) : (
                pendingPaymentRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50/80"
                    onClick={() => {
                      setPaymentFiles([])
                      setModalRecord(record)
                    }}
                  >
                    <td className="px-6 py-4 font-medium">
                      {new Date(record.updatedAt || record.createdAt).toLocaleString(
                        locale === 'en' ? 'en-HK' : 'zh-HK'
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ${
                          record.type === 'INCOME'
                            ? 'bg-[#007AFF]/10 text-[#007AFF]'
                            : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                        }`}
                      >
                        {record.type === 'INCOME' ? t('income') : t('expense')}
                        {record.originalRecordId && ` (${t('modify')})`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{record.user?.roleName || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{record.pool?.name || '-'}</td>
                    <td
                      className={`px-6 py-4 font-bold ${
                        record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'
                      }`}
                    >
                      {formatCurrency(locale, record.amount)}
                    </td>
                    <td className="max-w-[120px] truncate px-6 py-4 text-gray-500">
                      {record.content || '-'}
                    </td>
                    <td className="max-w-[150px] truncate px-6 py-4 text-gray-500">
                      {record.note || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-5">
              <h3 className="text-lg font-bold text-gray-900">{t('paymentDetail')}</h3>
              <button
                onClick={closeModal}
                className="rounded-full bg-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="mb-1 block text-gray-500">{t('role')}</span>
                  <span className="font-semibold text-gray-900">
                    {modalRecord.user?.roleName}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-gray-500">{t('status')}</span>
                  <span className="inline-flex rounded-md bg-[#5856D6]/10 px-2 py-1 text-xs font-semibold text-[#5856D6]">
                    {t('pendingPayment')}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-gray-500">{t('category')}</span>
                  <span className="font-semibold text-gray-900">
                    {[
                      modalRecord.category?.name,
                      modalRecord.subCategory?.name,
                      modalRecord.thirdCategory?.name,
                    ]
                      .filter(Boolean)
                      .join(' / ') || '-'}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-gray-500">{t('pool')}</span>
                  <span className="font-semibold text-gray-900">
                    {modalRecord.pool?.name || '-'}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-gray-500">{t('type')}</span>
                  <span className="font-semibold text-gray-900">
                    {modalRecord.type === 'INCOME' ? t('income') : t('expense')}
                    {modalRecord.originalRecordId && ` (${t('modify')})`}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block text-gray-500">{t('amount')}</span>
                  <span
                    className={`font-bold ${
                      modalRecord.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'
                    }`}
                  >
                    {formatCurrency(locale, modalRecord.amount)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="mb-1 block text-gray-500">{t('content')}</span>
                  <span className="whitespace-pre-wrap font-semibold text-gray-900">
                    {modalRecord.content || '-'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="mb-1 block text-gray-500">{t('note')}</span>
                  <span className="whitespace-pre-wrap font-semibold text-gray-900">
                    {modalRecord.note || '-'}
                  </span>
                </div>

                <div className="col-span-2">
                  <span className="mb-1 block text-gray-500">{t('attachmentsHistory')}</span>
                  <div className="space-y-2">
                    {(modalRecord.attachments || []).length === 0 ? (
                      <span className="text-sm text-gray-400">{t('noAttachmentData')}</span>
                    ) : (
                      modalRecord.attachments.map((item: any) => (
                        <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openAttachment(item.fileUrl)
                            }}
                            className="font-medium text-[#007AFF] hover:underline"
                          >
                            {t('viewAttachment')}
                          </button>
                          <div className="mt-1 text-gray-500">{item.note || '-'}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <NoteTimeline
                locale={locale}
                items={modalRecord.memos || []}
                canAdd={false}
                onAdd={async () => ({ success: true })}
              />

              <div className="space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {t('uploadPaymentProof')}
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={loading || uploading}
                    onChange={handleFileChange}
                    className="w-full text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-[#007AFF]"
                  />
                  {paymentFiles.length > 0 && (
                    <p className="mt-2 text-xs text-[#34C759]">
                      {t('paymentProofReady')} ({paymentFiles.length})
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{t('paymentProofHint')}</p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => handleComplete('attachment')}
                    disabled={loading || uploading || paymentFiles.length === 0}
                    className="flex-1 rounded-xl bg-[#007AFF] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#0066D6] disabled:opacity-50"
                  >
                    {t('completeWithProof')}
                  </button>
                  <button
                    onClick={() => handleComplete('manual')}
                    disabled={loading || uploading}
                    className="flex-1 rounded-xl bg-[#34C759] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#28A745] disabled:opacity-50"
                  >
                    {t('paymentManualPass')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
