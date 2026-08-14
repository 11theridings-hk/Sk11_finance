'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createRecord } from './actions/record'
import { createCategory } from './actions/category'

type Props = {
  session: any
  stats: { hkdCashFlow: number; hkdAR: number; hkdAP: number; rmbCashFlow: number; rmbAR: number; rmbAP: number }
  initialRecords: any[]
  categories: any[]
  pools: any[]
  openOrders?: any[]
}

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

// 自动生成订单号
function generateOrderNo() {
  const dateStr = new Date().toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
  const randomStr = Math.floor(1000 + Math.random() * 9000).toString(); // 4位随机数
  return dateStr + randomStr; // 10位
}

export default function HomePageClient({ session, stats, initialRecords, categories, pools, openOrders = [] }: Props) {
  const [isClient, setIsClient] = useState(false)
  const [records, setRecords] = useState(initialRecords)
  
  // 模式切换
  const [isARAP, setIsARAP] = useState(false)
  const [isOrder, setIsOrder] = useState(false)

  // 表单状态
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [date, setDate] = useState('')
  const [executionDate, setExecutionDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'HKD' | 'RMB'>('HKD')
  const [poolId, setPoolId] = useState('')
  const [attachment, setAttachment] = useState<{ url: string; size: number } | null>(null)
  const [note, setNote] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [orderNote, setOrderNote] = useState('')
  
  // 归结单相关
  const [orderSearch, setOrderSearch] = useState('')
  const [selectedOrderNo, setSelectedOrderNo] = useState('')
  const [modalOrder, setModalOrder] = useState<any>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  useEffect(() => {
    setIsClient(true)
    const today = new Date().toISOString().split('T')[0]
    setDate(today)
    setExecutionDate(today)
    setOrderNo(generateOrderNo())
  }, [])

  const handleToggleARAP = () => {
    if (!isARAP) {
      setIsARAP(true)
      setIsOrder(false)
    } else {
      setIsARAP(false)
    }
  }

  const handleToggleOrder = () => {
    if (!isOrder) {
      setIsOrder(true)
      setIsARAP(false)
    } else {
      setIsOrder(false)
    }
  }

  // 过滤主分类和子分类
  const filteredCategories = useMemo(() => {
    return categories.filter(c => c.type === type)
  }, [categories, type])

  const currentCategory = useMemo(() => {
    return filteredCategories.find(c => c.id === categoryId)
  }, [filteredCategories, categoryId])

  const handleAddCategory = async (parentId?: string) => {
    const name = window.prompt(`请输入新${parentId ? '子' : '主'}分类名称：`)
    if (name && name.trim()) {
      const res = await createCategory(name.trim(), parentId, type)
      if (res.success) {
        alert('分类添加成功')
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
      alert('请填写必填项')
      return
    }
    if (!isARAP && !poolId) {
      alert('请选择资金池')
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

    let finalType = type
    if (isARAP) {
      finalType = type === 'INCOME' ? 'AR' as any : 'AP' as any
    }

    const finalOrderNo = isOrder ? (selectedOrderNo || orderNo) : undefined

    const res = await createRecord({
      type: finalType as any,
      date: new Date(date),
      executionDate: isARAP ? new Date(executionDate) : undefined,
      note,
      currency,
      amount: finalAmount,
      categoryId,
      subCategoryId: subCategoryId || undefined,
      poolId: isARAP ? undefined : poolId,
      attachmentUrl: attachment?.url,
      attachmentSize: attachment?.size,
      orderNo: finalOrderNo,
      orderNote: isOrder && !selectedOrderNo ? orderNote : undefined // 传递 orderNote，需要修改 CreateRecordInput
    } as any)

    if (res.success) {
      alert('记录添加成功')
      window.location.reload()
    } else {
      alert('失败: ' + res.error)
      setIsSubmitting(false)
    }
  }

  // 搜索归结单
  const filteredOrders = useMemo(() => {
    if (!orderSearch) return openOrders
    const lower = orderSearch.toLowerCase()
    return openOrders.filter(o => 
      (o.date && new Date(o.date).toLocaleDateString().includes(lower)) ||
      (o.note && o.note.toLowerCase().includes(lower)) ||
      (o.orderNo && o.orderNo.toLowerCase().includes(lower))
    )
  }, [openOrders, orderSearch])

  const formBgClass = type === 'INCOME' ? 'bg-[#F2F8FF]' : 'bg-[#FFF2F2]'
  const formBorderClass = type === 'INCOME' ? 'border-[#007AFF]/20' : 'border-[#FF3B30]/20'
  const submitBtnClass = type === 'INCOME' ? 'bg-[#007AFF] hover:bg-[#0066CC]' : 'bg-[#FF3B30] hover:bg-[#CC2E26]'

  const inputClass = "w-full border-transparent bg-white rounded-xl shadow-sm p-3 focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none transition-all text-gray-900 placeholder-gray-400"
  
  if (!isClient) return <div className="min-h-screen bg-[#F2F2F7]"></div>

  return (
    <div className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 overflow-x-hidden relative">
      {/* 资产展示 Hero Section */}
      <section className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 text-center w-full max-w-full overflow-hidden relative">
        <div className="absolute top-4 left-4 sm:top-5 sm:left-5 text-xs text-gray-500 font-medium flex items-center gap-1">
          当前角色: <span className="text-gray-800 font-semibold">{session.roleName}</span>
        </div>
        <button 
          onClick={async () => {
            const { logout } = await import('./actions/auth');
            await logout();
            window.location.href = '/login';
          }}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-xs text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1 transition-colors"
        >
          登出
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>

        <div className="flex items-center justify-center gap-3 mb-4 sm:mb-6 mt-6 sm:mt-4">
          <h2 className="text-lg font-semibold text-gray-800">总资产</h2>
        </div>
        <div className="flex flex-col sm:flex-row justify-center items-center sm:items-stretch space-y-6 sm:space-y-0 sm:space-x-8">
          {/* HKD 区域 */}
          <div className="flex-1 w-full max-w-sm">
            <div className="text-sm font-bold text-gray-800 mb-3 bg-gray-50 rounded-lg py-1">HKD (港币)</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-2 rounded-xl bg-green-50/50">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">现金流</div>
                <div className="text-sm sm:text-base font-bold text-green-600 truncate w-full" title={stats.hkdCashFlow?.toString() || '0'}>
                  ${(stats.hkdCashFlow || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="flex flex-col items-center p-2 rounded-xl bg-blue-50/50">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">应收款</div>
                <div className="text-sm sm:text-base font-bold text-[#007AFF] truncate w-full" title={stats.hkdAR?.toString() || '0'}>
                  ${(stats.hkdAR || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="flex flex-col items-center p-2 rounded-xl bg-red-50/50">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">应付款</div>
                <div className="text-sm sm:text-base font-bold text-[#FF3B30] truncate w-full" title={stats.hkdAP?.toString() || '0'}>
                  ${(stats.hkdAP || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
          
          <div className="w-full h-px sm:w-px sm:h-auto bg-gray-200 shrink-0"></div>
          
          {/* RMB 区域 */}
          <div className="flex-1 w-full max-w-sm">
            <div className="text-sm font-bold text-gray-800 mb-3 bg-gray-50 rounded-lg py-1">RMB (人民币)</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-2 rounded-xl bg-green-50/50">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">现金流</div>
                <div className="text-sm sm:text-base font-bold text-green-600 truncate w-full" title={stats.rmbCashFlow?.toString() || '0'}>
                  ¥{(stats.rmbCashFlow || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="flex flex-col items-center p-2 rounded-xl bg-blue-50/50">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">应收款</div>
                <div className="text-sm sm:text-base font-bold text-[#007AFF] truncate w-full" title={stats.rmbAR?.toString() || '0'}>
                  ¥{(stats.rmbAR || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="flex flex-col items-center p-2 rounded-xl bg-red-50/50">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1">应付款</div>
                <div className="text-sm sm:text-base font-bold text-[#FF3B30] truncate w-full" title={stats.rmbAP?.toString() || '0'}>
                  ¥{(stats.rmbAP || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 开关区域 */}
      <div className="flex justify-end gap-4 mb-2 pr-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm font-medium text-gray-600">应收付</span>
          <div className="relative">
            <input type="checkbox" className="sr-only peer" checked={isARAP} onChange={handleToggleARAP} />
            <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#34C759]"></div>
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm font-medium text-gray-600">归结单</span>
          <div className="relative">
            <input type="checkbox" className="sr-only peer" checked={isOrder} onChange={handleToggleOrder} />
            <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#34C759]"></div>
          </div>
        </label>
      </div>

      {/* 收支表单 */}
      <section className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border ${formBgClass} ${formBorderClass} transition-colors`}>
        <div className="flex space-x-2 sm:space-x-3 mb-5 sm:mb-6 bg-gray-200/50 p-1 rounded-xl w-fit">
          <button
            type="button"
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'EXPENSE' ? 'bg-white text-[#FF3B30]' : 'bg-transparent text-gray-600 shadow-none'}`}
            onClick={() => { setType('EXPENSE'); setCategoryId(''); setSubCategoryId(''); }}
          >
            {isARAP ? '应付款' : '支出 (Expense)'}
          </button>
          <button
            type="button"
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm ${type === 'INCOME' ? 'bg-white text-[#007AFF]' : 'bg-transparent text-gray-600 shadow-none'}`}
            onClick={() => { setType('INCOME'); setCategoryId(''); setSubCategoryId(''); }}
          >
            {isARAP ? '应收款' : '收入 (Income)'}
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
            
            {/* 主分类 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>主分类</span>
                <button type="button" onClick={() => handleAddCategory()} className="text-[#007AFF] text-xs font-semibold hover:opacity-80">
                  + 添加主分类
                </button>
              </label>
              <select
                required
                value={categoryId}
                onChange={e => { setCategoryId(e.target.value); setSubCategoryId(''); }}
                className={inputClass}
              >
                <option value="" className="text-gray-400">请选择分类...</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* 子分类 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex justify-between">
                <span>子分类</span>
                <button 
                  type="button" 
                  onClick={() => categoryId ? handleAddCategory(categoryId) : alert('请先选择主分类')} 
                  className={`${categoryId ? 'text-[#007AFF]' : 'text-gray-400'} text-xs font-semibold hover:opacity-80`}
                >
                  + 添加子分类
                </button>
              </label>
              <select
                value={subCategoryId}
                onChange={e => setSubCategoryId(e.target.value)}
                className={inputClass}
                disabled={!currentCategory || !currentCategory.children || currentCategory.children.length === 0}
              >
                <option value="" className="text-gray-400">
                  {!currentCategory ? '请先选择主分类...' : 
                   (currentCategory.children && currentCategory.children.length > 0) ? '请选择子分类...' : '无子分类'}
                </option>
                {currentCategory?.children?.map((sub: any) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
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

            {/* 资金池 / 执行期限 */}
            {isARAP ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">执行期限</label>
                <input
                  type="date"
                  required
                  value={executionDate}
                  onChange={e => setExecutionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                  资金池 (Pool)
                </label>
                <select
                  required
                  value={poolId}
                  onChange={e => setPoolId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">请选择资金池...</option>
                  {pools.map(pool => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name} {pool.isReviewRequired ? '(审核账户)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 备注 */}
            <div className={isARAP ? "md:col-span-1" : "md:col-span-2"}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">记录备注 (可选)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className={inputClass}
                placeholder="记录单笔明细细节..."
              />
            </div>

            {/* 归结单备注 */}
            {isOrder && !selectedOrderNo && (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">归结单总备注 (可选)</label>
                <input
                  type="text"
                  value={orderNote}
                  onChange={e => setOrderNote(e.target.value)}
                  className={inputClass}
                  placeholder="整张归结单的说明..."
                />
              </div>
            )}

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

          {isOrder && (
            <div className="flex flex-col items-center pt-4">
              <span className="text-xs font-semibold text-gray-500 mb-1 uppercase">当前归结单号</span>
              <span className="text-lg font-mono font-bold text-gray-800 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                {selectedOrderNo || orderNo}
              </span>
              <span className="text-xs text-gray-400 mt-2">可在下方列表中选择已有归结单替换</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || countdown > 0}
            className={`w-full py-4 mt-6 text-white font-semibold rounded-xl shadow-sm transition-all ${
              isSubmitting || countdown > 0 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' 
                : submitBtnClass
            }`}
          >
            {countdown > 0 ? `提交成功，冷却中 (${countdown}s)` : isSubmitting ? '提交中...' : (isARAP ? (type === 'INCOME' ? '记录应收' : '记录应付') : '提交记录')}
          </button>
        </form>
      </section>

      {/* 搜索框 (仅在归结单模式下显示) */}
      {isOrder && (
        <div className="px-1 py-2">
          <input
            type="text"
            placeholder="搜索归结单日期、单号或备注..."
            value={orderSearch}
            onChange={e => setOrderSearch(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm shadow-sm"
          />
        </div>
      )}

      {/* 列表区域 */}
      <section className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-10">
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            {isOrder ? '归结单记录' : '最近 10 条记录'}
          </h2>
        </div>
        
        {isOrder ? (
          <div className="divide-y divide-gray-100">
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-400 font-medium">暂无归结单数据</div>
            ) : (
              filteredOrders.map(order => {
                const totalHkd = order.records?.filter((r: any) => r.currency === 'HKD').reduce((sum: number, r: any) => sum + r.amount, 0) || 0
                const totalRmb = order.records?.filter((r: any) => r.currency === 'RMB').reduce((sum: number, r: any) => sum + r.amount, 0) || 0
                return (
                  <div key={order.id} className="flex items-center p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 cursor-pointer min-w-0" onClick={() => setModalOrder(order)}>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{new Date(order.date).toLocaleDateString()}</span>
                        <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded truncate">{order.orderNo}</span>
                      </div>
                      <div className="text-sm text-gray-600 mb-2 truncate" title={order.note}>{order.note || '无备注'}</div>
                      <div className="flex gap-4 text-xs font-semibold">
                        {totalHkd !== 0 && <span className={totalHkd > 0 ? 'text-green-600' : 'text-red-500'}>HKD: {totalHkd > 0 ? '+' : ''}{totalHkd.toFixed(2)}</span>}
                        {totalRmb !== 0 && <span className={totalRmb > 0 ? 'text-green-600' : 'text-red-500'}>RMB: {totalRmb > 0 ? '+' : ''}{totalRmb.toFixed(2)}</span>}
                      </div>
                    </div>
                    <div className="ml-2 sm:ml-4 shrink-0">
                      <label className="flex items-center cursor-pointer">
                        <input 
                          type="radio" 
                          name="orderSelect" 
                          checked={selectedOrderNo === order.orderNo}
                          onChange={() => setSelectedOrderNo(order.orderNo)}
                          className="w-5 h-5 text-[#007AFF] focus:ring-[#007AFF] border-gray-300"
                        />
                      </label>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="w-full">
            <div className="hidden md:block overflow-x-auto">
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
                            record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 
                            record.type === 'EXPENSE' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {record.type === 'INCOME' ? '收入' : record.type === 'EXPENSE' ? '支出' : record.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {record.category?.name || '-'}
                          {record.subCategory ? ` / ${record.subCategory.name}` : ''}
                        </td>
                        <td className={`px-6 py-4 font-bold ${record.type === 'INCOME' || record.type === 'AR' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                          {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                        </td>
                        <td className="px-6 py-4 text-gray-500 truncate max-w-xs">{record.note || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* 移动端卡片视图 */}
            <div className="md:hidden divide-y divide-gray-100">
              {records.length === 0 ? (
                <div className="p-8 text-center text-gray-400 font-medium">暂无记录</div>
              ) : (
                records.map(record => (
                  <div key={record.id} className="p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{new Date(record.date).toLocaleDateString()}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 
                            record.type === 'EXPENSE' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 
                            'bg-purple-100 text-purple-700'
                          }`}>
                          {record.type === 'INCOME' ? '收入' : record.type === 'EXPENSE' ? '支出' : record.type}
                        </span>
                      </div>
                      <span className={`font-bold text-sm ${record.type === 'INCOME' || record.type === 'AR' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                        {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {record.category?.name || '-'} {record.subCategory ? `/ ${record.subCategory.name}` : ''}
                    </div>
                    {record.note && (
                      <div className="text-xs text-gray-500 truncate">{record.note}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* 归结单模态窗 */}
      {modalOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{new Date(modalOrder.date).toLocaleDateString()}</h3>
                  <span className="font-mono text-sm text-gray-500 bg-gray-200 px-2 py-0.5 rounded">{modalOrder.orderNo}</span>
                </div>
                <p className="text-sm text-gray-600">{modalOrder.note || '无备注'}</p>
              </div>
              <button onClick={() => setModalOrder(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="overflow-y-auto p-0 flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F2F2F7] sticky top-0 text-xs text-gray-500 uppercase tracking-wider shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">分类</th>
                    <th className="px-4 py-3 font-medium">角色</th>
                    <th className="px-4 py-3 font-medium">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modalOrder.records?.map((record: any) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                          record.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 
                          record.type === 'EXPENSE' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {record.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 truncate max-w-[120px]" title={record.category?.name}>
                        {record.category?.name || '-'}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[80px]">
                        {record.user?.roleName || '-'}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                        {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                      </td>
                    </tr>
                  ))}
                  {(!modalOrder.records || modalOrder.records.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-400">暂无关联记录</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 确认弹窗 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm flex flex-col shadow-xl overflow-hidden p-6 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">确认提交记录</h3>
            <div className="bg-gray-50 rounded-2xl p-4 text-left text-sm space-y-2 mb-6 border border-gray-100">
              <p><span className="text-gray-500">类型:</span> <span className="font-semibold">{isARAP ? (type === 'INCOME' ? '应收款' : '应付款') : (type === 'INCOME' ? '收入' : '支出')}</span></p>
              <p><span className="text-gray-500">金额:</span> <span className={`font-bold ${type === 'INCOME' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>{amount} {currency}</span></p>
              <p><span className="text-gray-500">日期:</span> <span>{date}</span></p>
              <p><span className="text-gray-500">分类:</span> <span>{currentCategory?.name} {subCategoryId ? ' / 有子分类' : ''}</span></p>
              {!isARAP && poolId && (
                <p><span className="text-gray-500">资金池:</span> <span>{pools.find(p => p.id === poolId)?.name}</span></p>
              )}
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowConfirmDialog(false); setCountdown(0); }}
                disabled={countdown > 0}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button 
                onClick={handleConfirmSubmit}
                disabled={countdown > 0}
                className={`flex-1 py-3 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 ${submitBtnClass}`}
              >
                {countdown > 0 ? `提交中 (${countdown}s)` : '再次确认'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
