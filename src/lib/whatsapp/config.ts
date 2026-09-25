/**
 * WhatsApp 設定：支援 gateway（WS-BOT / wwebjs）與 cloud（Meta Cloud API）。
 * Meta 相關程式保留；審批通過後可將 WHATSAPP_PROVIDER=cloud。
 */

export type WhatsAppProvider = 'gateway' | 'cloud' | 'none'

export type WhatsAppConfig = {
  provider: WhatsAppProvider
  verifyToken: string
  accessToken: string
  phoneNumberId: string
  appSecret: string
  apiVersion: string
  /**
   * 環境變數 WHATSAPP_ALLOWED_PHONES 的同步快照（僅供參考）。
   * 實際入站白名單請用 allowlist.ts（優先 SystemSetting／管理後台）。
   */
  allowedPhones: Set<string> | null
  bridgeSecret: string
  gatewayUrl: string
}

function parsePhoneList(raw: string | undefined): Set<string> | null {
  if (!raw || !raw.trim()) return null
  const set = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.replace(/\D/g, ''))
      .filter(Boolean),
  )
  return set.size > 0 ? set : null
}

function isCloudOutboundReady(accessToken: string, phoneNumberId: string) {
  return Boolean(accessToken && phoneNumberId)
}

function isGatewayOutboundReady(gatewayUrl: string, bridgeSecret: string) {
  return Boolean(gatewayUrl && bridgeSecret)
}

/**
 * 讀取 WhatsApp 相關環境變數。
 * provider：WHATSAPP_PROVIDER=gateway|cloud|auto（預設 auto）
 * auto：有閘道 URL+密鑰 → gateway；否則有 Meta token → cloud；否則 none
 */
export function getWhatsAppConfig(): WhatsAppConfig {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || ''
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || ''
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || ''
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0'
  const bridgeSecret = process.env.WHATSAPP_BRIDGE_SECRET?.trim() || ''
  const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL?.trim() || '').replace(/\/$/, '')
  const mode = (process.env.WHATSAPP_PROVIDER?.trim() || 'auto').toLowerCase()

  const cloudOk = isCloudOutboundReady(accessToken, phoneNumberId)
  const gatewayOk = isGatewayOutboundReady(gatewayUrl, bridgeSecret)

  let provider: WhatsAppProvider = 'none'
  if (mode === 'gateway') {
    provider = gatewayOk ? 'gateway' : 'none'
  } else if (mode === 'cloud') {
    provider = cloudOk ? 'cloud' : 'none'
  } else {
    // auto
    if (gatewayOk) provider = 'gateway'
    else if (cloudOk) provider = 'cloud'
    else provider = 'none'
  }

  return {
    provider,
    verifyToken,
    accessToken,
    phoneNumberId,
    appSecret,
    apiVersion,
    allowedPhones: parsePhoneList(process.env.WHATSAPP_ALLOWED_PHONES),
    bridgeSecret,
    gatewayUrl,
  }
}

export function isWhatsAppOutboundReady(config: WhatsAppConfig | null | undefined): boolean {
  if (!config) return false
  return config.provider === 'gateway' || config.provider === 'cloud'
}

/** Meta webhook GET 驗證是否可用 */
export function isWhatsAppCloudVerifyReady(config: WhatsAppConfig): boolean {
  return Boolean(config.verifyToken)
}

export function graphMessagesUrl(config: WhatsAppConfig) {
  return `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`
}

export function gatewaySendUrl(config: WhatsAppConfig) {
  return `${config.gatewayUrl}/api/send`
}
