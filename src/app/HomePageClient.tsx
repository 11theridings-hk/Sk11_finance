'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createRecord } from './actions/record'
import { createCategory } from './actions/category'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'
import RecordDetailModal from './RecordDetailModal'

type Props = {
  locale: Locale
  session: any
  stats: { balance: number }
  initialRecords: any[]
  categories: any[]
  pools: any[]
}

export default function HomePageClient({ locale, session, stats, initialRecords, categories, pools }: Props) {
  const t = createTranslator(locale)
  const [isClient, setIsClient] = useState(false)
  const [records, setRecords] = useState(initialRecords)
  const [selectedRecord, setSelectedRecord] = useState<any>(null)

  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [date, setDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [thirdCategoryId, setThirdCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [poolId, setPoolId] = useState('')
  const [attachment, setAttachment] = useState<ClientAttachment | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [note, setNote] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  useEffect(() => {
    setIsClient(true)
    const today = new Date().toISOString().split('T')[0]
    setDate(today)
  }, [])

  const filteredCategories = useMemo(() => {
    return categories.filter(c => c.type === type && !c.parentId)
  }, [categories, type])

  const currentCategory = useMemo(() => {
    return filteredCategories.find(c => c.id === categoryId)
  }, [filteredCategories, categoryId])

  const currentSubCategory = useMemo(() => {
    return currentCategory?.children?.find((item: any) => item.id === subCategoryId)
  }, [currentCategory, subCategoryId])

  const handleAddCategory = async (parentId?: string) => {
    const name = window.prompt(t('createNewCategoryPrompt'))
    if (name && name.trim()) {
      const res = await createCategory(name.trim(), parentId, type)
      if (res.success) {
        alert(t('categoryAdded'))
        window.location.reload()
      } else {
        alert(res.error)
      }
    }
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const compressed = await compressImage(file, 200)
        setAttachment(compressed)
      } catch (err) {
        alert(t('imageCompressionFailed'))
      }
    }
  }

  useEffect(() => {
    let timer: any
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    } else if (countdown === 0 && showConfirmDialog) {
      // 倒计时结束，执行提交
      setShowConfirmDialog(false)
      executeSubmit()
    }
    return () => clearTimeout(timer)
  }, [countdown, showConfirmDialog])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryId || !amount) {
      alert(t('fillRequiredFields'))
      return
    }
    if (!poolId) {
      alert(t('selectPoolRequired'))
      return
    }
    setShowConfirmDialog(true)
  }

  const handleConfirmSubmit = () => {
    setCountdown(5)
  }

  const executeSubmit = async () => {
    setIsSubmitting(true)
    
    let finalAmount = parseFloat(amount)
    if (type === 'EXPENSE') {
      finalAmount = -Math.abs(finalAmount)
    } else {
      finalAmount = Math.abs(finalAmount)
    }

    const res = await createRecord({
      type,
      date: new Date(date),
      note,
      amount: finalAmount,
      categoryId,
      subCategoryId: subCategoryId || undefined,
      thirdCategoryId: thirdCategoryId || undefined,
      poolId,
      attachment: attachment ? { ...attachment, note: attachmentNote || undefined } : undefined,
    })

    if (res.success) {
      alert(t('recordAdded'))
      window.location.reload()
    } else {
      alert(`${t('submitFailed')}: ${res.error}`)
      setIsSubmitting(false)
    }
  }

  const formBgClass = type === 'INCOME' ? 'bg-[#F2F8FF]' : 'bg-[#FFF2F2]'
  const formBorderClass = type === 'INCOME' ? 'border-[#007AFF]/20' : 'border-[#FF3B30]/20'
  const submitBtnClass = type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'

  const inputClass = "w-full border-transparent bg-white rounded-xl shadow-sm p-3 focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none transition-all text-gray-900 placeholder-gray-400"
  
  if (!isClient) return <div className="min-h-screen bg-[#F2F2F7]"></div>

  return (
    <div className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 overflow-x-hidden relative">
      <section className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 text-center w-full max-w-full overflow-hidden relative">
        <div className="absolute top-4 left-4 sm:top-5 sm:left-5 text-xs text-gray-500 font-medium flex items-center gap-1">
          {t('currentRole')}: <span className="text-gray-800 font-semibold">{session.roleName}</span>
        </div>
        <button 
          onClick={async () => {
            const { logout } = await import('./actions/auth');
            await logout();
            window.location.href = '/login';
          }}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-xs text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1 transition-colors"
        >
          {t('logout')}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>

        <div className="flex items-center justify-center gap-3 mb-4 sm:mb-6 mt-6 sm:mt-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('totalBalance')}</h2>
        </div>
        <div className="flex justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-gray-50 px-5 py-6">
            <div className="text-xs font-medium text-gray-500 mb-2">{t('currencyFixedHkd')}</div>
            <div className={`text-3xl font-bold ${stats.balance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {formatCurrency(locale, stats.balance || 0)}
            </div>
          </div>
        </div>
      </section>

      <section className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border ${formBgClass} ${formBorderClass} transition-colors`}>
        <div className="flex space-x-2 sm:space-x-3 mb-5 sm:mb-6 bg-gray-200/50 p-1 rounded-xl w-fit">
          <button
            type="button"
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30]' : 'bg-transparent text-gray-600 shadow-none'}`}
            onClick={() => { setType('EXPENSE'); setCategoryId(''); setSubCategoryId(''); setThirdCategoryId(''); }}
          >
            {t('expense')}
          </button>
          <button
            type="button"
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'INCOME' ? 'bg-white text-[#007AFF]' : 'bg-transparent text-gray-600 shadow-none'}`}
            onClick={() => { setType('INCOME'); setCategoryId(''); setSubCategoryId(''); setThirdCategoryId(''); }}
          >
            {t('income')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('date')}</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>{t('mainCategory')}</span>
                <button type="button" onClick={() => handleAddCategory()} className="text-[#007AFF] text-xs font-semibold hover:opacity-80">
                  {t('addMainCategory')}
                </button>
              </label>
              <select
                required
                value={categoryId}
                onChange={e => { setCategoryId(e.target.value); setSubCategoryId(''); setThirdCategoryId(''); }}
                className={inputClass}
              >
                <option value="" className="text-gray-400">{t('selectCategory')}</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>{t('subCategory')}</span>
                <button 
                  type="button" 
                  onClick={() => categoryId ? handleAddCategory(categoryId) : alert(t('chooseMainCategoryFirst'))} 
                  className={`${categoryId ? 'text-[#007AFF]' : 'text-gray-400'} text-xs font-semibold hover:opacity-80`}
                >
                  {t('addSubCategory')}
                </button>
              </label>
              <select
                value={subCategoryId}
                onChange={e => { setSubCategoryId(e.target.value); setThirdCategoryId(''); }}
                className={inputClass}
                disabled={!currentCategory || !currentCategory.children || currentCategory.children.length === 0}
              >
                <option value="" className="text-gray-400">
                  {!currentCategory ? t('selectMainCategoryFirst') : 
                   (currentCategory.children && currentCategory.children.length > 0) ? t('selectSubCategory') : t('noSubCategory')}
                </option>
                {currentCategory?.children?.map((sub: any) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>{t('grandCategory')}</span>
                <button
                  type="button"
                  onClick={() => subCategoryId ? handleAddCategory(subCategoryId) : alert(t('chooseSubCategoryFirst'))}
                  className={`${subCategoryId ? 'text-[#007AFF]' : 'text-gray-400'} text-xs font-semibold hover:opacity-80`}
                >
                  {t('addGrandCategory')}
                </button>
              </label>
              <select
                value={thirdCategoryId}
                onChange={e => setThirdCategoryId(e.target.value)}
                className={inputClass}
                disabled={!currentSubCategory?.children || currentSubCategory.children.length === 0}
              >
                <option value="" className="text-gray-400">
                  {!currentSubCategory ? t('selectSubCategoryFirst') :
                   (currentSubCategory.children && currentSubCategory.children.length > 0) ? t('selectGrandCategory') : t('noGrandCategory')}
                </option>
                {currentSubCategory?.children?.map((third: any) => (
                  <option key={third.id} value={third.id}>{third.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('amount')}</label>
              <div className="flex bg-white rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-[#007AFF]/30 transition-all">
                <div className="bg-transparent py-3 pl-3 pr-4 rounded-l-xl text-gray-900 font-medium text-sm sm:text-base shrink-0">
                  HKD$
                </div>
                <div className="w-px bg-gray-100 my-2 shrink-0"></div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full min-w-0 flex-1 bg-transparent border-transparent py-3 px-2 sm:px-3 rounded-r-xl outline-none text-gray-900 font-semibold text-sm sm:text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                {t('pool')}
              </label>
              <select
                required
                value={poolId}
                onChange={e => setPoolId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('selectPool')}</option>
                {pools.map(pool => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name} {pool.isReviewRequired ? `(${t('reviewAccount')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('noteOptional')}</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className={inputClass}
                placeholder={t('notePlaceholder')}
              />
            </div>
            
            <div className="md:col-span-2 bg-white/50 p-4 rounded-2xl border border-dashed border-gray-300">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">{t('attachment')} <span className="normal-case font-normal">(image &lt; 200KB)</span></label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF] hover:file:bg-[#007AFF]/20 transition-colors cursor-pointer"
              />
              <input
                type="text"
                value={attachmentNote}
                onChange={e => setAttachmentNote(e.target.value)}
                className={`${inputClass} mt-3`}
                placeholder={t('attachmentNotePlaceholder')}
              />
              {attachment && (
                <div className="mt-3 flex items-center space-x-2 text-xs font-medium text-[#34C759] bg-[#34C759]/10 p-2 rounded-lg w-fit">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  <span>{t('imageCompressed')}: {(attachment.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || countdown > 0}
            className={`w-full py-4 mt-6 text-white font-semibold rounded-xl shadow-sm transition-all ${
              isSubmitting || countdown > 0 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' 
                : submitBtnClass
            }`}
          >
            {countdown > 0 ? `${t('submitting')} (${countdown}s)` : isSubmitting ? t('submitting') : t('submitRecord')}
          </button>
        </form>
      </section>
      
      <section className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-10">
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">{t('recentRecords')}</h2>
        </div>
        <div className="w-full">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-medium">{t('date')}</th>
                  <th className="px-6 py-3 font-medium">{t('type')}</th>
                  <th className="px-6 py-3 font-medium">{t('category')}</th>
                  <th className="px-6 py-3 font-medium">{t('amount')}</th>
                  <th className="px-6 py-3 font-medium">{t('note')}</th>
                  <th className="px-6 py-3 font-medium">{t('detail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400 font-medium">{t('noRecords')}</td>
                  </tr>
                ) : (
                  records.map(record => (
                    <tr key={record.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 font-medium">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                          record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                        }`}>
                          {record.type === 'INCOME' ? t('income') : t('expense')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {record.category?.name || '-'}
                        {record.subCategory ? ` / ${record.subCategory.name}` : ''}
                        {record.thirdCategory ? ` / ${record.thirdCategory.name}` : ''}
                      </td>
                      <td className={`px-6 py-4 font-bold ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                        {formatCurrency(locale, record.amount)}
                      </td>
                      <td className="px-6 py-4 text-gray-500 truncate max-w-xs">{record.note || '-'}</td>
                      <td className="px-6 py-4">
                        <button onClick={() => setSelectedRecord(record)} className="text-[#007AFF] hover:underline font-medium text-sm">
                          {t('detail')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="md:hidden divide-y divide-gray-100">
            {records.length === 0 ? (
              <div className="p-8 text-center text-gray-400 font-medium">{t('noRecords')}</div>
            ) : (
              records.map(record => (
                <div key={record.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{new Date(record.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                      }`}>
                        {record.type === 'INCOME' ? t('income') : t('expense')}
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                      {formatCurrency(locale, record.amount)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
                  </div>
                  {record.note && (
                    <div className="text-xs text-gray-500 truncate">{record.note}</div>
                  )}
                  <div className="pt-1">
                    <button onClick={() => setSelectedRecord(record)} className="text-[#007AFF] font-medium text-xs bg-[#007AFF]/10 px-3 py-1 rounded">
                      {t('detail')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm flex flex-col shadow-xl overflow-hidden p-6 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('confirmSubmit')}</h3>
            <div className="bg-gray-50 rounded-2xl p-4 text-left text-sm space-y-2 mb-6 border border-gray-100">
              <p><span className="text-gray-500">{t('type')}:</span> <span className="font-semibold">{type === 'INCOME' ? t('income') : t('expense')}</span></p>
              <p><span className="text-gray-500">{t('amount')}:</span> <span className={`font-bold ${type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, Number(amount || 0) * (type === 'EXPENSE' ? -1 : 1))}</span></p>
              <p><span className="text-gray-500">{t('date')}:</span> <span>{date}</span></p>
              <p><span className="text-gray-500">{t('category')}:</span> <span>{[currentCategory?.name, currentSubCategory?.name, currentSubCategory?.children?.find((item: any) => item.id === thirdCategoryId)?.name].filter(Boolean).join(' / ')}</span></p>
              {poolId && (
                <p><span className="text-gray-500">{t('pool')}:</span> <span>{pools.find((p: any) => p.id === poolId)?.name}</span></p>
              )}
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowConfirmDialog(false); setCountdown(0); }}
                disabled={countdown > 0}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleConfirmSubmit}
                disabled={countdown > 0}
                className={`flex-1 py-3 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 ${submitBtnClass}`}
              >
                {countdown > 0 ? `${t('submitting')} (${countdown}s)` : t('confirmAgain')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRecord && (
        <RecordDetailModal record={selectedRecord} locale={locale} onClose={() => setSelectedRecord(null)} />
      )}

    </div>
  )
}
