'use client'

import dynamic from 'next/dynamic'
import type { Locale } from '@/lib/i18n'

type ReportClientLoaderProps = {
  categories: unknown[]
  users: unknown[]
  pools: unknown[]
  locale: Locale
}

const ReportClient = dynamic(() => import('./ReportClient'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
      Loading report tools…
    </div>
  ),
})

export default function ReportClientLoader(props: ReportClientLoaderProps) {
  return <ReportClient {...(props as any)} />
}
