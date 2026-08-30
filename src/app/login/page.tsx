"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../actions/auth";
import { LOCALE_COOKIE, createTranslator, normalizeLocale, type Locale } from "@/lib/i18n";
import { getDefaultHomePath } from "@/lib/access";

export default function LoginPage() {
  const initialLocale = typeof document === "undefined"
    ? "zh-HK"
    : normalizeLocale(document.cookie.match(/(?:^|;\s*)locale=([^;]+)/)?.[1]);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [isAdminTab, setIsAdminTab] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login(password, isAdminTab);
      if (res.success && res.user) {
        if (isAdminTab) {
          router.push("/admin");
        } else {
          router.push(getDefaultHomePath({
            userId: res.user.id,
            roleName: res.user.roleName,
            isAdmin: res.user.isAdmin,
            publicLedgerRole: res.user.publicLedgerRole,
          }));
        }
      } else {
        setError(res.error || t('loginFailed'));
      }
    } catch (err: any) {
      setError(err.message || t('submitFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleLocaleChange = (nextLocale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    setLocale(nextLocale);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F2F2F7] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex justify-end px-4 pt-4">
          <select
            value={locale}
            onChange={(e) => handleLocaleChange(normalizeLocale(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none"
          >
            <option value="zh-HK">{t('traditionalChinese')}</option>
            <option value="en">{t('english')}</option>
          </select>
        </div>
        {/* 顶部选项卡 */}
        <div className="flex border-b">
          <button
            className={`flex-1 py-4 text-center text-sm font-medium transition-colors ${
              !isAdminTab
                ? "border-b-2 border-[#007AFF] text-[#007AFF]"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => {
              setIsAdminTab(false);
              setError("");
              setPassword("");
            }}
          >
            {t('loginUser')}
          </button>
          <button
            className={`flex-1 py-4 text-center text-sm font-medium transition-colors ${
              isAdminTab
                ? "border-b-2 border-[#007AFF] text-[#007AFF]"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => {
              setIsAdminTab(true);
              setError("");
              setPassword("");
            }}
          >
            {t('loginAdmin')}
          </button>
        </div>

        {/* 登录表单 */}
        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">
            {isAdminTab ? t('adminLoginTitle') : t('userLoginTitle')}
          </h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                {t('password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('enterPassword')}
                className="w-full px-4 py-3 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-none transition-all text-gray-900 placeholder-gray-400"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#007AFF] text-white py-3 rounded-xl font-medium hover:bg-[#0066CC] focus:ring-4 focus:ring-[#007AFF]/30 transition-all disabled:opacity-50"
            >
              {loading ? t('loggingIn') : t('login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
