import { NextResponse } from 'next/server'
import { readWhatsAppExport } from '@/lib/whatsapp/reportExport'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ token: string }> }

/**
 * 短時 WhatsApp 報表 PDF 下載（無需登入；憑 token + TTL）。
 */
export async function GET(_req: Request, context: RouteContext) {
  const { token } = await context.params
  const result = await readWhatsAppExport(token)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    )
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
