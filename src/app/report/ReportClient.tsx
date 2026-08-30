'use client'

import React, { useState, useEffect } from 'react'
import { getReportRecords, ReportFilter } from '../actions/report'
import { requestModifyRecord } from '../actions/modify'
import { deleteRecord } from '../actions/record'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import { createTranslator, formatCurrency, type Locale } from '@/lib/i18n'
import { compressImage, type ClientAttachment } from '@/lib/image'
import RecordDetailModal from '../RecordDetailModal'

type Props = {
  categories: any[]
  users: any[]
  pools: any[]
  locale: Locale
}

export default function ReportClient({ categories, users, pools, locale }: Props) {
  const t = createTranslator(locale)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [noteKeyword, setNoteKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [thirdCategoryId, setThirdCategoryId] = useState('')
  const [poolId, setPoolId] = useState('')
  const [status, setStatus] = useState<'APPROVED' | 'PENDING' | 'ALL'>('APPROVED')
  const [userId, setUserId] = useState('')

  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fontBase64, setFontBase64] = useState<string | null>(null)

  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [selectedRecord, setSelectedRecord] = useState<any>(null)
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editSubCategoryId, setEditSubCategoryId] = useState('')
  const [editThirdCategoryId, setEditThirdCategoryId] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editAttachment, setEditAttachment] = useState<ClientAttachment | null>(null)
  const [editAttachmentNote, setEditAttachmentNote] = useState('')
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)

  const currentCategory = categories.find((item) => item.id === categoryId)
  const currentSubCategory = currentCategory?.children?.find((item: any) => item.id === subCategoryId)
  const editCurrentCategory = categories.find((item) => item.id === editCategoryId)
  const editCurrentSubCategory = editCurrentCategory?.children?.find((item: any) => item.id === editSubCategoryId)

  const handleEditClick = (record: any) => {
    setEditingRecord(record)
    setEditDate(new Date(record.date).toISOString().split('T')[0])
    setEditType(record.type as 'INCOME' | 'EXPENSE')
    setEditCategoryId(record.categoryId)
    setEditSubCategoryId(record.subCategoryId || '')
    setEditThirdCategoryId(record.thirdCategoryId || '')
    setEditAmount(Math.abs(record.amount).toString())
    setEditNote(record.note || '')
    setEditAttachment(null)
    setEditAttachmentNote('')
  }

  const submitEdit = async () => {
    if (!editCategoryId || !editAmount) return alert(t('selectedCategoryMissing'))
    setIsSubmittingEdit(true)

    let finalAmount = parseFloat(editAmount)
    if (editType === 'EXPENSE') finalAmount = -Math.abs(finalAmount)
    else finalAmount = Math.abs(finalAmount)

    const res = await requestModifyRecord(editingRecord.id, {
      type: editType,
      date: editDate,
      categoryId: editCategoryId,
      subCategoryId: editSubCategoryId,
      thirdCategoryId: editThirdCategoryId,
      amount: finalAmount,
      note: editNote,
      poolId: editingRecord.poolId,
      attachment: editAttachment ? { ...editAttachment, note: editAttachmentNote || undefined } : undefined
    })

    if (res.success) {
      alert(t('modifyRequestSubmitted'))
      setEditingRecord(null)
      handleSearch()
    } else {
      alert(`${t('submitFailed')}: ${res.error}`)
    }
    setIsSubmittingEdit(false)
  }

  const handleEditAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const compressed = await compressImage(file, 200)
      setEditAttachment(compressed)
    } catch {
      alert(t('imageCompressionFailed'))
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm(t('deleteRecordConfirm'))) return
    setLoading(true)
    const res = await deleteRecord(recordId)
    if (res.success) {
      handleSearch()
      return
    }
    alert(res.error)
    setLoading(false)
  }

  useEffect(() => {
    const loadFont = async () => {
      try {
        const fontUrl = '/fonts/NotoSansSC-Regular.ttf'
        const res = await fetch(fontUrl)
        if (!res.ok) {
          throw new Error('字体文件获取失败: ' + res.statusText)
        }
        const buffer = await res.arrayBuffer()

        let binary = ''
        const bytes = new Uint8Array(buffer)
        const len = bytes.byteLength
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = window.btoa(binary)
        setFontBase64(base64)
      } catch (err) {
        console.error('加载中文字体失败:', err)
      }
    }
    loadFont()
  }, [])

  const handleSearch = async () => {
    setLoading(true)
    const filter: ReportFilter = {}
    if (startDate) filter.startDate = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      filter.endDate = end
    }
    if (categoryId) filter.categoryId = categoryId
    if (subCategoryId) filter.subCategoryId = subCategoryId
    if (thirdCategoryId) filter.thirdCategoryId = thirdCategoryId
    if (poolId) filter.poolId = poolId
    if (userId) filter.userId = userId
    if (noteKeyword.trim()) filter.noteKeyword = noteKeyword.trim()
    filter.status = status

    try {
      const data = await getReportRecords(filter)
      setRecords(data)
    } catch (err) {
      console.error(err)
      alert(t('queryFailed'))
    } finally {
      setLoading(false)
    }
  }

  const createPdfDoc = () => {
    const doc = new jsPDF()
    if (fontBase64) {
      doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64)
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'bold')
      doc.setFont('NotoSansSC')
    }
    return doc
  }

  const exportListPdf = () => {
    if (records.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    const totalCount = records.length
    let totalIncome = 0
    let totalExpense = 0

    records.forEach(r => {
      const val = Math.abs(r.amount)
      if (r.type === 'INCOME') totalIncome += val
      else if (r.type === 'EXPENSE') totalExpense += val
    })

    const balance = totalIncome - totalExpense

    const doc = createPdfDoc()

    doc.setFillColor(242, 242, 247)
    doc.rect(0, 0, 210, 40, 'F')

    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(0, 122, 255)
    doc.text(t('financeSummaryReport'), 105, 25, { align: 'center' })

    doc.setDrawColor(200, 200, 200)
    doc.line(15, 45, 195, 45)

    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')

    const timeRangeStr = startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : (startDate ? `${startDate} -` : (endDate ? `- ${endDate}` : t('allTime')))

    const categoryName = categoryId ? categories.find(c => c.id === categoryId)?.name || t('unknown') : t('all')
    const roleName = userId ? users.find(u => u.id === userId)?.roleName || t('unknown') : t('all')
    const noteKeywordLabel = noteKeyword.trim() || t('all')

    doc.text(`${t('statisticsPeriod')}: ${timeRangeStr}`, 15, 45)
    doc.text(`${t('totalTransactions')}: ${totalCount}`, 145, 45)

    doc.setTextColor(150, 150, 150)
    doc.text(`${t('filterSummary')} -> ${t('category')}: [${categoryName}] | ${t('role')}: [${roleName}]`, 15, 52)
    doc.text(`${t('reportNoteSearch')}: [${noteKeywordLabel}]`, 15, 58)

    doc.setDrawColor(220, 220, 220)
    doc.setFillColor(250, 250, 252)
    doc.roundedRect(15, 66, 180, 45, 3, 3, 'FD')

    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(50, 50, 50)
    doc.text('HKD$', 105, 76, { align: 'center' })

    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(52, 199, 89)
    doc.text(`${t('totalIncome')}: ${totalIncome.toFixed(2)}`, 25, 91)
    doc.setTextColor(255, 59, 48)
    doc.text(`${t('totalExpense')}: ${totalExpense.toFixed(2)}`, 85, 91)
    doc.setTextColor(0, 0, 0)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text(`${t('balance')}: ${balance >= 0 ? '+' : ''}${balance.toFixed(2)}`, 145, 91)

    doc.line(15, 121, 195, 121)
    doc.setFontSize(14)
    doc.setTextColor(50, 50, 50)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text(t('categoryExpenseStats'), 15, 136)

    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(11)

    const categoryStats: Record<string, number> = {}
    let totalExpenseMerged = 0
    records.filter(r => r.type === 'EXPENSE').forEach(r => {
      const catName = r.category?.name || t('uncategorized')
      const val = Math.abs(r.amount)
      categoryStats[catName] = (categoryStats[catName] || 0) + val
      totalExpenseMerged += val
    })

    let yPos = 146
    Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([name, amount], index) => {
      const percentage = totalExpenseMerged > 0 ? (amount / totalExpenseMerged) : 0
      const percentStr = (percentage * 100).toFixed(1)

      doc.setTextColor(80, 80, 80)
      doc.text(`${name}: ${amount.toFixed(2)} (${percentStr}%)`, 15, yPos)

      doc.setFillColor(230, 230, 230)
      doc.roundedRect(100, yPos - 4, 80, 6, 2, 2, 'F')

      const colors = [
        [0, 122, 255],
        [52, 199, 89],
        [255, 149, 0],
        [255, 59, 48],
        [88, 86, 214]
      ]
      const color = index < colors.length ? colors[index] : [142, 142, 147]
      doc.setFillColor(color[0], color[1], color[2])

      const barWidth = Math.max(