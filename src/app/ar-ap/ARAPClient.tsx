'use client'

import { useState } from 'react'
import { updateARAPAmount, addRemarkLog } from '../actions/arap'

export default function ARAPClient({ session, records }: { session: any, records: any[] }) {
  const [tab, setTab] = useState<'AR' | 'AP'>('AR')
  const [modalRecord, setModalRecord] = useState<any>(null)
  
  const [newAmount, setNewAmount] = useState('')
  const [newRemark, setNewRemark] = useState('')
  const [loading, setLoading] = useState(false)

  const filteredRecords = records.filter(r => r.type === tab)

  const handleUpdateAmount = async () => {
    if (!newAmount || isNaN(Number(newAmount))) return
    setLoading(true)
    let finalAmount = Math.abs(Number(newAmount))
    if (tab === 'AP') finalAmount = -finalAmount
    
    const res = await updateARAPAmount(modalRecord.id, finalAmount)
    if (res.success) {
      alert('金额修改成功')
      window.location.reload()
    } else {
      alert(res.error)
      setLoading(false)
    }
  }

  const handleAddRemark = async () => {
    if (!newRemark.trim()) return
    setLoading(true)
    const res = await addRemarkLog(modalRecord.id, newRemark.trim())
    if (res.success) {
      setNewRemark('')
      alert('备注添加成功')
      window.location.reload()
    } else {
      alert(res.error)
      setLoading(false)
    }
  }

  const openModal = (record: any) => {
    setModalRecord(record)
    setNewAmount(Math.abs(record.amount).toString())
    setNewRemark('')
  }

  return (
    <div className="pt-4 space-y-6">
      <div className="flex space-x-6 border-b border-gray-200">
        <button
          className={`pb-2 font-semibold ${tab === 'AR' ? 'text-[#007AFF] border-b-2 border-[#007AFF]' : 'text-gray-500'}`}
          onClick={() => setTab('AR')}
        >
          应收款
        </button>
        <button
          className={`pb-2 font-semibold ${tab === 'AP' ? 'text-[#FF3B30] border-b-2 border-[#FF3B30]' : 'text-gray-500'}`}
          onClick={() => setTab('AP')}
        >
          应付款
        </button>
      </div>

      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-[#F2F2F7]/50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">执行期限</th>
                <th className="px-6 py-3 font-medium">分类</th>
                <th className="px-6 py-3 font-medium">金额</th>
                <th className="px-6 py-3 font-medium">角色</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400 font-medium">暂无数据</td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50/80 transition-colors cursor-pointer" onClick={() => openModal(record)}>
                    <td className="px-6 py-4 font-medium">{record.executionDate ? new Date(record.executionDate).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4">
                      {record.category?.name || '-'}
                      {record.subCategory ? ` / ${record.subCategory.name}` : ''}
                    </td>
                    <td className={`px-6 py-4 font-bold ${tab === 'AR' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                      {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{record.user?.roleName || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* 移动端卡片视图 */}
        <div className="md:hidden divide-y divide-gray-100">
          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-400 font-medium">暂无数据</div>
          ) : (
            filteredRecords.map(record => (
              <div key={record.id} className="p-4 space-y-2 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => openModal(record)}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">
                      期限: {record.executionDate ? new Date(record.executionDate).toLocaleDateString() : '-'}
                    </span>
                  </div>
                  <span className={`font-bold text-sm ${tab === 'AR' ? 'text-[#007AFF]' : 'text-[#FF3B30]'}`}>
                    {record.amount > 0 ? '+' : ''}{record.amount} {record.currency}
                  </span>
                </div>
                <div className="text-sm text-gray-600 flex justify-between">
                  <span className="truncate">
                    {record.category?.name || '-'} {record.subCategory ? `/ ${record.subCategory.name}` : ''}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0 ml-2">{record.user?.roleName || '-'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {modalRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">详情记录</h3>
              <button onClick={() => setModalRecord(null)} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">执行期限</span>
                  <span className="font-semibold text-gray-900">{modalRecord.executionDate ? new Date(modalRecord.executionDate).toLocaleDateString() : '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">分类</span>
                  <span className="font-semibold text-gray-900">{modalRecord.category?.name} {modalRecord.subCategory ? `/ ${modalRecord.subCategory.name}` : ''}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">创建角色</span>
                  <span className="font-semibold text-gray-900">{modalRecord.user?.roleName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">初始备注</span>
                  <span className="font-semibold text-gray-900">{modalRecord.note || '无'}</span>
                </div>
              </div>

              {/* 修改金额 */}
              <div className="bg-[#F2F2F7] p-4 rounded-2xl">
                <label className="block text-xs font-semibold text-gray-500 mb-2">修改金额 ({modalRecord.currency})</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white rounded-xl border-transparent focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] outline-none text-gray-900 font-semibold"
                  />
                  <button
                    onClick={handleUpdateAmount}
                    disabled={loading || Number(newAmount) === Math.abs(modalRecord.amount)}
                    className="px-4 py-2 bg-[#007AFF] text-white rounded-xl font-semibold disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              </div>

              {/* 跟进日志 */}
              <div>
                <h4 className="text-sm font-bold text-gray-800 mb-3">跟进日志</h4>
                <div className="space-y-3 mb-4 max-h-40 overflow-y-auto pr-2">
                  {modalRecord.remarkLogs?.map((log: any) => (
                    <div key={log.id} className="bg-gray-50 p-3 rounded-xl text-sm border border-gray-100">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium text-gray-700">{log.user?.roleName}</span>
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-gray-800">{log.content}</p>
                    </div>
                  ))}
                  {(!modalRecord.remarkLogs || modalRecord.remarkLogs.length === 0) && (
                    <div className="text-xs text-gray-400 text-center py-2">暂无跟进日志</div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRemark}
                    onChange={e => setNewRemark(e.target.value)}
                    placeholder="输入新备注..."
                    className="flex-1 px-4 py-2 bg-[#F2F2F7] rounded-xl border-transparent focus:bg-white focus:ring-2 focus:ring-[#007AFF]/30 outline-none text-sm"
                  />
                  <button
                    onClick={handleAddRemark}
                    disabled={loading || !newRemark.trim()}
                    className="px-4 py-2 bg-gray-800 text-white rounded-xl font-semibold disabled:opacity-50 text-sm"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
