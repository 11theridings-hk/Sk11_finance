"use client";

import { useState } from "react";
import { createCategory, updateCategory, deleteCategory } from "../actions/category";
import { createCapitalPool, updateCapitalPool, deleteCapitalPool } from "../actions/pool";
import { createUser, updateUser, deleteUser, toggleUserPool } from "../actions/user";

export default function AdminTabs({ initialCategories, initialAttachments, initialPools, initialUsers }: any) {
  const [activeTab, setActiveTab] = useState("category");

  // 由于是在 Client Component，我们通过 initial props 获取初始数据
  // 当我们调用 Server Actions 时，它们会调用 revalidatePath，Next.js 会自动刷新 Server Component 并传入新数据
  
  const tabs = [
    { id: "category", label: "分类管理" },
    { id: "attachment", label: "附件管理" },
    { id: "pool", label: "资金池管理" },
    { id: "user", label: "用户管理" },
  ];

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-20 md:pb-0">
      {/* 顶部导航栏 */}
      <div className="bg-[#F2F2F7] sticky top-0 z-10 pt-2 border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-6 overflow-x-auto pb-3 pt-1 scrollbar-hide text-lg font-semibold">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "text-[#007AFF] border-b-2 border-[#007AFF]"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-5xl mx-auto p-4 sm:px-6 lg:px-8 mt-4">
        {activeTab === "category" && <CategoryTab categories={initialCategories} />}
        {activeTab === "attachment" && <AttachmentTab attachments={initialAttachments} />}
        {activeTab === "pool" && <PoolTab pools={initialPools} />}
        {activeTab === "user" && <UserTab users={initialUsers} />}
      </div>
    </div>
  );
}

// ---------------- 分类管理组件 ----------------
function CategoryTab({ categories }: { categories: any[] }) {
  const [newCatName, setNewCatName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!newCatName.trim()) return;
    setLoading(true);
    await createCategory(newCatName.trim());
    setNewCatName("");
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除该分类吗？关联的记录将被移至“未分类”。")) {
      await deleteCategory(id);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">分类管理</h2>
      
      {/* 添加新分类 */}
      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder="新分类名称"
          className="flex-1 px-4 py-3 bg-[#F2F2F7] border-transparent rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm transition-all text-gray-900 placeholder-gray-400"
        />
        <button
          onClick={handleCreate}
          disabled={loading}
          className="px-6 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 transition-all shadow-sm disabled:shadow-none"
        >
          添加
        </button>
      </div>

      {/* 分类列表 */}
      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-gray-200 transition-colors">
            <span className="text-gray-900 font-medium">{cat.name}</span>
            {cat.name !== "未分类" && (
              <button
                onClick={() => handleDelete(cat.id)}
                className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold px-2 py-1"
              >
                删除
              </button>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">暂无分类数据</p>
        )}
      </div>
    </div>
  );
}

