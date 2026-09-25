import {
  getWhatsAppConfig,
  graphMessagesUrl,
  gatewaySendUrl,
  isWhatsAppOutboundReady,
  type WhatsAppConfig,
} from './config'
import { logWhatsAppMessage } from './messageLog'

export type SendTextResult = {
  ok: boolean
  messageId?: string
  error?: string
}

async function sendViaCloud(config: WhatsAppConfig, toDigits: string, text: string): Promise<SendTextResult> {
  try {
    const res = await fetch(graphMessagesUrl(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toDigits,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
      error?: { message?: string }
    }

    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || `Graph API HTTP ${res.status}`,
      }
    }

    return { ok: true, messageId: json.messages?.[0]?.id }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to send WhatsApp message' }
  }
}

async function sendViaGateway(
  config: WhatsAppConfig,
  to: string,
  text: string,
): Promise<SendTextResult> {
  try {
    const res = await fetch(gatewaySendUrl(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.bridgeSecret}`,
        'Content-Type': 'application/json',
      },
      // 群組傳完整 JID（…@g.us）；私人可傳純數字或 …@c.us
      body: JSON.stringify({ to, body: text }),
    })

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      messageId?: string
      error?: string
    }

    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json?.error || `Gateway HTTP ${res.status}`,
      }
    }

    return { ok: true, messageId: json.messageId }
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to send via WhatsApp gateway',
    }
  }
}

function resolveOutboundRecipient(to: string): { kind: 'phone' | 'group'; value: string } | null {
  const raw = String(to || '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.endsWith('@g.us')) {
    const user = raw.slice(0, raw.indexOf('@')).replace(/\D/g, '')
    return user ? { kind: 'group', value: `${user}@g.us` } : null
  }
  if (lower.endsWith('@c.us') || lower.endsWith('@s.whatsapp.net')) {
    const user = raw.slice(0, raw.indexOf('@')).replace(/\D/g, '')
    return user ? { kind: 'phone', value: user } : null
  }
  const digits = raw.replace(/\D/g, '')
  return digits ? { kind: 'phone', value: digits } : null
}

/**
 * 發送純文字。依 WHATSAPP_PROVIDER / 自動偵測走 gateway（WS-BOT）或 Meta Cloud API。
 * to：收件人電話（E.164 純數字）或群組 JID（…@g.us）。群組僅 gateway 支援。
 */
export async function sendWhatsAppText(to: string, body: string): Promise<SendTextResult> {
  const config = getWhatsAppConfig()
  if (!isWhatsAppOutboundReady(config)) {
    const result = { ok: false as const, error: 'WhatsApp outbound not configured' }
    await logWhatsAppMessage({
      direction: 'OUT',
      kind: 'push',
      peer: String(to || ''),
      body,
      status: 'FAILED',
      error: result.error,
    })
    return result
  }

  const recipient = resolveOutboundRecipient(to)
  if (!recipient) {
    const result = { ok: false as const, error: 'Invalid recipient' }
    await logWhatsAppMessage({
      direction: 'OUT',
      kind: 'push',
      peer: String(to || ''),
      body,
      status: 'FAILED',
      error: result.error,
    })
    return result
  }

  const text = body.length > 4000 ? `${body.slice(0, 3990)}…` : body
  const peer = recipient.value

  let result: SendTextResult
  if (recipient.kind === 'group') {
    if (config.provider !== 'gateway') {
      result = { ok: false, error: 'Group send requires WHATSAPP_PROVIDER=gateway' }
    } else {
      result = await sendViaGateway(config, recipient.value, text)
    }
  } else if (config.provider === 'gateway') {
    result = await sendViaGateway(config, recipient.value, text)
  } else {
    result = await sendViaCloud(config, recipient.value, text)
  }

  await logWhatsAppMessage({
    direction: 'OUT',
    kind: 'push',
    peer,
    body: text,
    status: result.ok ? 'OK' : 'FAILED',
    error: result.error || null,
    messageId: result.messageId || null,
    meta: { provider: config.provider, recipientKind: recipient.kind },
  })
  return result
}
