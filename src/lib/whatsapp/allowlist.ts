import prisma from '@/lib/prisma'
import { normalizePhoneE164, phonesMatch } from './phone'

/** SystemSetting key：管理後台可編輯的 WhatsApp 白名單（逗號分隔 E.164） */
export const WHATSAPP_ALLOWED_PHONES_KEY = 'whatsapp.allowed_phones'

export type AllowedPhonesSource = 'db' | 'env' | 'none'

export type WhatsAppAllowedPhonesState = {
  /** 目前有效清單（已正規化） */
  phones: string[]
  source: AllowedPhonesSource
  /**
   * 要強制白名單時為 Set；未設定任何來源時為 null（不檢查白名單）。
   * DB 列存在時即使為空陣列也會強制（＝全部拒絕）。
   */
  enforced: Set<string> | null
}

export function parseAllowedPhoneList(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;\s]+/)) {
    const n = normalizePhoneE164(part)
    if (!n || n.length < 8) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function serializeAllowedPhoneList(phones: string[]): string {
  return parseAllowedPhoneList(phones.join(',')).join(',')
}

/**
 * 讀取有效白名單：優先 SystemSetting；否則退回 WHATSAPP_ALLOWED_PHONES。
 */
export async function getWhatsAppAllowedPhones(): Promise<WhatsAppAllowedPhonesState> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: WHATSAPP_ALLOWED_PHONES_KEY },
    })
    if (row) {
      const phones = parseAllowedPhoneList(row.value)
      return { phones, source: 'db', enforced: new Set(phones) }
    }
  } catch {
    // 遷移尚未套用時退回環境變數
  }

  const envPhones = parseAllowedPhoneList(process.env.WHATSAPP_ALLOWED_PHONES)
  if (envPhones.length > 0) {
    return { phones: envPhones, source: 'env', enforced: new Set(envPhones) }
  }

  return { phones: [], source: 'none', enforced: null }
}

export function isPhoneInAllowlist(
  phoneE164: string,
  enforced: Set<string> | null,
): boolean {
  if (!enforced) return true
  if (enforced.has(phoneE164)) return true
  return [...enforced].some((p) => phonesMatch(p, phoneE164))
}

/**
 * 寫入白名單至 SystemSetting（之後以此為準，不再只靠環境變數）。
 */
export async function saveWhatsAppAllowedPhones(phones: string[]): Promise<string[]> {
  const normalized = parseAllowedPhoneList(phones.join(','))
  const value = serializeAllowedPhoneList(normalized)
  await prisma.systemSetting.upsert({
    where: { key: WHATSAPP_ALLOWED_PHONES_KEY },
    update: { value },
    create: { key: WHATSAPP_ALLOWED_PHONES_KEY, value },
  })
  return normalized
}