// ---------------- 附件管理组件 ----------------
function AttachmentTab({ attachments }: { attachments: any[] }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">附件管理</h2>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
        {attachments.map((att) => (
          <div key={att.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden flex flex-col shadow-sm">
            <div className="h-32 bg-[#F2F2F7] flex items-center justify-center relative">
              {/* 假设是图片附件，直接显示。如果是其他文件，可根据需要调整 */}
              <img src={att.fileUrl} alt="附件" className="w-full h-full object-cover" onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=File';
              }} />
            </div>
            <div className="p-3 bg-white text-xs text-gray-500 flex flex-col gap-1.5">
              <span className="truncate font-medium text-gray-900">{att.uploader?.roleName || '未知'}</span>
              <span className="truncate">分类: {att.category?.name || '未知'}</span>
              <span className="truncate">大小: {(att.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        ))}
        {attachments.length === 0 && (
          <div className="col-span-full py-8 text-center text-gray-500 text-sm">
            暂无附件数据
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- 资金池管理组件 ----------------
function PoolTab({ pools }: { pools: any[] }) {
  const [newPoolName, setNewPoolName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!newPoolName.trim()) return;
    setLoading(true);
    await createCapitalPool(newPoolName.trim());
    setNewPoolName("");
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除该资金池吗？（仅在无关联记录时可删除）")) {
      const res = await deleteCapitalPool(id);
      if (!res.success) alert(res.error);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">资金池管理</h2>
      
      {/* 添加新资金池 */}
      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={newPoolName}
          onChange={(e) => setNewPoolName(e.target.value)}
          placeholder="新资金池名称"
          className="flex-1 px-4 py-3 bg-[#F2F2F7] border-transparent rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm transition-all text-gray-900 placeholder-gray-400"
        />
        <button
          onClick={handleCreate}
          disabled={loading}
          className="px-6 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 transition-all shadow-sm disabled:shadow-none"
        >
          添加
        </button>
      </div>

      {/* 资金池列表 */}
      <div className="space-y-3">
        {pools.map((pool) => {
          // 如果关联用户已禁用资金池，则显示为置灰状态
          const isDisabled = pool.user && pool.user.poolEnabled === false;
          return (
            <div key={pool.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors shadow-sm ${isDisabled ? 'bg-[#F2F2F7] border-transparent opacity-70' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
              <div className="flex flex-col">
                <span className={`font-semibold ${isDisabled ? 'text-gray-500' : 'text-gray-900'}`}>
                  {pool.name} {isDisabled && '(已禁用)'}
                </span>
                <span className="text-xs font-medium text-gray-400 mt-1">
                  HKD: {pool.balanceHkd} | RMB: {pool.balanceRmb}
                </span>
              </div>
              <button
                onClick={() => handleDelete(pool.id)}
                className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold px-2 py-1"
              >
                删除
              </button>
            </div>
          );
        })}
        {pools.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">暂无资金池数据</p>
        )}
      </div>
    </div>
  );
}

// ---------------- 用户管理组件 ----------------
function UserTab({ users }: { users: any[] }) {
  const [newPassword, setNewPassword] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!newPassword.trim() || !newRoleName.trim()) return;
    setLoading(true);
    const res = await createUser({
      password: newPassword.trim(),
      roleName: newRoleName.trim(),
      isAdmin
    });
    if (!res.success) alert(res.error);
    else {
      setNewPassword("");
      setNewRoleName("");
      setIsAdmin(false);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除该用户吗？")) {
      const res = await deleteUser(id);
      if (!res.success) alert(res.error);
    }
  };

  const handleTogglePool = async (id: string, enabled: boolean) => {
    const res = await toggleUserPool(id, enabled);
    if (!res.success) alert(res.error);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">用户管理</h2>
      
      {/* 添加新用户 */}
      <div className="bg-[#F2F2F7] p-5 rounded-2xl border-transparent mb-8 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700">添加新用户</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="角色名称 (如: 张三)"
            className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="登录密码"
            className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="mr-2.5 rounded text-[#007AFF] focus:ring-[#007AFF]"
            />
            设为管理员
          </label>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 shadow-sm disabled:shadow-none"
          >
            添加用户
          </button>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="space-y-4">
        {users.map((user) => (
          <div key={user.id} className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:border-gray-200 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="font-semibold text-gray-900 text-lg mr-3">{user.roleName}</span>
                {user.isAdmin && (
                  <span className="inline-block px-2.5 py-1 bg-[#007AFF]/10 text-[#007AFF] text-xs font-semibold rounded-md">
                    管理员
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(user.id)}
                className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold"
              >
                删除
              </button>
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-500">专属资金池</span>
              <label className="flex items-center cursor-pointer relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={user.poolEnabled}
                  onChange={(e) => handleTogglePool(user.id, e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#34C759]"></div>
              </label>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">暂无用户数据</p>
        )}
      </div>
    </div>
  );
}
