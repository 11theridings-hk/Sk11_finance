'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LOCALE_COOKIE, createTranslator, type Locale } from '@/lib/i18n'

export default function TopNav({ session, pendingCount = 0, locale }: { session: any, pendingCount?: number, locale: Locale }) {
  const pathname = usePathname()
  const t = createTranslator(locale)
  
  const navItems = [
    { name: t('home'), href: '/' },
  ]
  
  if (session?.isAdmin) {
    navItems.push({ name: t('review'), href: '/review' })
  }
  
  navItems.push({ name: t('contracts'), href: '/contracts' })
  navItems.push({ name: t('report'), href: '/report' })
  
  if (session?.isAdmin) {
    navItems.push({ name: t('admin'), href: '/admin' })
  }

  const handleLocaleChange = (nextLocale: string) => {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-3 text-lg font-semibold bg-[#F2F2F7] sticky top-0 z-10 pt-2 px-4 sm:px-0">
      <nav className="flex space-x-6 overflow-x-auto whitespace-nowrap hide-scrollbar min-w-0">
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link 
              key={item.href}
              href={item.href} 
              className={`relative transition-colors ${isActive ? 'text-[#007AFF] border-b-2 border-[#007AFF] pb-1' : 'text-gray-500 hover:text-gray-800 pb-1'}`}
            >
              {item.name}
              {item.name === t('review') && pendingCount > 0 && (
                <span className="absolute -top-1 -right-3 bg-[#FF3B30] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none shadow-sm">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-600 shrink-0">
        <span>{t('language')}</span>
        <select
          value={locale}
          onChange={(e) => handleLocaleChange(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none"
          aria-label={t('chooseLanguage')}
        >
          <option value="zh-HK">{t('traditionalChinese')}</option>
          <option value="en">{t('english')}</option>
        </select>
      </label>
    </div>
  )
}
