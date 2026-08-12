'use client'

import React, { useState, useEffect } from 'react'
import { getReportRecords, ReportFilter } from '../actions/report'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'

type Props = {
  categories: any[]
  users: any[]
}

export default function ReportClient({ categories, users }: Props) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [currency, setCurrency] = useState<'ALL' | 'HKD' | 'RMB'>('ALL')
  const [userId, setUserId] = useState('')

  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [fontBase64, setFontBase64] = useState<string | null>(null)

  // 尝试在客户端加载中文字体，以解决 jsPDF 中文乱码问题
  useEffect(() => {
    const loadFont = async () => {
      try {
        // 使用本地放入的 NotoSansSC-Regular.ttf 字体
        const fontUrl = '/fonts/NotoSansSC-Regular.ttf'
        const res = await fetch(fontUrl)
        if (!res.ok) {
          throw new Error('字体文件获取失败: ' + res.statusText)
        }
        const buffer = await res.arrayBuffer()
        
        // ArrayBuffer to Base64
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
    const filter: ReportFilter = {
      currency: currency,
    }
    if (startDate) filter.startDate = new Date(startDate)
    if (endDate) {
      // 包含结束日期当天的最后一秒
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      filter.endDate = end
    }
    if (categoryId) filter.categoryId = categoryId
    if (userId) filter.userId = userId

    try {
      const data = await getReportRecords(filter)
      setRecords(data)
    } catch (err) {
      console.error(err)
      alert('查询失败')
    } finally {
      setLoading(false)
    }
  }

  // 初始化 jsPDF 实例并注入中文字体
  const createPdfDoc = () => {
    const doc = new jsPDF()
    if (fontBase64) {
      doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64)
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
      doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'bold') // Fallback to normal for bold if no bold font is provided
      doc.setFont('NotoSansSC')
    }
    return doc
  }

  // 导出明细列表-PDF
  const exportListPdf = () => {
    if (records.length === 0) {
      alert('暂无数据可导出')
      return
    }

    let totalCount = records.length
    let totalIncomeHKD = 0
    let totalExpenseHKD = 0
    let totalIncomeRMB = 0
    let totalExpenseRMB = 0

    records.forEach(r => {
      const val = Math.abs(r.amount)
      if (r.currency === 'HKD') {
        if (r.type === 'INCOME') totalIncomeHKD += val
        else totalExpenseHKD += val
      } else if (r.currency === 'RMB') {
        if (r.type === 'INCOME') totalIncomeRMB += val
        else totalExpenseRMB += val
      }
    })

    const balanceHKD = totalIncomeHKD - totalExpenseHKD
    const balanceRMB = totalIncomeRMB - totalExpenseRMB

    const doc = createPdfDoc()
    
    // 画个底色块当表头背景
    doc.setFillColor(242, 242, 247) // iOS 浅灰
    doc.rect(0, 0, 210, 40, 'F')

    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(0, 122, 255) // iOS 蓝色标题
    doc.text('财务收支总汇报表', 105, 25, { align: 'center' })
    
    // 画一条分割线
    doc.setDrawColor(200, 200, 200)
    doc.line(15, 45, 195, 45)

    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    
    // 时间范围与总笔数
    const timeRangeStr = startDate && endDate 
      ? `${startDate} 至 ${endDate}` 
      : (startDate ? `${startDate} 起` : (endDate ? `至 ${endDate}` : '所有时间'))
      
    // 获取筛选条件名称
    const categoryName = categoryId ? categories.find(c => c.id === categoryId)?.name || '未知' : '全部'
    const roleName = userId ? users.find(u => u.id === userId)?.roleName || '未知' : '全部'
    const currencyName = currency === 'ALL' ? '全部' : currency

    doc.text(`统计周期: ${timeRangeStr}`, 15, 45)
    doc.text(`总交易笔数: ${totalCount} 笔`, 150, 45)
    
    doc.setTextColor(150, 150, 150)
    doc.text(`筛选条件 -> 分类: [${categoryName}]   |   币种: [${currencyName}]   |   角色: [${roleName}]`, 15, 52)
    
    // ----------------------------------------
    // HKD & RMB 资产统计卡片
    // ----------------------------------------
    doc.setDrawColor(220, 220, 220)
    doc.setFillColor(250, 250, 252)
    doc.roundedRect(15, 70, 85, 45, 3, 3, 'FD')
    doc.roundedRect(110, 70, 85, 45, 3, 3, 'FD')

    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(50, 50, 50)
    doc.text('HKD 统计', 57.5, 80, { align: 'center' })
    doc.text('RMB 统计', 152.5, 80, { align: 'center' })

    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(11)
    // HKD
    doc.setTextColor(52, 199, 89) // Green
    doc.text(`总收入: +${totalIncomeHKD.toFixed(2)}`, 20, 90)
    doc.setTextColor(255, 59, 48) // Red
    doc.text(`总支出: -${totalExpenseHKD.toFixed(2)}`, 20, 98)
    doc.setTextColor(0, 0, 0)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text(`期内结余: ${balanceHKD >= 0 ? '+' : ''}${balanceHKD.toFixed(2)}`, 20, 108)
    
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    // RMB
    doc.setTextColor(52, 199, 89) // Green
    doc.text(`总收入: +${totalIncomeRMB.toFixed(2)}`, 115, 90)
    doc.setTextColor(255, 59, 48) // Red
    doc.text(`总支出: -${totalExpenseRMB.toFixed(2)}`, 115, 98)
    doc.setTextColor(0, 0, 0)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text(`期内结余: ${balanceRMB >= 0 ? '+' : ''}${balanceRMB.toFixed(2)}`, 115, 108)
    
    // ----------------------------------------
    // 分类支出占比 (文字 + 简单的柱状条)
    // ----------------------------------------
    doc.line(15, 125, 195, 125)
    doc.setFontSize(14)
    doc.setTextColor(50, 50, 50)
    if (fontBase64) doc.setFont('NotoSansSC', 'bold')
    doc.text('各项分类支出统计 (合并计价)', 15, 140)
    
    if (fontBase64) doc.setFont('NotoSansSC', 'normal')
    doc.setFontSize(11)
    
    const categoryStats: Record<string, number> = {}
    let totalExpenseMerged = 0
    records.filter(r => r.type === 'EXPENSE').forEach(r => {
      const catName = r.category?.name || '未分类'
      const val = Math.abs(r.amount)
      categoryStats[catName] = (categoryStats[catName] || 0) + val
      totalExpenseMerged += val
    })
    
    let yPos = 150
    Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([name, amount], index) => {
      const percentage = totalExpenseMerged > 0 ? (amount / totalExpenseMerged) : 0
      const percentStr = (percentage * 100).toFixed(1)
      
      // 文字
      doc.setTextColor(80, 80, 80)
      doc.text(`${name}: ${amount.toFixed(2)} (${percentStr}%)`, 15, yPos)
      
      // 画一个简单的进度条代替饼图
      doc.setFillColor(230, 230, 230) // 进度条底色
      doc.roundedRect(100, yPos - 4, 80, 6, 2, 2, 'F')
      
      // 不同的前五名颜色，后面统一灰色
      const colors = [
        [0, 122, 255],   // iOS Blue
        [52, 199, 89],   // iOS Green
        [255, 149, 0],   // iOS Orange
        [255, 59, 48],   // iOS Red
        [88, 86, 214]    // iOS Purple
      ]
      const color = index < colors.length ? colors[index] : [142, 142, 147]
      doc.setFillColor(color[0], color[1], color[2])
      
      // 进度条填充
      const barWidth = Math.max(80 * percentage, 1) // 最小宽度 1
      doc.roundedRect(100, yPos - 4, barWidth, 6, 2, 2, 'F')

      yPos += 12
    })

    // ----------------------------------------
    // 2. 添加新一页，显示详细列表
    // ----------------------------------------
    doc.addPage()
    doc.setFontSize(16)
    doc.setTextColor(0, 0, 0)
    doc.text('明细列表报表', 14, 15)

    // 新增：在明细列表上方显示总计
    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    const totalIncomeStr = (totalIncomeHKD > 0 ? `HKD +${totalIncomeHKD.toFixed(2)} ` : '') + (totalIncomeRMB > 0 ? `RMB +${totalIncomeRMB.toFixed(2)}` : '')
    const totalExpenseStr = (totalExpenseHKD > 0 ? `HKD -${totalExpenseHKD.toFixed(2)} ` : '') + (totalExpenseRMB > 0 ? `RMB -${totalExpenseRMB.toFixed(2)}` : '')
    const balanceStr = `HKD ${balanceHKD.toFixed(2)} / RMB ${balanceRMB.toFixed(2)}`
    
    doc.text(`期间总收入: ${totalIncomeStr || '0'}`, 14, 25)
    doc.text(`期间总支出: ${totalExpenseStr || '0'}`, 85, 25)
    doc.text(`期间结余: ${balanceStr}`, 155, 25)

    const tableData = records.map(r => [
      new Date(r.date).toLocaleDateString(),
      r.type === 'INCOME' ? '收入' : '支出',
      r.category?.name || '-',
      r.user?.roleName || '-',
      `${r.amount > 0 ? '+' : ''}${r.amount} ${r.currency}`,
      r.note || '-'
    ])

    autoTable(doc, {
      startY: 35,
      head: [['日期', '类型', '分类', '角色', '金额', '备注']],
      body: tableData,
      styles: { font: fontBase64 ? 'NotoSansSC' : 'helvetica' },
      headStyles: { fillColor: [66, 139, 202], font: fontBase64 ? 'NotoSansSC' : 'helvetica' }
    })

    doc.save('财务报表.pdf')
  }

  // 导出会计明细-PDF (Zip)
  const exportAccountingPdfs = async () => {
    if (records.length === 0) {
      alert('暂无数据可导出')
      return
    }

    setExporting(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder('会计明细')

      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        const doc = createPdfDoc()
        
        doc.setFontSize(16)
        if (fontBase64) doc.setFont('NotoSansSC', 'bold')
        doc.text('会计明细单', 105, 20, { align: 'center' })
        
        doc.setFontSize(12)
        if (fontBase64) doc.setFont('NotoSansSC', 'normal')
        doc.text(`日期: ${new Date(r.date).toLocaleDateString()}`, 20, 40)
        doc.text(`类型: ${r.type === 'INCOME' ? '收入' : '支出'}`, 20, 50)
        doc.text(`分类: ${r.category?.name || '-'}`, 20, 60)
        doc.text(`金额: ${r.amount} ${r.currency}`, 20, 70)
        doc.text(`角色: ${r.user?.roleName || '-'}`, 20, 80)
        doc.text(`资金池: ${r.pool?.name || '-'}`, 20, 90)
        doc.text(`备注: ${r.note || '-'}`, 20, 100)

        // 如果有附件，且是 Data URL 格式的图片，则添加到 PDF
        if (r.attachmentUrl && r.attachmentUrl.startsWith('data:image')) {
          doc.text('附件图片:', 20, 120)
          try {
            // jspdf addImage 语法: addImage(imageData, format, x, y, width, height)
            // 我们需要提取格式
            const match = r.attachmentUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)
            const format = match ? (match[1].toUpperCase() === 'JPG' ? 'JPEG' : match[1].toUpperCase()) : 'JPEG'
            
            // 为了保持比例，简单设定一个最大宽高 150x150
            doc.addImage(r.attachmentUrl, format, 20, 125, 150, 150, undefined, 'FAST')
          } catch (e) {
            console.error('添加图片附件失败:', e)
            doc.text('(图片加载失败)', 40, 120)
          }
        }

        const pdfBlob = doc.output('blob')
        // 文件名规范化，避免非法字符
        const safeDate = new Date(r.date).toLocaleDateString().replace(/\//g, '-')
        const fileName = `${safeDate}_${r.category?.name || '未分类'}_${i + 1}.pdf`
        
        folder?.file(fileName, pdfBlob)
      }

      const zipContent = await zip.generateAsync({ type: 'blob' })
      
      // 下载 zip
      const url = window.URL.createObjectURL(zipContent)
      const link = document.createElement('a')
      link.href = url
      link.download = '会计明细.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

    } catch (err) {
      console.error(err)
      alert('生成会计明细压缩包失败')
    } finally {
      setExporting(false)
    }
  }

  const inputClass = "w-full border-transparent bg-[#F2F2F7] rounded-xl p-3 text-sm focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none transition-all text-gray-900"

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      {/* 筛选区域 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">开始日期</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">结束日期</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">分类</label>
          <select 
            value={categoryId} 
            onChange={e => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">全部</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">币种</label>
          <select 
            value={currency} 
            onChange={e => setCurrency(e.target.value as any)}
            className={inputClass}
          >
            <option value="ALL">全部</option>
            <option value="HKD">HKD</option>
            <option value="RMB">RMB</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">角色</label>
          <select 
            value={userId} 
            onChange={e => setUserId(e.target.value)}
            className={inputClass}
          >
            <option value="">全部</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.roleName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <button 
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] transition-colors shadow-sm disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? '查询中...' : '查询结果'}
        </button>
        <button 
          onClick={exportListPdf}
          disabled={loading || exporting || records.length === 0}
          className="px-6 py-2.5 bg-[#34C759] text-white rounded-xl text-sm font-semibold hover:bg-[#2EB850] transition-colors shadow-sm disabled:opacity-50 disabled:shadow-none"
        >
          导出明细列表-PDF
        </button>
        <button 
          onClick={exportAccountingPdfs}
          disabled={loading || exporting || records.length === 0}
          className="px-6 py-2.5 bg-[#5856D6] text-white rounded-xl text-sm font-semibold hover:bg-[#4B49B8] transition-colors shadow-sm disabled:opacity-50 disabled:shadow-none"
        >
          {exporting ? '打包中...' : '导出会计明细-PDF (Zip)'}
        </button>
      </div>

      {/* 结果表格 */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-left text-sm text-gray-700">
          <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 font-medium">日期</th>
              <th className="px-6 py-3 font-medium">类型</th>
              <th className="px-6 py-3 font-medium">分类</th>
              <th className="px-6 py-3 font-medium">角色</th>
              <th className="px-6 py-3 font-medium">资金池</th>
              <th className="px-6 py-3 font-medium">金额</th>
              <th className="px-6 py-3 font-medium">备注</th>
              <th className="px-6 py-3 font-medium">附件</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400 font-medium">暂无数据，请尝试查询</td>
              </tr>
            ) : (
              records.map(record => (
                <tr key={record.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-6 py-4 font-medium">{new Date(record.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                      record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                    }`}>
                      {record.type === 'INCOME' ? '收入' : '支出'}
                    </span>
                  </td>
                  <td className="px-6 py-4">{record.category?.name || '-'}</td>
                  <td className="px-6 py-4">{record.user?.roleName || '-'}</td>
                  <td className="px-6 py-4">{record.pool?.name || '-'}</td>
                  <td className={`px-6 py-4 font-bold ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                    {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate text-gray-500" title={record.note || ''}>{record.note || '-'}</td>
                  <td className="px-6 py-4">
                    {record.attachmentUrl ? (
                      <span className="text-xs font-semibold text-[#34C759] bg-[#34C759]/10 px-2.5 py-1 rounded-md">有图</span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
