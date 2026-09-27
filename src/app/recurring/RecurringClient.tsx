'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { createTranslator, type Locale } from '@/lib/i18n'
import {
  compressImage,
  MAX_PDF_PAGES,
  prepareAttachments,
  type ClientAttachment,
} from '@/lib/image'
import OcrNoteButton, { type OcrResolvedPayload } from '@/components/OcrNoteButton'
import {
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  convertRecurringInstanceToRecord,
  skipRecurringInstance,
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
}

type Template = {
  id: string
  type: string
  title: string
  content: string | null
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
  category?: Category | null
  subCategory?: Category | null
  thirdCategory?: Category | null
  pool?: Pool | null
  instances: Array<{
    id: string
    dueDate: string | Date
    status: string
    amount: number | null
    content: string | null
    note: string | null
    attachments?: Array<{ id: string; fileUrl: string; size: number; note: string | null }>
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
  const [templates] = useState(initialTemplates)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [intervalMonths, setIntervalMonths] = useState(1)
  const [nextDueDate, setNextDueDate] = useState(toDateInput(new Date()))
  const [reminderDays, setReminderDays] = useState('15')
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [thirdCategoryId, setThirdCategoryId] = useState('')
  const [poolId, setPoolId] = useState('')
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [ocrAttachmentIndex, setOcrAttachmentIndex] = useState(0)
  const [attachmentNote, setAttachmentNote] = useState('')
  const [ocrMemo, setOcrMemo] = useState('')
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

  const resetForm = () => {
    setEditingId(null)
    setType('EXPENSE')
    setTitle('')
    setContent('')
    setNote('')
    setAmount('')
    setIntervalMonths(1)
    setNextDueDate(toDateInput(new Date()))
    setReminderDays('15')
    setCategoryId('')
    setSubCategoryId('')
    setThirdCategoryId('')
    setPoolId('')
    setAttachments([])
    setOcrAttachmentIndex(0)
    setAttachmentNote('')
    setOcrMemo('')
  }

  const startEdit = (template: Template) => {
    const open = template.instances?.[0]
    setEditingId(template.id)
    setType(template.type === 'INCOME' ? 'INCOME' : 'EXPENSE')
    setTitle(template.title)
    setContent(open?.content || template.content || '')
    setNote(open?.note || template.note || '')
    setAmount(String(Math.abs(Number(open?.amount ?? template.amount) || 0)))
    setIntervalMonths(template.intervalMonths || 1)
    setNextDueDate(toDateInput(template.nextDueDate))
    setReminderDays(String(template.reminderDays ?? 15))
    setCategoryId(template.categoryId || '')
    setSubCategoryId(template.subCategoryId || '')
    setThirdCategoryId(template.thirdCategoryId || '')
    setPoolId(template.poolId || '')
    const existingAttachments = (open?.attachments || []).map((item) => ({
      url: item.fileUrl,
      size: item.size,
      note: item.note || undefined,
    }))
    setAttachments(existingAttachments)
    setOcrAttachmentIndex(0)
    setAttachmentNote(existingAttachments[0]?.note || '')
    setOcrMemo('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const openId = new URLSearchParams(window.location.search).get('open')
    if (!openId) return
    const match = templates.find((template) => template.id === openId)
    if (match) startEdit(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from deep link
  }, [templates])

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await prepareAttachments(file)
      if (result.truncated) {
        alert(
          t('pdfPagesTruncated')
            .replace('{{total}}', String(result.totalPages))
            .replace('{{max}}', String(MAX_PDF_PAGES))
        )
      }
      setAttachments(result.attachments)
      setOcrAttachmentIndex(0)
      setAttachmentNote(result.attachments[0]?.note || '')
    } catch {
      try {
        const fallback = await compressImage(file, 200)
        setAttachments([fallback])
        setOcrAttachmentIndex(0)
        setAttachmentNote(fallback.note || '')
      } catch {
        alert(t('imageCompressionFailed'))
      }
    }
  }

  const removeAttachmentAt = (index: number) => {
    const next = attachments.filter((_, i) => i !== index)
    let nextOcr = ocrAttachmentIndex
    if (index < ocrAttachmentIndex) nextOcr = ocrAttachmentIndex - 1
    else if (index === ocrAttachmentIndex) nextOcr = 0
    nextOcr = Math.min(nextOcr, Math.max(0, next.length - 1))
    setAttachments(next)
    setOcrAttachmentIndex(nextOcr)
    setAttachmentNote(next[nextOcr]?.note || '')
  }

  const appendRecognizedText = (payload: OcrResolvedPayload | string) => {
    if (typeof payload === 'string') {
      setContent((current) => (current.trim() ? `${current.trim()}\n${payload}` : payload))
      setOcrMemo((current) => {
        const line = `${locale === 'en' ? 'OCR' : '圖像辨識'}: ${payload}`
        return current.trim() ? `${current.trim()}\n${line}` : line
      })
      return
    }
    if (payload.amount != null) {
      setAmount(String(Math.abs(payload.amount)))
    }
    if (payload.contentText) {
      setContent((current) =>
        current.trim() ? `${current.trim()}\n${payload.contentText}` : payload.contentText
      )
    }
    if (payload.noteText) {
      setNote((current) => (current.trim() ? `${current.trim()}\n${payload.noteText}` : payload.noteText))
    }
    if (payload.contentText || payload.noteText) {
      setOcrMemo((current) => {
        const parts = [
          payload.contentText && `內容: ${payload.contentText}`,
          payload.noteText && `備註: ${payload.noteText}`,
        ].filter(Boolean)
        const line = `${locale === 'en' ? 'OCR' : '圖像辨識'}:\n${parts.join('\n')}`
        return current.trim() ? `${current.trim()}\n${line}` : line
      })
    }
    if (payload.attachmentMemo) {
      const ocrIndex =
        payload.pageIndexes?.find((index) => attachments[index]) ??
        (attachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0)
      setAttachmentNote(payload.attachmentMemo)
      setAttachments((prev) =>
        prev.map((item, index) => (index === ocrIndex ? { ...item, note: payload.attachmentMemo } : item))
      )
    }
  }

  const handleSubmit = async () => {
    if (!title.trim() || !categoryId || !poolId || !amount) {
      alert(t('fillRequiredFields'))
      return
    }
    setBusy(true)
    const attachmentPayload =
      attachments.length > 0
        ? attachments.map((a) => ({
            url: a.url,
            size: a.size,
            note: a.note || attachmentNote || undefined,
          }))
        : []

    const payload = {
      type,
      title,
      content,
      note,
      amount: Math.abs(parseFloat(amount) || 0),
      intervalMonths: Math.max(1, intervalMonths),
      nextDueDate,
      reminderDays: parseInt(reminderDays || '15', 10) || 15,
      categoryId,
      subCategoryId: subCategoryId || undefined,
      thirdCategoryId: thirdCategoryId || undefined,
      poolId,
      attachments: attachmentPayload,
    }

    const res = editingId
      ? await updateRecurringTemplate({ templateId: editingId, ...payload })
      : await createRecurringTemplate(payload)

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
    setBusy(true)
    const res = await convertRecurringInstanceToRecord({
      instanceId,
      amount: Math.abs(parseFloat(raw) || 0),
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
    if (!window.confirm(`${t('skipThisPeriod')}?`)) return
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
    if (editingId === templateId) resetForm()
    refresh()
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#007AFF]/30'

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? t('editRecurring') : t('createRecurring')}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              {t('cancelEdit')}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setType('EXPENSE')
                setCategoryId('')
                setSubCategoryId('')
                setThirdCategoryId('')
              }}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                type === 'EXPENSE' ? 'bg-[#FF3B30] text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t('expense')}
            </button>
            <button
              type="button"
              onClick={() => {
                setType('INCOME')
                setCategoryId('')
                setSubCategoryId('')
                setThirdCategoryId('')
              }}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold ${
                type === 'INCOME' ? 'bg-[#34C759] text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t('income')}
            </button>
          </div>

          <input
            className={inputClass}
            placeholder={t('activityTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={inputClass}
            type="number"
            step="0.01"
            placeholder={t('amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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

          <select
            className={inputClass}
            value={thirdCategoryId}
            onChange={(e) => setThirdCategoryId(e.target.value)}
            disabled={!currentSub?.children?.length}
          >
            <option value="">
              {!currentSub
                ? t('selectSubCategory')
                : currentSub.children && currentSub.children.length > 0
                  ? t('selectGrandCategory')
                  : t('noGrandCategory')}
            </option>
            {currentSub?.children?.map((c) => (
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
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    intervalMonths === p.months ? 'bg-[#007AFF] text-white' : 'bg-gray-100 text-gray-600'
                  }`}
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
            <input
              className={inputClass}
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('reminderDays')}
            </label>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('contentOptional')}
            </label>
            <input
              className={inputClass}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('contentPlaceholder')}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('noteOptional')}
            </label>
            <textarea
              className={inputClass}
              rows={4}
              placeholder={t('noteLongPlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t('attachment')}{' '}
                <span className="normal-case font-normal">({t('attachmentAcceptHint')})</span>
              </label>
              <OcrNoteButton
                locale={locale}
                attachments={attachments}
                context="recurring"
                onResolved={appendRecognizedText}
                disabled={busy}
              />
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleImageChange}
              className="w-full cursor-pointer text-sm text-gray-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#007AFF]/10 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-[#007AFF] hover:file:bg-[#007AFF]/20"
            />
            <input
              type="text"
              value={attachmentNote}
              onChange={(e) => {
                const value = e.target.value
                setAttachmentNote(value)
                setAttachments((prev) =>
                  prev.map((item, index) =>
                    index === (attachments[ocrAttachmentIndex] ? ocrAttachmentIndex : 0)
                      ? { ...item, note: value }
                      : item
                  )
                )
              }}
              className={`${inputClass} mt-3`}
              placeholder={t('attachmentTypePlaceholder')}
            />
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.length > 1 && (
                  <div className="text-xs font-medium text-[#007AFF]">
                    {t('pdfPagesReady').replace('{{count}}', String(attachments.length))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {attachments.map((item, index) => (
                    <div
                      key={`${item.size}-${index}-${item.pageIndex || 0}`}
                      className={`relative rounded-lg border p-1 ${
                        index === ocrAttachmentIndex
                          ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20'
                          : 'border-gray-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOcrAttachmentIndex(index)
                          setAttachmentNote(item.note || '')
                        }}
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="" className="h-16 w-16 rounded object-cover" />
                        {(item.pageIndex || attachments.length > 1) && (
                          <div className="mt-0.5 text-center text-[10px] text-gray-500">
                            {item.pageIndex ?? index + 1}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAttachmentAt(index)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] leading-none text-white"
                        aria-label={t('delete')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {attachments.length === 1 && (
                  <div className="flex w-fit items-center space-x-2 rounded-lg bg-[#34C759]/10 p-2 text-xs font-medium text-[#34C759]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>
                      {t('imageCompressed')}: {(attachments[0].size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
              </div>
            )}
            {ocrMemo ? (
              <p className="mt-2 whitespace-pre-wrap text-xs text-gray-400">{ocrMemo}</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleSubmit}
          className="mt-4 w-full rounded-xl bg-[#007AFF] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {editingId ? t('saveRecurring') : t('createRecurring')}
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
              const displayContent = open?.content || template.content
              const displayNote = open?.note || template.note
              const attachmentCount = open?.attachments?.length || 0
              const categoryPath = [
                template.category?.name,
                template.subCategory?.name,
                template.thirdCategory?.name,
              ]
                .filter(Boolean)
                .join(' / ')

              return (
                <div
                  key={template.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    editingId === template.id ? 'border-[#007AFF]' : 'border-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-gray-900">{template.title}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {intervalLabel(template.intervalMonths)} · {t('nextDueDate')}:{' '}
                        {toDateInput(template.nextDueDate)}
                      </div>
                      {categoryPath ? (
                        <div className="mt-1 text-xs text-gray-500">{categoryPath}</div>
                      ) : null}
                      <div className="mt-1 text-sm font-medium text-gray-800">
                        HKD$ {Math.abs(Number(open?.amount ?? template.amount)).toFixed(2)}
                      </div>
                      {displayContent ? (
                        <div className="mt-1 truncate text-xs text-gray-600">
                          {t('content')}: {displayContent}
                        </div>
                      ) : null}
                      {displayNote ? (
                        <div className="mt-0.5 truncate text-xs text-gray-500">{displayNote}</div>
                      ) : null}
                      {attachmentCount > 0 ? (
                        <div className="mt-1 text-xs font-medium text-[#5856D6]">
                          {t('attachment')}: {attachmentCount}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#007AFF]"
                        onClick={() => startEdit(template)}
                        disabled={busy}
                      >
                        {t('editRecurring')}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#FF3B30]"
                        onClick={() => handleDelete(template.id)}
                        disabled={busy}
                      >
                        {t('deleteRecurring')}
                      </button>
                    </div>
                  </div>

                  {open ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleConvert(open.id, Number(open.amount ?? template.amount))
                        }
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
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
