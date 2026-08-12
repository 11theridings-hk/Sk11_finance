import { getCategories } from "../actions/category";
import { getAttachments } from "../actions/record";
import { getCapitalPools } from "../actions/pool";
import { getUsers } from "../actions/user";
import AdminTabs from "./AdminTabs";

export const metadata = {
  title: "管理后台",
};

export default async function AdminPage() {
  // 获取各个模块的数据
  const categories = await getCategories();
  const attachments = await getAttachments();
  const pools = await getCapitalPools();
  const users = await getUsers();

  return (
    <div className="bg-[#F2F2F7] min-h-screen">
      {/* 顶部标题栏 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="text-[#007AFF] text-sm font-semibold hover:opacity-80">
              ‹ 返回首页
            </a>
            <h1 className="text-lg font-bold text-gray-900">管理后台</h1>
          </div>
        </div>
      </header>

      {/* 选项卡及内容组件 */}
      <main>
        <AdminTabs
          initialCategories={categories}
          initialAttachments={attachments}
          initialPools={pools}
          initialUsers={users}
        />
      </main>
    </div>
  );
}
