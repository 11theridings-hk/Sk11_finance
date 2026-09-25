import {
  getWhatsAppConfig,
  isWhatsAppOutboundReady,
  type WhatsAppConfig,
} from './config'
import { normalizeGroupJid } from './groups'

export type GatewayGroupInfo = {
  id: string
  name: string
}

export type FetchGatewayGroupsResult = {
  ok: boolean
  groups: GatewayGroupInfo[]
  error?: string
  /** 閘道是否已配置（可嘗試呼叫） */
  gatewayConfigured: boolean
}

function gatewayGroupsUrl(config: WhatsAppConfig) {
  return `${config.gatewayUrl}/api/groups`
}

function parseGatewayGroupList(payload: unknown): GatewayGroupInfo[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const list = (root.groups || root.data || root) as unknown
  if (!Array.isArray(list)) return []

  const seen = new Set<string>()
  const out: GatewayGroupInfo[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const id = normalizeGroupJid(String(rec.id || rec.jid || rec.groupId || ''))
    if (!id || seen.has(id)) continue
    seen.add(id)
    const name = String(rec.name || rec.subject || rec.title || '').trim() || id
    out.push({ id, name })
  }
  return out
}

/**
 * 向 WS-BOT 閘道拉取群組清單：`GET /api/groups`。
 * 閘道未配置或端點不可用時回傳錯誤，供 UI 改走手動輸入 JID。
 */
export async function fetchGatewayWhatsAppGroups(): Promise<FetchGatewayGroupsResult> {
  const config = getWhatsAppConfig()
  const gatewayConfigured = Boolean(config.gatewayUrl && config.bridgeSecret)

  if (!gatewayConfigured) {
    return {
      ok: false,
      groups: [],
      gatewayConfigured: false,
      error: '未設定 WHATSAPP_GATEWAY_URL／WHATSAPP_BRIDGE_SECRET',
    }
  }

  if (!isWhatsAppOutboundReady(config) && config.provider !== 'gateway') {
    // 允許即使 provider=cloud 仍嘗試讀閘道群組（只要 URL+密鑰齊）
  }

  try {
    const res = await fetch(gatewayGroupsUrl(config), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.bridgeSecret}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      groups?: unknown
    }

    if (!res.ok) {
      return {
        ok: false,
        groups: [],
        gatewayConfigured: true,
        error: json?.error || `閘道 HTTP ${res.status}`,
      }
    }

    const groups = parseGatewayGroupList(json)
    return { ok: true, groups, gatewayConfigured: true }
  } catch (e: unknown) {
    return {
      ok: false,
      groups: [],
      gatewayConfigured: true,
      error: e instanceof Error ? e.message : '無法連線閘道',
    }
  }
}
