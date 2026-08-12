"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../actions/auth";

export default function LoginPage() {
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
      if (res.success) {
        if (isAdminTab) {
          router.push("/admin");
        } else {
          router.push("/");
        }
      } else {
        setError(res.error || "登录失败");
      }
    } catch (err: any) {
      setError(err.message || "发生未知错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F2F2F7] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
            普通登录
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
            管理员登录
          </button>
        </div>

        {/* 登录表单 */}
        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">
            {isAdminTab ? "管理员登录" : "用户登录"}
          </h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
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
              {loading ? "登录中..." : "登录"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
