'use client'

import { useMemo, useState } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'
import { prepareAttachment, type ClientAttachment } from '@/lib/image'
import {
  createRecurringTemplate,
  deleteRecurringTemplate,
  convertRecurringInstanceToRecord,
  skipRecurringInstance,
  updateOpenInstance,
} from '@/app/actions/recurring'
import { RECURRING_INTERVAL_PRESETS } from '@/lib/recurring'

type Category = {
  id: string
  name: string
  type?: string
  children?: Category[]
}

type Pool = {
  id: string
  name: string
  isReviewRequired?: boolean
}

type Template = {
  id: string
  type: string
  title: string
  note: string | null
  amount: number
  intervalMonths: number
  dayOfMonth: number
  nextDueDate: string | Date
  reminderDays: number
  categoryId: string
  subCategoryId: string | null
  thirdCategoryId: string | null
  poolId: string | null
  category?: Category
  pool?: Pool | null
  instances: Array<{
    id: string
    dueDate: string | Date
    status: string
    amount: number | null
    note: string | null
    attachments?: Array<{ id: string; fileUrl: string; note: string | null }>
  }>
}

function toDateInput(value: string | Date) {
  const d = new Date(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function RecurringClient({
  locale,
  initialTemplates,
  categories,
  pools,
}: {
  locale: Locale
  initialTemplates: Template[]
  categories: Category[]
  pools: Pool[]
}) {
  const t = createTranslator(locale)
  const [templates, setTemplates] = useState(initialTemplates)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [intervalMonths, setIntervalMonths] = useState(1)
  const [customMonths, setCustomMonths] = useState('1')
  const [nextDueDate, setNextDueDate] = useState(toDateInput(new Date()))
  const [reminderDays, setReminderDays] = useState('15')
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [thirdCategoryId, setThirdCategoryId] = useState('')
  const [poolId, setPoolId] = useState('')
  const [busy, setBusy] = useState(false)

  const filteredCategories = useMemo(
    () => categories.filter((c) => !c.type || c.type === type),
    [categories, type]
  )
  const currentCategory = filteredCategories.find((c) => c.id === categoryId)
  const currentSub = currentCategory?.children?.find((c) => c.id === subCategoryId)

  const intervalLabel = (months: number) => {
    const preset = RECURRING_INTERVAL_PRESETS.find((p) => p.months === months)
    if (preset) return t(preset.key)
    return locale === 'en' ? `Every ${months} months` : `每 ${months} 個月`
  }

  const refresh = () => window.location.reload()

  const handleCreate = async () => {
    setBusy(true)
    const months =
      intervalMonths > 0 ? intervalMonths : Math.max(1, parseInt(customMonths || '1', 10) || 1)
    const res = await createRecurringTemplate({
      type,
      title,
      note,
      amount: Math.abs(parseFloat(amount) || 0),
      intervalMonths: months,
      nextDueDate,
      reminderDays: parseInt(reminderDays || '15', 10) || 15,
      categoryId,
      subCategoryId: subCategoryId || undefined,
      thirdCategoryId: thirdCategoryId || undefined,
      poolId,
    })
    setBusy(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return
    }
    refresh()
  }

  const handleConvert = async (instanceId: string, defaultAmount: number) => {
    const raw = window.prompt(t('amount'), String(Math.abs(defaultAmount)))
    if (raw === null) return
    const value = Math.abs(parseFloat(raw) || 0)
    setBusy(true)
    const res = await convertRecurringInstanceToRecord({
      instanceId,
      amount: value,
    })
    setBusy(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return
    }
    alert(t('recurringConverted'))
    refresh()
  }

  const handleSkip = async (instanceId: string) => {
    if (!window.confirm(t('skipThisPeriod') + '?')) return
    setBusy(true)
    const res = await skipRecurringInstance(instanceId)
    setBusy(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return
    }
    alert(t('recurringSkipped'))
    refresh()
  }

  const handleDelete = async (templateId: string) => {
    if (!window.confirm(t('confirmDeleteRecurring'))) return
    setBusy(true)
    const res = await deleteRecurringTemplate(templateId)
    setBusy(false)
    if (!res.success) {
      alert(res.error || t('submitFailed'))
      return
    }
    refresh()
  }

  const handleAttach = async (instanceId: string, file: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      const prepared = await prepareAttachment(file)
      const res = await updateOpenInstance({
        instanceId,
        amount: 0, // keep existing on server if 0? update always sets — fetch amount from templates
        attachment: { url: prepared.url, size: prepared.size },
      })
      // Better: pass current amount
      void res
    } catch (e: any) {
      alert(e.message || t('submitFailed'))
    }
    setBusy(false)
    refresh()
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#007AFF]/30'

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('createRecurring')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('EXPENSE')}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${type === 'EXPENSE' ? 'bg-[#FF3B30] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t('expense')}
            </button>
            <button
              type="button"
              onClick={() => setType('INCOME')}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${type === 'INCOME' ? 'bg-[#34C759] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t('income')}
            </button>
          </div>
          <input className={inputClass} placeholder={t('activityTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className={inputClass} type="number" step="0.01" placeholder={t('amount')} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className={inputClass} value={poolId} onChange={(e) => setPoolId(e.target.value)}>
            <option value="">{t('selectPool')}</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setSubCategoryId('')
              setThirdCategoryId('')
            }}
          >
            <option value="">{t('selectCategory')}</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={subCategoryId}
            onChange={(e) => {
              setSubCategoryId(e.target.value)
              setThirdCategoryId('')
            }}
            disabled={!currentCategory?.children?.length}
          >
            <option value="">{t('selectSubCategory')}</option>
            {currentCategory?.children?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('recurringInterval')}
            </label>
            <div className="flex flex-wrap gap-2">
              {RECURRING_INTERVAL_PRESETS.map((p) => (
                <button
                  key={p.months}
                  type="button"
                  onClick={() => setIntervalMonths(p.months)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${intervalMonths === p.months ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {t(p.key)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('nextDueDate')}
            </label>
            <input className={inputClass} type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('reminderDays')}
            </label>
            <input className={inputClass} type="number" min={0} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <textarea
              className={inputClass}
              rows={3}
              placeholder={t('noteLongPlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleCreate}
          className="mt-4 w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('createRecurring')}
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('recurringList')}</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noRecurring')}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => {
              const open = template.instances?.[0]
              return (
                <div key={template.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-gray-900">{template.title}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {intervalLabel(template.intervalMonths)} · {t('nextDueDate')}: {toDateInput(template.nextDueDate)}
                      </div>
                      <div className="mt-1 text-sm font-medium text-gray-800">
                        HKD$ {Math.abs(Number(open?.amount ?? template.amount)).toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#FF3B30]"
                      onClick={() => handleDelete(template.id)}
                      disabled={busy}
                    >
                      {t('deleteRecurring')}
                    </button>
                  </div>
                  {open && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleConvert(open.id, Number(open.amount ?? template.amount))}
                        className="rounded-xl bg-[#34C759] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {t('convertToPublicLedger')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSkip(open.id)}
                        className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
                      >
                        {t('skipThisPeriod')}
                      </button>
                      <label className="cursor-pointer rounded-xl bg-[#5856D6]/10 px-4 py-2 text-sm font-semibold text-[#5856D6]">
                        {t('attachment')}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setBusy(true)
                            try {
                              const prepared = await prepareAttachment(file)
                              const res = await updateOpenInstance({
                                instanceId: open.id,
                                amount: Math.abs(Number(open.amount ?? template.amount)),
                                note: open.note || undefined,
                                attachment: { url: prepared.url, size: prepared.size },
                              })
                              if (!res.success) alert(res.error || t('submitFailed'))
                              else refresh()
                            } catch (err: any) {
                              alert(err.message || t('submitFailed'))
                            }
                            setBusy(false)
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
