'use client'

import { useState } from 'react'
import { reviewRecord } from '../actions/review'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'

export default function ReviewClient({
  pendingRecords,
  reviewedRecords,
  locale,
  title,
}: {
  pendingRecords: any[],
  reviewedRecords: any[],
  locale: Locale,
  title: string,
}) {
  const t = createTranslator(locale)
  const [tab, setTab] = useState<'PENDING' | 'REVIEWED'>('PENDING')
  const [loading, setLoading] = useState(false)
  const [modalRecord, setModalRecord] = useState<any>(null)

  const records = tab === 'PENDING' ? pendingRecords : reviewedRecords

  const handleAction = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setLoading(true)
    const res = await reviewRecord(id, action)
    if (res.success) {
      alert(action === 'APPROVE' ? t('reviewerPassed') : t('reviewerRejected'))
      window.location.reload()
    } else {
      alert(res.error)
      setLoading(false)
    }
  }

  return (
    <div className="pt-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="flex space-x-6 border-b border-gray-200">
        <button
          className={`pb-2 font-semibold ${tab === 'PENDING' ? 'text-[#007AFF] border-b-2 border-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('PENDING')}
        >
          {t('pending')} ({pendingRecords.length})
        </button>
        <button
          className={`pb-2 font-semibold ${tab === 'REVIEWED' ? 'text-[#007AFF] border-b-2 border-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('REVIEWED')}
        >
          {t('reviewed')}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                {tab === 'REVIEWED' && <th className="px-6 py-3 font-medium w-10">{t('status')}</th>}
                <th className="px-6 py-3 font-medium">{t('time')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('category')}</th>
                <th className="px-6 py-3 font-medium">{t('role')}</th>
                <th className="px-6 py-3 font-medium">{t('pool')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'REVIEWED' ? 8 : 7} className="p-8 text-center text-gray-400 font-medium">{t('noData')}</td>
                </tr>
              ) : (
                records.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50/80 transition-colors cursor-pointer" onClick={() => setModalRecord(record)}>
                    {tab === 'REVIEWED' && (
                      <td className="px-6 py-4">
                        {record.status === 'APPROVED' ? (
                          <svg className="w-5 h-5 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        ) : (
                          <svg className="w-5 h-5 text-[#FF3B30]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 font-medium">{new Date(record.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                      }`}>
                        {record.type === 'INCOME' ? t('income') : t('expense')}
                        {record.originalRecordId && ` (${t('modify')})`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {record.category?.name || '-'}
                      {record.subCategory ? ` / ${record.subCategory.name}` : ''}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{record.user?.roleName || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{record.pool?.name || '-'}</td>
                    <td className={`px-6 py-4 font-bold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                      {formatCurrency(locale, record.amount)}
                    </td>
                    <td className="px-6 py-4 text-gray-500 truncate max-w-[150px]">{record.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">{t('reviewDetail')}</h3>
              <button onClick={() => setModalRecord(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">{t('time')}</span>
                  <span className="font-semibold text-gray-900">{new Date(modalRecord.createdAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">{t('role')}</span>
                  <span className="font-semibold text-gray-900">{modalRecord.user?.roleName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">{t('category')}</span>
                  <span className="font-semibold text-gray-900">{modalRecord.category?.name} {modalRecord.subCategory ? `/ ${modalRecord.subCategory.name}` : ''}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">{t('pool')}</span>
                  <span className="font-semibold text-gray-900">{modalRecord.pool?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">{t('type')}</span>
                  <span className="font-semibold text-gray-900">
                    {modalRecord.type === 'INCOME' ? t('income') : t('expense')}
                    {modalRecord.originalRecordId && ` (${t('modify')})`}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">{t('amount')}</span>
                  <span className={`font-bold ${modalRecord.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                    {formatCurrency(locale, modalRecord.amount)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 block mb-1">{t('note')}</span>
                  <span className="font-semibold text-gray-900">{modalRecord.note || '-'}</span>
                </div>
              </div>

              {tab === 'PENDING' && (
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleAction(modalRecord.id, 'APPROVE')}
                    disabled={loading}
                    className="flex-1 py-3 bg-[#34C759] hover:bg-[#28A745] text-white rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {t('approve')}
                  </button>
                  <button
                    onClick={() => handleAction(modalRecord.id, 'REJECT')}
                    disabled={loading}
                    className="flex-1 py-3 bg-[#FF3B30] hover:bg-[#CC2E26] text-white rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {t('reject')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
