'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createRecord } from './actions/record'
import { createCategory } from './actions/category'

type Props = {
  session: any
  stats: { totalHkd: number; totalRmb: number }
  initialRecords: any[]
  categories: any[]
  pools: any[]
}

// 简单的图片压缩函数 (目标200KB)
function compressImage(file: File, maxSizeKB: number = 200): Promise<{ url: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas ctx not found'))
        
        let { width, height } = img
        const maxDim = 1200
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        
        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        
        let quality = 0.9
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        let size = Math.round((dataUrl.length * 3) / 4)
        
        while (size > maxSizeKB * 1024 && quality > 0.1) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          size = Math.round((dataUrl.length * 3) / 4)
        }
        
        resolve({ url: dataUrl, size })
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}

export default function HomePageClient({ session, stats, initialRecords, categories, pools }: Props) {
  const [isClient, setIsClient] = useState(false)
  const [records, setRecords] = useState(initialRecords)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [date, setDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'HKD' | 'RMB'>('HKD')
  const [poolId, setPoolId] = useState('')
  const [attachment, setAttachment] = useState<{ url: string; size: number } | null>(null)
  const [note, setNote] = useState('')
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // 解决 Hydration 问题，并且在客户端才设置当前日期
  useEffect(() => {
    setIsClient(true)
    setDate(new Date().toISOString().split('T')[0])
  }, [])

  // 处理新增分类
  const handleAddCategory = async () => {
    const name = window.prompt('请输入新分类名称：')
    if (name && name.trim()) {
      const res = await createCategory(name.trim())
      if (res.success) {
        alert('分类添加成功')
        // 新增成功后刷新页面以获取最新分类或在客户端模拟，这里简单处理
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
        alert('图片压缩失败')
      }
    }
  }

  // 提交倒计时逻辑
  useEffect(() => {
    let timer: any
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    } else {
      setIsSubmitting(false)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryId || !amount || !poolId) {
      alert('请填写必填项')
      return
    }

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
      currency,
      amount: finalAmount,
      categoryId,
      poolId,
      userId: session.userId,
      attachmentUrl: attachment?.url,
      attachmentSize: attachment?.size,
    })

    if (res.success) {
      alert('记录添加成功')
      // Force a page refresh to update both stats and the records list
      window.location.reload()
    } else {
      alert('失败: ' + res.error)
      setIsSubmitting(false)
    }
  }

  const formBgClass = type === 'INCOME' ? 'bg-[#F2F8FF]' : 'bg-[#FFF2F2]'
  const formBorderClass = type === 'INCOME' ? 'border-[#007AFF]/20' : 'border-[#FF3B30]/20'
  const submitBtnClass = type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'

  const inputClass = "w-full border-transparent bg-white rounded-xl shadow-sm p-3 focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none transition-all text-gray-900 placeholder-gray-400"
  
  if (!isClient) {
    return <div className="min-h-screen bg-[#F2F2F7]"></div> // 避免 hydration 闪烁
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 min-h-screen bg-[#F2F2F7] pb-10 overflow-x-hidden">
      {/* 顶部导航 */}
      <nav className="flex space-x-6 border-b border-gray-200 pb-3 text-lg font-semibold bg-[#F2F2F7] sticky top-0 z-10 pt-2">
        <Link href="/" className="text-[#007AFF] border-b-2 border-[#007AFF] pb-1">首页</Link>
        <Link href="/report" className="text-gray-500 hover:text-gray-800 transition-colors">报表</Link>
        {session.isAdmin && (
          <Link href="/admin" className="text-gray-500 hover:text-gray-800 transition-colors ml-auto flex-1 text-right pr-2">管理后台</Link>
        )}
      </nav>

      {/* 资产展示 Hero Section */}
      <section className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-gray-100 text-center w-full max-w-full overflow-hidden">
        <div className="flex items-center justify-center gap-3 mb-4 sm:mb-6">
          <h2 className="text-lg font-semibold text-gray-800">总资产</h2>
          {session?.username && (
            <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {session.username}
            </span>
          )}
        </div>
        <div className="flex justify-center items-center space-x-6 sm:space-x-12">
          <div className="flex flex-col items-center min-w-0">
            <div className="text-xs font-medium text-gray-400 mb-1 tracking-wide">HKD</div>
            <div className="text-xl sm:text-3xl font-bold text-green-600 truncate max-w-full">
              ${stats.totalHkd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="w-px bg-gray-200 h-8 sm:h-12 my-auto shrink-0"></div>
          <div className="flex flex-col items-center min-w-0">
            <div className="text-xs font-medium text-gray-400 mb-1 tracking-wide">RMB</div>
            <div className="text-xl sm:text-3xl font-bold text-[#FF3B30] truncate max-w-full">
              ¥{stats.totalRmb.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </section>

      {/* 收支表单 */}
      <section className={`p-6 rounded-3xl shadow-sm border ${formBgClass} ${formBorderClass} transition-colors`}>
        <div className="flex space-x-3 mb-6 bg-gray-200/50 p-1 rounded-xl w-fit">
          <button
            type="button"
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30]' : 'bg-transparent text-gray-600 shadow-none'}`}
            onClick={() => setType('EXPENSE')}
          >
            支出 (Expense)
          </button>
          <button
            type="button"
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'INCOME' ? 'bg-white text-[#007AFF]' : 'bg-transparent text-gray-600 shadow-none'}`}
            onClick={() => setType('INCOME')}
          >
            收入 (Income)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 日期 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">日期</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            
            {/* 分类 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>分类</span>
                <button type="button" onClick={handleAddCategory} className="text-[#007AFF] text-xs font-semibold hover:opacity-80">
                  + 添加新分类
                </button>
              </label>
              <select
                required
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={inputClass}
              >
                <option value="" className="text-gray-400">请选择分类...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* 金额与币种 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">金额</label>
              <div className="flex bg-white rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-[#007AFF]/30 transition-all">
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as 'HKD' | 'RMB')}
                  className="bg-transparent border-transparent py-3 pl-2 pr-6 sm:pl-3 sm:pr-8 rounded-l-xl text-gray-900 font-medium focus:ring-0 outline-none w-24 sm:w-auto shrink-0 text-sm sm:text-base"
                >
                  <option value="HKD">HKD</option>
                  <option value="RMB">RMB</option>
                </select>
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

            {/* 资金池 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">资金池 (Pool)</label>
              <select
                required
                value={poolId}
                onChange={e => setPoolId(e.target.value)}
                className={inputClass}
              >
                <option value="">请选择资金池...</option>
                {pools.map(pool => (
                  <option key={pool.id} value={pool.id}>{pool.name}</option>
                ))}
              </select>
            </div>

            {/* 备注 */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">备注 (可选)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className={inputClass}
                placeholder="记录一些细节..."
              />
            </div>

            {/* 图片上传 */}
            <div className="md:col-span-2 bg-white/50 p-4 rounded-2xl border border-dashed border-gray-300">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">附件 <span className="normal-case font-normal">(图片自动压缩至&lt;200K)</span></label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#007AFF]/10 file:text-[#007AFF] hover:file:bg-[#007AFF]/20 transition-colors cursor-pointer"
              />
              {attachment && (
                <div className="mt-3 flex items-center space-x-2 text-xs font-medium text-[#34C759] bg-[#34C759]/10 p-2 rounded-lg w-fit">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  <span>图片已压缩: {(attachment.size / 1024).toFixed(1)} KB</span>
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
            {countdown > 0 ? `提交成功，冷却中 (${countdown}s)` : isSubmitting ? '提交中...' : '提交记录'}
          </button>
        </form>
      </section>

      {/* 最近 10 条记录列表 */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">最近 10 条记录</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">日期</th>
                <th className="px-6 py-3 font-medium">类型</th>
                <th className="px-6 py-3 font-medium">分类</th>
                <th className="px-6 py-3 font-medium">金额</th>
                <th className="px-6 py-3 font-medium">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 font-medium">暂无记录</td>
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
                    <td className={`px-6 py-4 font-bold ${record.type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                      {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{record.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
