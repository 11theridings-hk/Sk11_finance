"use client";

import { useState } from "react";
import { createCategory, updateCategory, deleteCategory } from "../actions/category";
import { createCapitalPool, updateCapitalPool, deleteCapitalPool } from "../actions/pool";
import { createUser, updateUser, deleteUser, toggleUserPool } from "../actions/user";
import { createTranslator, formatCurrency, type Locale } from "@/lib/i18n";

export default function AdminTabs({ initialCategories, initialAttachments, initialPools, initialUsers, locale }: any) {
  const t = createTranslator(locale as Locale);
  const [activeTab, setActiveTab] = useState("category");
  
  const tabs = [
    { id: "category", label: t('categoryManagement') },
    { id: "attachment", label: t('attachmentManagement') },
    { id: "pool", label: t('poolManagement') },
    { id: "user", label: t('userManagement') },
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
        {activeTab === "category" && <CategoryTab categories={initialCategories} locale={locale} />}
        {activeTab === "attachment" && <AttachmentTab attachments={initialAttachments} locale={locale} />}
        {activeTab === "pool" && <PoolTab pools={initialPools} users={initialUsers} locale={locale} />}
        {activeTab === "user" && <UserTab users={initialUsers} locale={locale} />}
      </div>
    </div>
  );
}

