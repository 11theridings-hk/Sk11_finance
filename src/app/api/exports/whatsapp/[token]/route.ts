import { NextResponse } from 'next/server'
import { getSession } from '@/app/actions/auth'
import {
  consumeWhatsAppExport,
  readWhatsAppExport,
} from '@/lib/whatsapp/reportExport'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ token: string }> }

/**
 * WhatsApp 報表 PDF 下載。
 * - 公帳摘要：短時 bearer token（與既有行為相同）
 * - 私帳摘要：必須已登入且 session.userId === 產檔者（對齊網頁私帳權限）
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

  if (result.kind === 'private') {
    const session = await getSession()
    if (!session || session.userId !== result.userId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Private report requires login as the owner. Open this link while signed in to SK11.',
        },
        { status: 401 },
      )
    }
  }

  const response = new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
    },
  })

  if (result.kind === 'private') {
    // 單次下載後作廢，縮短轉發／日誌中的有效窗口
    await consumeWhatsAppExport(token)
  }

  return response
}
