'use client'

import React, { useMemo, useState } from 'react'
import { createContract } from '../actions/contract'
import { createCategory } from '../actions/category'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'
import ContractDetailModal from '../ContractDetailModal'

type Props = {
  locale: Locale
  categories: any[]
  pools: any[]
  initialContracts: any[]
}

export default function ContractsClient({ locale, categories, pools, initialContracts }: Props) {
  const t = createTranslator(locale)
  const [selectedContract, setSelectedContract] = useState<any>(null)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [title, setTitle] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [thirdCategoryId, setThirdCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [poolId, setPoolId] = useState('')
  const [note, setNote] = useState('')
  const [attachment, setAttachment] = useState<ClientAttachment | null>(null)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mainCategories = useMemo(() => categories.filter((item) => item.type === type), [categories, type])
  const currentCategory = useMemo(() => mainCategories.find((item) => item.id === categoryId), [mainCategories, categoryId])
  const currentSubCategory = useMemo(() => currentCategory?.children?.find((item: any) => item.id === subCategoryId), [currentCategory, subCategoryId])
  const expiringContracts = useMemo(() => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    return initialContracts
      .map((contract) => {
        const expiry = new Date(contract.expiryDate)
        const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate())
        const daysUntilExpiry = Math.ceil((expiryDay.getTime() - startOfToday.getTime()) / 86400000)

        return {
          ...contract,
          daysUntilExpiry,
        }
      })
      .filter((contract) => contract.daysUntilExpiry >= 0 && contract.daysUntilExpiry <= 15)
  }, [initialContracts])

  const handleAddCategory = async (parentId?: string) => {
    const name = window.prompt(t('createNewCategoryPrompt'))
    if (!name?.trim()) return
    const res = await createCategory(name.trim(), parentId, type)
    if (res.success) {
      window.location.reload()
      return
    }
    alert(res.error)
  }

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
    if (!title || !categoryId || !amount || !effectiveDate || !expiryDate) {
      alert(t('fillRequiredFields'))
      return
    }

    setIsSubmitting(true)
    const numericAmount = type === 'EXPENSE' ? -Math.abs(Number(amount)) : Math.abs(Number(amount))
    const res = await createContract({
      title,
      type,
      effectiveDate: new Date(effectiveDate),
      expiryDate: new Date(expiryDate),
      amount: numericAmount,
      note,
      categoryId,
      subCategoryId: subCategoryId || undefined,
      thirdCategoryId: thirdCategoryId || undefined,
      poolId: poolId || undefined,
      attachment: attachment ? { ...attachment, note: attachmentNote || undefined } : undefined,
    })

    if (res.success) {
      window.location.reload()
      return
    }

    alert(`${t('submitFailed')}: ${res.error}`)
    setIsSubmitting(false)
  }

  const inputClass = 'w-full border-transparent bg-white rounded-xl shadow-sm p-3 focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none transition-all text-gray-900 placeholder-gray-400'

  return (
    <div className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 overflow-x-hidden relative">
      {expiringContracts.length > 0 && (
        <section className="rounded-2xl sm:rounded-3xl border border-[#FF9500]/20 bg-[#FFF7ED] px-4 py-4 shadow-sm sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-[#FF9500]/10 p-2 text-[#FF9500]">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-[#9A3412]">{t('contractExpiryReminder')}</h2>
              <p className="mt-1 text-sm text-[#C2410C]">{t('contractsExpireWithin15Days')}</p>
              <div className="mt-3 space-y-2">
                {expiringContracts.slice(0, 3).map((contract) => (
                  <div key={contract.id} className="flex flex-col gap-1 rounded-xl bg-white/80 px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-medium text-gray-900">{contract.title}</div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <span>{new Date(contract.expiryDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                      <span className="rounded-full bg-[#FFEDD5] px-2 py-0.5 font-medium text-[#C2410C]">
                        {contract.daysUntilExpiry === 0 ? (locale === 'en' ? 'Expires today' : '今天到期') : (locale === 'en' ? `${contract.daysUntilExpiry} days left` : `尚餘 ${contract.daysUntilExpiry} 天`)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {expiringContracts.length > 3 && (
                <p className="mt-3 text-xs text-[#9A3412]">{t('moreExpiringContracts')}</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">{t('contractsPage')}</h2>
        <p className="text-sm text-gray-500 mt-2">{t('contractsPageHint')}</p>
      </section>

      <section className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border ${type === 'INCOME' ? 'bg-[#F2F8FF] border-[#007AFF]/20' : 'bg-[#FFF2F2] border-[#FF3B30]/20'}`}>
        <div className="flex space-x-2 sm:space-x-3 mb-5 sm:mb-6 bg-gray-200/50 p-1 rounded-xl w-fit">
          <button type="button" className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30]' : 'bg-transparent text-gray-600 shadow-none'}`} onClick={() => { setType('EXPENSE'); setCategoryId(''); setSubCategoryId(''); setThirdCategoryId('') }}>
            {t('expense')}
          </button>
          <button type="button" className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'INCOME' ? 'bg-white text-[#007AFF]' : 'bg-transparent text-gray-600 shadow-none'}`} onClick={() => { setType('INCOME'); setCategoryId(''); setSubCategoryId(''); setThirdCategoryId('') }}>
            {t('income')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('contractTitle')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={t('contractTitlePlaceholder')} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('effectiveDate')}</label>
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('expiryDate')}</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>{t('mainCategory')}</span>
                <button type="button" onClick={() => handleAddCategory()} className="text-[#007AFF] text-xs font-semibold hover:opacity-80">{t('addMainCategory')}</button>
              </label>
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubCategoryId(''); setThirdCategoryId('') }} className={inputClass}>
                <option value="">{t('selectCategory')}</option>
                {mainCategories.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>{t('subCategory')}</span>
                <button type="button" onClick={() => categoryId ? handleAddCategory(categoryId) : alert(t('chooseMainCategoryFirst'))} className={`${categoryId ? 'text-[#007AFF]' : 'text-gray-400'} text-xs font-semibold hover:opacity-80`}>{t('addSubCategory')}</button>
              </label>
              <select value={subCategoryId} onChange={(e) => { setSubCategoryId(e.target.value); setThirdCategoryId('') }} className={inputClass} disabled={!currentCategory?.children?.length}>
                <option value="">{!currentCategory ? t('selectMainCategoryFirst') : t('selectSubCategory')}</option>
                {currentCategory?.children?.map((sub: any) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>{t('grandCategory')}</span>
                <button type="button" onClick={() => subCategoryId ? handleAddCategory(subCategoryId) : alert(t('chooseSubCategoryFirst'))} className={`${subCategoryId ? 'text-[#007AFF]' : 'text-gray-400'} text-xs font-semibold hover:opacity-80`}>{t('addGrandCategory')}</button>
              </label>
              <select value={thirdCategoryId} onChange={(e) => setThirdCategoryId(e.target.value)} className={inputClass} disabled={!currentSubCategory?.children?.length}>
                <option value="">{!currentSubCategory ? t('selectSubCategoryFirst') : t('selectGrandCategory')}</option>
                {currentSubCategory?.children?.map((third: any) => <option key={third.id} value={third.id}>{third.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('amount')}</label>
              <div className="flex bg-white rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-[#007AFF]/30 transition-all">
                <div className="bg-transparent py-3 pl-3 pr-4 rounded-l-xl text-gray-900 font-medium text-sm sm:text-base shrink-0">HKD$</div>
                <div className="w-px bg-gray-100 my-2 shrink-0" />
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full min-w-0 flex-1 bg-transparent border-transparent py-3 px-2 sm:px-3 rounded-r-xl outline-none text-gray-900 font-semibold text-sm sm:text-base" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('pool')}</label>
              <select value={poolId} onChange={(e) => setPoolId(e.target.value)} className={inputClass}>
                <option value="">{t('all')}</option>
                {pools.map((pool: any) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('noteOptional')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder={t('contractNotePlaceholder')} />
            </div>

            <div className="md:col-span-2 bg-white/50 p-4 rounded-2xl border border-dashed border-gray-300 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('attachment')}</label>
              <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF]" />
              <input value={attachmentNote} onChange={(e) => setAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className={inputClass} />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className={`w-full py-4 mt-6 text-white font-semibold rounded-xl shadow-sm transition-all ${isSubmitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' : type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'}`}>
            {isSubmitting ? t('submitting') : t('createContract')}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-10">
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">{t('contractsList')}</h2>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">{t('contractTitle')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('category')}</th>
                <th className="px-6 py-3 font-medium">{t('expiryDate')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialContracts.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400 font-medium">{t('noContracts')}</td></tr>
              ) : (
                initialContracts.map((contract) => (
                  <tr key={contract.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium">{contract.title}</td>
                    <td className="px-6 py-4">{contract.type === 'INCOME' ? t('income') : t('expense')}</td>
                    <td className="px-6 py-4">{[contract.category?.name, contract.subCategory?.name, contract.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="px-6 py-4">{new Date(contract.expiryDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</td>
                    <td className={`px-6 py-4 font-bold ${contract.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, contract.amount)}</td>
                    <td className="px-6 py-4"><button onClick={() => setSelectedContract(contract)} className="text-[#007AFF] hover:underline font-medium text-sm">{t('detail')}</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-100">
          {initialContracts.length === 0 ? (
            <div className="p-8 text-center text-gray-400 font-medium">{t('noContracts')}</div>
          ) : (
            initialContracts.map((contract) => (
              <div key={contract.id} className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="font-semibold text-gray-900 text-sm">{contract.title}</div>
                  <div className={`font-bold text-sm ${contract.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{formatCurrency(locale, contract.amount)}</div>
                </div>
                <div className="text-sm text-gray-600">{[contract.category?.name, contract.subCategory?.name, contract.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}</div>
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-50">
                  <span className="text-xs text-gray-400">{t('expiryDate')}: {new Date(contract.expiryDate).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}</span>
                  <button onClick={() => setSelectedContract(contract)} className="text-[#007AFF] font-medium text-xs bg-[#007AFF]/10 px-3 py-1 rounded">{t('detail')}</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedContract && (
        <ContractDetailModal contract={selectedContract} locale={locale} onClose={() => setSelectedContract(null)} />
      )}
    </div>
  )
}