// ---------------- 分类管理组件 ----------------
function CategoryTab({ categories, locale }: { categories: any[], locale: Locale }) {
  const t = createTranslator(locale);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [loading, setLoading] = useState(false);
  const [addingSubCatTo, setAddingSubCatTo] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState("");

  const handleCreateMain = async () => {
    if (!newCatName.trim()) return;
    setLoading(true);
    await createCategory(newCatName.trim(), undefined, newCatType);
    setNewCatName("");
    setLoading(false);
  };

  const handleCreateSub = async (parentId: string) => {
    if (!newSubCatName.trim()) return;
    setLoading(true);
    await createCategory(newSubCatName.trim(), parentId);
    setNewSubCatName("");
    setAddingSubCatTo(null);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteCategoryConfirm'))) {
      await deleteCategory(id);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('categoryManagement')}</h2>
      
      {/* 添加新主分类 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-[#F2F2F7] p-4 rounded-2xl">
        <input
          type="text"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder={t('newMainCategoryName')}
          className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm transition-all text-gray-900 placeholder-gray-400"
        />
        <select
          value={newCatType}
          onChange={(e) => setNewCatType(e.target.value as "INCOME" | "EXPENSE")}
          className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
        >
          <option value="EXPENSE">{t('expenseCategory')}</option>
          <option value="INCOME">{t('incomeCategory')}</option>
        </select>
        <button
          onClick={handleCreateMain}
          disabled={loading}
          className="px-6 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 transition-all shadow-sm"
        >
          {t('addCategory')}
        </button>
      </div>

      {/* 分类列表 */}
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-[#F2F2F7]/50">
              <div className="flex items-center gap-2">
                <span className="text-gray-900 font-semibold text-base">{cat.name}</span>
                {cat.name !== "未分类" && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${cat.type === 'INCOME' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'}`}>
                    {cat.type === 'INCOME' ? t('income') : t('expense')}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {cat.name !== "未分类" && (
                  <>
                    <button
                      onClick={() => setAddingSubCatTo(cat.id)}
                      className="text-[#007AFF] hover:text-[#0066CC] text-sm font-semibold px-2 py-1"
                    >
                      {t('addSubCategory')}
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold px-2 py-1"
                    >
                      {t('delete')}
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="p-3 bg-white space-y-2">
              {addingSubCatTo === cat.id && (
                <div className="flex gap-2 mb-3 pl-4 border-l-2 border-[#007AFF]/30">
                  <input
                    type="text"
                    value={newSubCatName}
                    onChange={(e) => setNewSubCatName(e.target.value)}
                    placeholder={t('subCategory')}
                    className="flex-1 px-3 py-2 bg-[#F2F2F7] border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
                    autoFocus
                  />
                  <button
                    onClick={() => handleCreateSub(cat.id)}
                    disabled={loading}
                    className="px-4 py-2 bg-[#007AFF] text-white rounded-lg text-sm font-semibold"
                  >
                    {t('save')}
                  </button>
                  <button
                    onClick={() => setAddingSubCatTo(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold"
                  >
                    {t('cancel')}
                  </button>
                </div>
              )}
              
              {cat.children && cat.children.length > 0 ? (
                <div className="space-y-1.5 pl-4 border-l-2 border-gray-100">
                  {cat.children.map((sub: any) => (
                    <div key={sub.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group">
                      <span className="text-gray-700 text-sm font-medium">{sub.name}</span>
                      <button
                        onClick={() => handleDelete(sub.id)}
                        className="text-[#FF3B30] hover:text-[#CC2E26] text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 pl-4 py-1 italic">{t('noSubCategory')}</div>
              )}
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">{t('noCategoryData')}</p>
        )}
      </div>
    </div>
  );
}

// ---------------- 附件管理组件 ----------------
function AttachmentTab({ attachments, locale }: { attachments: any[], locale: Locale }) {
  const t = createTranslator(locale);
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('attachmentManagement')}</h2>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
        {attachments.map((att) => (
          <div key={att.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden flex flex-col shadow-sm">
            <div className="h-32 bg-[#F2F2F7] flex items-center justify-center relative">
              <img src={att.fileUrl} alt={t('attachmentPreview')} className="w-full h-full object-cover" onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }} />
            </div>
            <div className="p-3 bg-white text-xs text-gray-500 flex flex-col gap-1.5">
              <span className="truncate font-medium text-gray-900">{att.uploader?.roleName || t('unknown')}</span>
              <span className="truncate">{t('attachmentCategory')}: {att.category?.name || t('unknown')}</span>
              <span className="truncate">{t('attachmentSize')}: {(att.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        ))}
        {attachments.length === 0 && (
          <div className="col-span-full py-8 text-center text-gray-500 text-sm">
            {t('noAttachmentData')}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- 资金池管理组件 ----------------
function PoolTab({ pools, users, locale }: { pools: any[], users: any[], locale: Locale }) {
  const t = createTranslator(locale);
  const [newPoolName, setNewPoolName] = useState("");
  const [userId, setUserId] = useState("");
  const [isReviewRequired, setIsReviewRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!newPoolName.trim()) return;
    setLoading(true);
    await createCapitalPool(newPoolName.trim(), userId || undefined, isReviewRequired);
    setNewPoolName("");
    setUserId("");
    setIsReviewRequired(false);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deletePoolConfirm'))) {
      const res = await deleteCapitalPool(id);
      if (!res.success) alert(res.error);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('poolManagement')}</h2>
      
      {/* 添加新资金池 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-[#F2F2F7] p-4 rounded-2xl">
        <input
          type="text"
          value={newPoolName}
          onChange={(e) => setNewPoolName(e.target.value)}
          placeholder={t('newPoolName')}
          className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
        />
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900"
        >
          <option value="">{t('publicPool')}</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{t('assignedTo')}: {u.roleName}</option>
          ))}
        </select>
        <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer bg-white px-4 rounded-xl border border-transparent">
          <input
            type="checkbox"
            checked={isReviewRequired}
            onChange={(e) => setIsReviewRequired(e.target.checked)}
            className="mr-2 rounded text-[#007AFF] focus:ring-[#007AFF]"
          />
          {t('reviewAccount')}
        </label>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="px-6 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 transition-all shadow-sm"
        >
          {t('add')}
        </button>
      </div>

      {/* 资金池列表 */}
      <div className="space-y-3">
        {pools.map((pool) => {
          const isDisabled = pool.user && pool.user.poolEnabled === false;
          return (
            <div key={pool.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors shadow-sm ${isDisabled ? 'bg-[#F2F2F7] border-transparent opacity-70' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${isDisabled ? 'text-gray-500' : 'text-gray-900'}`}>
                    {pool.name} {isDisabled && `(${t('disabled')})`}
                  </span>
                  {pool.isReviewRequired && (
                    <span className="px-2 py-0.5 bg-[#FF3B30]/10 text-[#FF3B30] text-[10px] font-bold rounded">{t('reviewAccount')}</span>
                  )}
                  {pool.userId ? (
                    <span className="px-2 py-0.5 bg-[#007AFF]/10 text-[#007AFF] text-[10px] font-bold rounded">{t('assignedTo')}: {pool.user?.roleName}</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded">{t('public')}</span>
                  )}
                </div>
                <span className="text-xs font-medium text-gray-400">
                  {t('poolBalance')}: {formatCurrency(locale, pool.balanceHkd)}
                </span>
              </div>
              <button
                onClick={() => handleDelete(pool.id)}
                className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold px-2 py-1"
              >
                {t('delete')}
              </button>
            </div>
          );
        })}
        {pools.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">{t('noPoolData')}</p>
        )}
      </div>
    </div>
  );
}

// ---------------- 用户管理组件 ----------------
function UserTab({ users, locale }: { users: any[], locale: Locale }) {
  const t = createTranslator(locale);
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
    if (confirm(t('deleteUserConfirm'))) {
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
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('userManagement')}</h2>
      
      {/* 添加新用户 */}
      <div className="bg-[#F2F2F7] p-5 rounded-2xl border-transparent mb-8 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700">{t('addUser')}</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder={t('roleNamePlaceholder')}
            className="flex-1 px-4 py-3 bg-white border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] text-sm text-gray-900 placeholder-gray-400"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('password')}
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
            {t('setAdmin')}
          </label>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold hover:bg-[#0066CC] disabled:opacity-50 shadow-sm disabled:shadow-none"
          >
            {t('addUser')}
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
                    {t('admin')}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(user.id)}
                className="text-[#FF3B30] hover:text-[#CC2E26] text-sm font-semibold"
              >
                {t('delete')}
              </button>
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-500">{t('dedicatedPool')}</span>
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
          <p className="text-gray-500 text-center py-4 text-sm">{t('noUserData')}</p>
        )}
      </div>
    </div>
  );
}
