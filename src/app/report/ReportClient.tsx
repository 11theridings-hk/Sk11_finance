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

  // 修改记录相关状态
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
    
    // 时间范围与总笔数
    const timeRangeStr = startDate && endDate 
      ? `${startDate} 至 ${endDate}` 
      : (startDate ? `${startDate} -` : (endDate ? `- ${endDate}` : t('allTime')))
      
    const categoryName = categoryId ? categories.find(c => c.id === categoryId)?.name || t('unknown') : t('all')
    const roleName = userId ? users.find(u => u.id === userId)?.roleName || t('unknown') : t('all')

    doc.text(`${t('statisticsPeriod')}: ${timeRangeStr}`, 15, 45)
    doc.text(`${t('totalTransactions')}: ${totalCount}`, 145, 45)
    
    doc.setTextColor(150, 150, 150)
    doc.text(`${t('filterSummary')} -> ${t('category')}: [${categoryName}] | ${t('role')}: [${roleName}]`, 15, 52)
    
    doc.setDrawColor(220, 220, 220)
    doc.setFillColor(250, 250, 252)
    doc.roundedRect(15, 60, 180, 45, 3, 3, 'FD')

    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(50, 50, 50)
    doc.text('HKD$', 105, 70, { align: 'center' })

    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(52, 199, 89)
    doc.text(`${t('totalIncome')}: ${totalIncome.toFixed(2)}`, 25, 85)
    doc.setTextColor(255, 59, 48)
    doc.text(`${t('totalExpense')}: ${totalExpense.toFixed(2)}`, 85, 85)
    doc.setTextColor(0, 0, 0)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text(`${t('balance')}: ${balance >= 0 ? '+' : ''}${balance.toFixed(2)}`, 145, 85)
    
    doc.line(15, 115, 195, 115)
    doc.setFontSize(14)
    doc.setTextColor(50, 50, 50)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text(t('categoryExpenseStats'), 15, 130)
    
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
    
    let yPos = 140
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
      
      const barWidth = Math.max(80 * percentage, 1)
      doc.roundedRect(100, yPos - 4, barWidth, 6, 2, 2, 'F')

      yPos += 12
    })

    doc.addPage()
    doc.setFontSize(16)
    doc.setTextColor(0, 0, 0)
    doc.text(t('detailListReport'), 14, 15)

    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.text(`${t('totalIncome')}: ${totalIncome.toFixed(2)}`, 14, 25)
    doc.text(`${t('totalExpense')}: ${totalExpense.toFixed(2)}`, 80, 25)
    doc.text(`${t('balance')}: ${balance.toFixed(2)}`, 150, 25)

    const tableData = records.map(r => [
      new Date(r.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK'),
      r.type === 'INCOME' ? t('income') : t('expense'),
      r.category?.name || '-',
      r.user?.roleName || '-',
      formatCurrency(locale, r.amount),
      r.note || '-',
      r.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')
    ])

    autoTable(doc, {
      startY: 35,
      head: [[t('date'), t('type'), t('category'), t('role'), t('amount'), t('note'), t('status')]],
      body: tableData,
      styles: { font: fontBase64 ? 'NotoSansSC' : 'helvetica' },
      headStyles: { fillColor: [66, 139, 202], font: fontBase64 ? 'NotoSansSC' : 'helvetica' }
    })

    doc.save(locale === 'en' ? 'financial-report.pdf' : '財務報表.pdf')
  }

  const exportAccountingPdfs = async () => {
    if (records.length === 0) {
      alert(t('noDataToExport'))
      return
    }

    setExporting(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder(locale === 'en' ? 'accounting-details' : '會計明細')

      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        const doc = createPdfDoc()
        
        doc.setFontSize(16)
        if (fontBase64) doc.setFont('NotoSansSC', 'bold')
        doc.text(locale === 'en' ? 'Accounting Detail' : '會計明細單', 105, 20, { align: 'center' })
        
        doc.setFontSize(12)
        if (fontBase64) doc.setFont('NotoSansSC', 'normal')
        doc.text(`${t('date')}: ${new Date(r.date).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK')}`, 20, 40)
        doc.text(`${t('type')}: ${r.type === 'INCOME' ? t('income') : t('expense')}`, 20, 50)
        doc.text(`${t('category')}: ${[r.category?.name, r.subCategory?.name, r.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}`, 20, 60)
        doc.text(`${t('amount')}: ${formatCurrency(locale, r.amount)}`, 20, 70)
        doc.text(`${t('role')}: ${r.user?.roleName || '-'}`, 20, 80)
        doc.text(`${t('pool')}: ${r.pool?.name || '-'}`, 20, 90)
        doc.text(`${t('status')}: ${r.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}`, 20, 100)
        doc.text(`${t('note')}: ${r.note || '-'}`, 20, 110)

        const firstAttachment = r.attachments?.[0]?.fileUrl || r.attachmentUrl
        if (firstAttachment && firstAttachment.startsWith('data:image')) {
          doc.text(`${t('attachment')}:`, 20, 120)
          try {
            const match = firstAttachment.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)
            const format = match ? (match[1].toUpperCase() === 'JPG' ? 'JPEG' : match[1].toUpperCase()) : 'JPEG'
            doc.addImage(firstAttachment, format, 20, 125, 150, 150, undefined, 'FAST')
          } catch (e) {
            console.error('添加图片附件失败:', e)
            doc.text('(image failed to load)', 40, 120)
          }
        }

        const pdfBlob = doc.output('blob')
        const safeDate = new Date(r.date).toLocaleDateString().replace(/\//g, '-')
        const fileName = `${safeDate}_${r.category?.name || t('uncategorized')}_${i + 1}.pdf`
        
        folder?.file(fileName, pdfBlob)
      }

      const zipContent = await zip.generateAsync({ type: 'blob' })
      
      const url = window.URL.createObjectURL(zipContent)
      const link = document.createElement('a')
      link.href = url
      link.download = locale === 'en' ? 'accounting-details.zip' : '會計明細.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

    } catch (err) {
      console.error(err)
      alert(t('zipExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const inputClass = "w-full border-transparent bg-[#F2F2F7] rounded-xl p-3 text-sm focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none transition-all text-gray-900"

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('startDate')}</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('endDate')}</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('mainCategory')}</label>
          <select 
            value={categoryId} 
            onChange={e => {
              setCategoryId(e.target.value)
              setSubCategoryId('')
              setThirdCategoryId('')
            }}
            className={inputClass}
          >
            <option value="">{t('all')}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('subCategory')}</label>
          <select value={subCategoryId} onChange={e => { setSubCategoryId(e.target.value); setThirdCategoryId('') }} className={inputClass} disabled={!currentCategory?.children?.length}>
            <option value="">{t('all')}</option>
            {currentCategory?.children?.map((sub: any) => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('grandCategory')}</label>
          <select value={thirdCategoryId} onChange={e => setThirdCategoryId(e.target.value)} className={inputClass} disabled={!currentSubCategory?.children?.length}>
            <option value="">{t('all')}</option>
            {currentSubCategory?.children?.map((third: any) => (
              <option key={third.id} value={third.id}>{third.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('pool')}</label>
          <select value={poolId} onChange={e => setPoolId(e.target.value)} className={inputClass}>
            <option value="">{t('all')}</option>
            {pools.map((pool: any) => (
              <option key={pool.id} value={pool.id}>{pool.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('role')}</label>
          <select 
            value={userId} 
            onChange={e => setUserId(e.target.value)}
            className={inputClass}
          >
            <option value="">{t('all')}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.roleName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">{t('status')}</label>
          <select value={status} onChange={e => setStatus(e.target.value as 'APPROVED' | 'PENDING' | 'ALL')} className={inputClass}>
            <option value="APPROVED">{t('approvedStored')}</option>
            <option value="PENDING">{t('pendingApproval')}</option>
            <option value="ALL">{t('all')}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <button 
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] transition-colors shadow-sm disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? t('queryLoading') : t('queryResults')}
        </button>
        <button 
          onClick={exportListPdf}
          disabled={loading || exporting || records.length === 0}
          className="px-6 py-2.5 bg-[#34C759] text-white rounded-xl text-sm font-semibold hover:bg-[#2EB850] transition-colors shadow-sm disabled:opacity-50 disabled:shadow-none"
        >
          {t('exportListPdf')}
        </button>
        <button 
          onClick={exportAccountingPdfs}
          disabled={loading || exporting || records.length === 0}
          className="px-6 py-2.5 bg-[#5856D6] text-white rounded-xl text-sm font-semibold hover:bg-[#4B49B8] transition-colors shadow-sm disabled:opacity-50 disabled:shadow-none"
        >
          {exporting ? t('exporting') : t('exportAccountingZip')}
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">{t('date')}</th>
                <th className="px-6 py-3 font-medium">{t('type')}</th>
                <th className="px-6 py-3 font-medium">{t('category')}</th>
                <th className="px-6 py-3 font-medium">{t('role')}</th>
                <th className="px-6 py-3 font-medium">{t('pool')}</th>
                <th className="px-6 py-3 font-medium">{t('amount')}</th>
                <th className="px-6 py-3 font-medium">{t('note')}</th>
                <th className="px-6 py-3 font-medium">{t('status')}</th>
                <th className="px-6 py-3 font-medium">{t('modify')}</th>
                <th className="px-6 py-3 font-medium">{t('detail')}</th>
                <th className="px-6 py-3 font-medium">{t('delete')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-gray-400 font-medium">{t('noDataTrySearch')}</td>
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
                      {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-6 py-4">{record.user?.roleName || '-'}</td>
                    <td className="px-6 py-4">{record.pool?.name || '-'}</td>
                    <td className={`px-6 py-4 font-bold ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                      {formatCurrency(locale, record.amount)}
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-gray-500" title={record.note || ''}>{record.note || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${record.status === 'PENDING' ? 'bg-[#FF9500]/10 text-[#FF9500]' : 'bg-[#34C759]/10 text-[#34C759]'}`}>
                        {record.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {!record.isReviewing && (
                        <button 
                          onClick={() => handleEditClick(record)}
                          className="text-[#007AFF] hover:underline font-medium text-sm"
                        >
                          {t('modify')}
                        </button>
                      )}
                      {record.isReviewing && (
                        <span className="text-xs text-[#FF9500] font-medium">{t('modifyPending')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => setSelectedRecord(record)} className="text-[#007AFF] hover:underline font-medium text-sm">{t('detail')}</button>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => handleDeleteRecord(record.id)} className="text-[#FF3B30] hover:underline font-medium text-sm">{t('delete')}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-100">
          {records.length === 0 ? (
            <div className="p-8 text-center text-gray-400 font-medium">{t('noDataTrySearch')}</div>
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
                <div className="text-sm text-gray-600 flex justify-between">
                  <span>
                    {[record.category?.name, record.subCategory?.name, record.thirdCategory?.name].filter(Boolean).join(' / ') || '-'}
                  </span>
                  <span className="text-xs text-gray-500">{record.user?.roleName || '-'}</span>
                </div>
                {record.note && (
                  <div className="text-xs text-gray-500 truncate">{record.note}</div>
                )}
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-50">
                  <span className="text-xs text-gray-400">{t('pool')}: {record.pool?.name || '-'} | {record.status === 'PENDING' ? t('pendingApproval') : t('approvedStored')}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedRecord(record)} className="text-[#007AFF] font-medium text-xs bg-[#007AFF]/10 px-3 py-1 rounded">{t('detail')}</button>
                    {!record.isReviewing && (
                      <button onClick={() => handleEditClick(record)} className="text-[#007AFF] font-medium text-xs bg-[#007AFF]/10 px-3 py-1 rounded">{t('modify')}</button>
                    )}
                    <button onClick={() => handleDeleteRecord(record.id)} className="text-[#FF3B30] font-medium text-xs bg-[#FF3B30]/10 px-3 py-1 rounded">{t('delete')}</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {editingRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">{t('editRecordRequest')}</h3>
              <button onClick={() => setEditingRecord(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="p-4 md:p-6 space-y-4 md:space-y-5 overflow-y-auto">
              <div className="flex space-x-3 mb-2 md:mb-4">
                <button
                  className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${editType === 'EXPENSE' ? 'bg-[#FF3B30] text-white' : 'bg-[#F2F2F7] text-gray-600'}`}
                  onClick={() => { setEditType('EXPENSE'); setEditCategoryId(''); setEditSubCategoryId(''); }}
                >
                  {t('expense')}
                </button>
                <button
                  className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${editType === 'INCOME' ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-gray-600'}`}
                  onClick={() => { setEditType('INCOME'); setEditCategoryId(''); setEditSubCategoryId(''); }}
                >
                  {t('income')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('date')}</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputClass} />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('mainCategory')}</label>
                  <select value={editCategoryId} onChange={e => { setEditCategoryId(e.target.value); setEditSubCategoryId(''); setEditThirdCategoryId(''); }} className={inputClass}>
                    <option value="">{t('selectCategory')}</option>
                    {categories.filter(c => c.type === editType && !c.parentId).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('amount')} (HKD$)</label>
                  <input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('subCategory')}</label>
                  <select value={editSubCategoryId} onChange={e => { setEditSubCategoryId(e.target.value); setEditThirdCategoryId('') }} className={inputClass}>
                    <option value="">{t('noSubCategory')}</option>
                    {editCurrentCategory?.children?.map((sub: any) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('grandCategory')}</label>
                  <select value={editThirdCategoryId} onChange={e => setEditThirdCategoryId(e.target.value)} className={inputClass}>
                    <option value="">{t('noGrandCategory')}</option>
                    {editCurrentSubCategory?.children?.map((third: any) => (
                      <option key={third.id} value={third.id}>{third.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">{t('note')}</label>
                  <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} className={inputClass} />
                </div>

                <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-200 p-4 bg-[#F2F2F7]/50">
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase">{t('appendAttachment')}</label>
                  <input type="file" accept="image/*" onChange={handleEditAttachmentChange} className="w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF]" />
                  <input type="text" value={editAttachmentNote} onChange={e => setEditAttachmentNote(e.target.value)} placeholder={t('attachmentNotePlaceholder')} className={`${inputClass} mt-3`} />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold shadow-sm transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={submitEdit}
                  disabled={isSubmittingEdit}
                  className="flex-1 py-3 bg-[#007AFF] hover:bg-[#0066CC] text-white rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {t('saveAndSubmitReview')}
                </button>
              </div>
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
