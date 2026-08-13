'use client'

import { useState, useMemo } from 'react'
import { closeOrder } from '../actions/order'

export default function ConsolidatedClient({ openOrders, closedOrders }: { openOrders: any[], closedOrders: any[] }) {
  const [tab, setTab] = useState<'OPEN' | 'CLOSED'>('OPEN')
  const [search, setSearch] = useState('')
  const [modalOrder, setModalOrder] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleClose = async () => {
    if (confirm("确定要结单吗？结单后不可修改。")) {
      setLoading(true)
      const res = await closeOrder(modalOrder.id)
      if (res.success) {
        alert('已结单')
        window.location.reload()
      } else {
        alert(res.error)
        setLoading(false)
      }
    }
  }

  const currentOrders = tab === 'OPEN' ? openOrders : closedOrders

  const filteredOrders = useMemo(() => {
    if (!search) return currentOrders
    const lower = search.toLowerCase()
    return currentOrders.filter((o: any) => 
      (o.date && new Date(o.date).toLocaleDateString().includes(lower)) ||
      (o.note && o.note.toLowerCase().includes(lower)) ||
      (o.orderNo && o.orderNo.toLowerCase().includes(lower))
    )
  }, [currentOrders, search])

  const calculateStats = (records: any[]) => {
    let hkd = { INCOME: 0, EXPENSE: 0, AR: 0, AP: 0, subtotal: 0 }
    let rmb = { INCOME: 0, EXPENSE: 0, AR: 0, AP: 0, subtotal: 0 }
    
    if (records) {
      records.forEach((r: any) => {
        const stats = r.currency === 'HKD' ? hkd : rmb
        if (r.type === 'INCOME') stats.INCOME += r.amount
        else if (r.type === 'EXPENSE') stats.EXPENSE += Math.abs(r.amount)
        else if (r.type === 'AR') stats.AR += Math.abs(r.amount)
        else if (r.type === 'AP') stats.AP += Math.abs(r.amount)
        
        if (r.type === 'INCOME' || r.type === 'EXPENSE') {
          stats.subtotal += r.amount
        }
      })
    }
    return { hkd, rmb }
  }

  return (
    <div className="pt-4 space-y-6">
      <div className="flex space-x-6 border-b border-gray-200">
        <button
          className={`pb-2 font-semibold ${tab === 'OPEN' ? 'text-[#007AFF] border-b-2 border-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('OPEN')}
        >
          归单 ({openOrders.length})
        </button>
        <button
          className={`pb-2 font-semibold ${tab === 'CLOSED' ? 'text-[#007AFF] border-b-2 border-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('CLOSED')}
        >
          结单 ({closedOrders.length})
        </button>
      </div>

      {tab === 'OPEN' && (
        <div className="px-1">
          <input
            type="text"
            placeholder="搜索归结单日期、单号或备注..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm shadow-sm"
          />
        </div>
      )}

      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 font-medium">
            暂无数据
          </div>
        ) : (
          filteredOrders.map((order: any) => {
            const { hkd, rmb } = calculateStats(order.records)
            return (
              <div 
                key={order.id} 
                className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 cursor-pointer hover:border-gray-300 transition-colors"
                onClick={() => setModalOrder(order)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-bold text-gray-900 text-lg">{new Date(order.date).toLocaleDateString()}</span>
                      <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{order.orderNo}</span>
                    </div>
                    <p className="text-sm text-gray-600">{order.note || '无备注'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#F2F2F7] p-4 rounded-2xl text-xs">
                  <div>
                    <div className="font-semibold text-gray-800 mb-2">HKD</div>
                    <div className="grid grid-cols-2 gap-y-1">
                      <span className="text-gray-500">收: <span className="text-[#007AFF] font-medium">{hkd.INCOME}</span></span>
                      <span className="text-gray-500">支: <span className="text-[#FF3B30] font-medium">{hkd.EXPENSE}</span></span>
                      <span className="text-gray-500">应收: <span className="text-[#007AFF] font-medium">{hkd.AR}</span></span>
                      <span className="text-gray-500">应付: <span className="text-[#FF3B30] font-medium">{hkd.AP}</span></span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300 font-bold text-gray-800">
                      小计: <span className={hkd.subtotal > 0 ? 'text-green-600' : 'text-red-500'}>{hkd.subtotal > 0 ? '+' : ''}{hkd.subtotal}</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 mb-2">RMB</div>
                    <div className="grid grid-cols-2 gap-y-1">
                      <span className="text-gray-500">收: <span className="text-[#007AFF] font-medium">{rmb.INCOME}</span></span>
                      <span className="text-gray-500">支: <span className="text-[#FF3B30] font-medium">{rmb.EXPENSE}</span></span>
                      <span className="text-gray-500">应收: <span className="text-[#007AFF] font-medium">{rmb.AR}</span></span>
                      <span className="text-gray-500">应付: <span className="text-[#FF3B30] font-medium">{rmb.AP}</span></span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300 font-bold text-gray-800">
                      小计: <span className={rmb.subtotal > 0 ? 'text-green-600' : 'text-red-500'}>{rmb.subtotal > 0 ? '+' : ''}{rmb.subtotal}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {modalOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{new Date(modalOrder.date).toLocaleDateString()}</h3>
                  <span className="font-mono text-sm text-gray-500 bg-gray-200 px-2 py-0.5 rounded">{modalOrder.orderNo}</span>
                  {tab === 'CLOSED' && (
                    <span className="text-xs text-gray-400">结单于: {new Date(modalOrder.closedAt).toLocaleString()}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-3">{modalOrder.note || '无备注'}</p>
                {tab === 'OPEN' && (
                  <button 
                    onClick={handleClose}
                    disabled={loading}
                    className="px-4 py-1.5 bg-[#007AFF] hover:bg-[#0066CC] text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                  >
                    结单
                  </button>
                )}
              </div>
              <button onClick={() => setModalOrder(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors ml-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="overflow-y-auto p-0 flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F2F2F7] sticky top-0 text-xs text-gray-500 uppercase tracking-wider shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">日期</th>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">分类</th>
                    <th className="px-4 py-3 font-medium">角色</th>
                    <th className="px-4 py-3 font-medium">资金池</th>
                    <th className="px-4 py-3 font-medium">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modalOrder.records?.map((record: any) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{new Date(record.date).toLocaleDateString()}</td>
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
                        {record.subCategory ? ` / ${record.subCategory.name}` : ''}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[80px]">
                        {record.user?.roleName || '-'}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[80px]">
                        {record.pool?.name || '-'}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${record.amount > 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                        {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                      </td>
                    </tr>
                  ))}
                  {(!modalOrder.records || modalOrder.records.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">暂无关联记录</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
