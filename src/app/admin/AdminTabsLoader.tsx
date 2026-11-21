'use client'

import dynamic from 'next/dynamic'
import type { Locale } from '@/lib/i18n'
import type { PluginFlags } from '@/lib/plugins'
import type { AISettings } from '../actions/settings'
import type {
  WhatsAppAllowlistSnapshot,
  WhatsAppGroupTarget,
  WhatsAppMessageLogDto,
} from '../actions/whatsapp'

type WhatsAppBindingRow = {
  id: string
  phoneE164: string
  enabled: boolean
  user: { id: string; roleName: string; email: string; isAdmin: boolean }
}

type AdminTabsLoaderProps = {
  initialCategories: unknown[]
  initialAttachments: unknown[]
  initialPools: unknown[]
  initialUsers: unknown[]
  initialAISettings: AISettings
  initialPluginFlags: PluginFlags
  initialWhatsAppBindings: WhatsAppBindingRow[]
  initialWhatsAppAllowlist: WhatsAppAllowlistSnapshot
  initialWhatsAppGroups: WhatsAppGroupTarget[]
  initialWhatsAppLogs: WhatsAppMessageLogDto[]
  locale: Locale
}

const AdminTabs = dynamic(() => import('./AdminTabs'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-5xl px-4 py-10 text-center text-sm text-gray-500">
      Loading admin…
    </div>
  ),
})

export default function AdminTabsLoader(props: AdminTabsLoaderProps) {
  return <AdminTabs {...(props as any)} />
}
