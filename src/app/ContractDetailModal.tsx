'use client'

import { useState } from 'react'
import { addContractAttachment, addContractMemo, deleteContract, updateContract } from './actions/contract'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, openAttachment, prepareAttachment, type ClientAttachment } from '@/lib/image'

export default function ContractDetailModal({
  contract,
  locale,
  canManage,
  pools,
  onClose,
}: {
  contract: any
  locale: Locale
  canManage: boolean
  pools: any[]
  onClose: () => void
}) {
  const t = createTranslator(locale)
  const dateLocale = locale === 'en' ? 'en-HK' : 'zh-HK'
  const inputClass = 'w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none'
  const readOnlyFieldClass = 'font-semibold text-gray-900'

  const [title, setTitle] = useState(contract.title || '')
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(contract.type === 'INCOME' ? 'INCOME' : 'EXPENSE')
  const [effectiveDate, setEffectiveDate] = useState(new Date(contract.effectiveDate).toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(new Date(contract.expiryDate).toISOString().split('T')[0])
  const [reminderDays, setReminderDays] = useState(String(contract.reminderDays ?? 15))
  const [amount, setAmount] = useState(String(Math.abs(Number(contract.amount) || 0)))
  const [poolId, setPoolId] = useState(contract.poolId || '')
  const [note, setNote] = useState(contract.note || '')
  const [attachment, setAttachment] = useState<ClientAttachment | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [memoContent, setMemoContent] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const prepared = await prepareAttachment(file)
      setAttachment(prepared)
    } catch {
      try {
        setAttachment(await compressImage(file, 200))
      } catch {
        alert(t('imageCompressionFailed'))
      }
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !amount || !effectiveDate || !expiryDate || !reminderDays.trim()) {
      alert(t('fillRequiredFields'))
      return
    }

    setLoading(true)
    const numericAmount = type === 'EXPENSE' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
    const res = await updateContract(contract.id, {
      title: title.trim(),
      type,
      effectiveDate: new Date(effectiveDate),
      expiryDate: new Date(expiryDate),
      reminderDays: Number(reminderDays),
      amount: numericAmount,
      note: note.trim() || undefined,
      poolId: poolId || undefined,
      categoryId: contract.categoryId || undefined,
      subCategoryId: contract.subCategoryId || undefined,
      thirdCategoryId: contract.thirdCategoryId || undefined,
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
    const res = await addContractAttachment(contract.id, {
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
    const res = await addContractMemo(contract.id, memoContent.trim())
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!window.confirm(t('deleteContractConfirm'))) return
    setLoading(true)
    const res = await deleteContract(contract.id)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t('contractDetails')}</h3>
            {!canManage && (
              <p className="mt-1 text-xs text-gray-500">{t('onlyCreatorCanEditContract')}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="md:col-span-2">
              <div className="text-gray-500 mb-1">{t('contractTitle')}</div>
              {canManage ? (
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{contract.title}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('type')}</div>
              {canManage ? (
                <div className="flex space-x-2 rounded-xl bg-gray-200/50 p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30] shadow-sm' : 'text-gray-600'}`}
                    onClick={() => setType('EXPENSE')}
                  >
                    {t('expense')}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${type === 'INCOME' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-gray-600'}`}
                    onClick={() => setType('INCOME')}
                  >
                    {t('income')}
                  </button>
                </div>
              ) : (
                <div className={readOnlyFieldClass}>{contract.type === 'INCOME' ? t('income') : t('expense')}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('amount')}</div>
              {canManage ? (
                <div className="flex rounded-xl bg-[#F2F2F7] focus-within:ring-2 focus-within:ring-[#007AFF]/30">
                  <div className="shrink-0 py-3 pl-3 pr-2 text-sm font-medium text-gray-900">HKD$</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full min-w-0 flex-1 rounded-r-xl border-transparent bg-transparent px-2 py-3 text-sm font-semibold text-gray-900 outline-none"
                  />
                </div>
              ) : (
                <div className={`font-bold ${contract.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                  {formatCurrency(locale, contract.amount)}
                </div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('effectiveDate')}</div>
              {canManage ? (
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{new Date(contract.effectiveDate).toLocaleDateString(dateLocale)}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('expiryDate')}</div>
              {canManage ? (
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{new Date(contract.expiryDate).toLocaleDateString(dateLocale)}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('reminderDays')}</div>
              {canManage ? (
                <input type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{contract.reminderDays ?? 15}</div>
              )}
            </div>

            <div>
              <div className="text-gray-500 mb-1">{t('pool')}</div>
              {canManage ? (
                <select value={poolId} onChange={(e) => setPoolId(e.target.value)} className={inputClass}>
                  <option value="">{t('all')}</option>
                  {pools.map((pool: any) => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
              ) : (
                <div className={readOnlyFieldClass}>{contract.pool?.name || '-'}</div>
              )}
            </div>

            <div className="md:col-span-2">
              <div className="text-gray-500 mb-1">{t('note')}</div>
              {canManage ? (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass} />
              ) : (
                <div className={readOnlyFieldClass}>{contract.note || '-'}</div>
              )}
            </div>

            {(contract.category || contract.subCategory || contract.thirdCategory) && (
              <div className="md:col-span-2">
                <div className="text-gray-500 mb-1">{t('category')}</div>
                <div className={readOnlyFieldClass}>
                  {[contract.category?.name, contract.subCategory?.name, contract.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('attachmentsHistory')}</h4>
              <span className="text-xs text-gray-400">{contract.attachments?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(contract.attachments || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noAttachmentData')}</div>
              ) : (
                contract.attachments.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openAttachment(item.fileUrl)}
                        className="text-[#007AFF] hover:underline font-medium"
                      >
                        {t('viewAttachment')}
                      </button>
                      <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(dateLocale)}</span>
                    </div>
                    <div className="text-gray-500 mt-1">{item.note || '-'}</div>
                    <div className="text-xs text-gray-400 mt-1">{item.uploader?.roleName || '-'}</div>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-3 pt-3 border-t border-gray-100">
              <input type="file" accept="image/*,application/pdf" onChange={handleAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF]" />
              <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className="w-full rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none" />
              <button onClick={handleAppendAttachment} disabled={loading || !attachment} className="px-5 py-3 bg-[#007AFF] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('appendAttachment')}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{t('memoHistory')}</h4>
              <span className="text-xs text-gray-400">{contract.memos?.length || 0}</span>
            </div>
            <div className="space-y-3">
              {(contract.memos || []).length === 0 ? (
                <div className="text-sm text-gray-400">{t('noMemoData')}</div>
              ) : (
                contract.memos.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-gray-900">{item.author?.roleName || '-'}</div>
                      <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString(dateLocale)}</span>
                    </div>
                    <div className="text-gray-600 mt-1 whitespace-pre-wrap">{item.content}</div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-3 pt-3 border-t border-gray-100">
              <input value={memoContent} onChange={(e) => setMemoContent(e.target.value)} placeholder={t('memoPlaceholder')} className="flex-1 rounded-xl bg-[#F2F2F7] px-3 py-3 text-sm text-gray-900 outline-none" />
              <button onClick={handleAddMemo} disabled={loading || !memoContent.trim()} className="px-5 py-3 bg-[#34C759] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('addMemo')}
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 bg-white flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button onClick={onClose} className="px-5 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold">
            {t('close')}
          </button>
          {canManage && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={handleDelete} disabled={loading} className="px-5 py-3 bg-[#FF3B30] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('deleteContract')}
              </button>
              <button onClick={handleSave} disabled={loading} className="px-5 py-3 bg-[#34C759] text-white rounded-xl font-semibold disabled:opacity-50">
                {t('saveContract')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
