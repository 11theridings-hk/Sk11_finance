'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function TopNav({ session, pendingCount = 0 }: { session: any, pendingCount?: number }) {
  const pathname = usePathname()
  
  const navItems = [
    { name: '首页', href: '/' },
    { name: '应收/付', href: '/ar-ap' },
  ]
  
  if (session?.isAdmin) {
    navItems.push({ name: '审核', href: '/review' })
  }
  
  navItems.push({ name: '归结单', href: '/consolidated' })
  navItems.push({ name: '报表', href: '/report' })
  
  if (session?.isAdmin) {
    navItems.push({ name: '管理后台', href: '/admin' })
  }

  return (
    <nav className="flex space-x-6 border-b border-gray-200 pb-3 text-lg font-semibold bg-[#F2F2F7] sticky top-0 z-10 pt-2 overflow-x-auto whitespace-nowrap hide-scrollbar px-4 sm:px-0">
      {navItems.map(item => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
        return (
          <Link 
            key={item.href}
            href={item.href} 
            className={`relative transition-colors ${isActive ? 'text-[#007AFF] border-b-2 border-[#007AFF] pb-1' : 'text-gray-500 hover:text-gray-800 pb-1'}`}
          >
            {item.name}
            {item.name === '审核' && pendingCount > 0 && (
              <span className="absolute -top-1 -right-3 bg-[#FF3B30] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none shadow-sm">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
