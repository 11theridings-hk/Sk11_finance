import { getFlatCategories } from '../actions/category'
import { getUsers } from '../actions/user'
import Link from 'next/link'
import ReportClient from './ReportClient'

export const metadata = {
  title: '报表与导出',
}

export default async function ReportPage() {
  const categories = await getFlatCategories()
  const users = await getUsers()

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center">
          <Link href="/" className="text-[#007AFF] text-sm font-semibold hover:opacity-80 flex items-center">
            <span className="text-xl mr-1 leading-none">‹</span> 首页
          </Link>
          <h1 className="text-lg font-bold text-gray-900 ml-4">财务报表导出</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:px-6 lg:px-8 mt-4">
        <ReportClient categories={categories} users={users} />
      </main>
    </div>
  );
}
