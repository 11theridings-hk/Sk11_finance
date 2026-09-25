import { actorCanUsePublicLedger, type WhatsAppActor } from './identity'
import {
  clearPendingAction,
  getPendingAction,
  setPendingAction,
  type PendingLedgerDraft,
} from './pending'
import {
  createPublicLedgerForWhatsApp,
  getMonthSummaryAdmin,
  getRecentRecordsForUser,
  listPools,
  listTopCategories,
  resolveCategoryPath,
  resolveDefaultPool,
} from './ledger'
import { collectWhatsAppReminders, formatRemindersMessage } from './reminders'
import { parseWhatsAppLlmIntent, type WhatsAppLlmIntent } from './llmInbound'
import { createWhatsAppMonthReportPdf } from './reportExport'
import { detectWhatsAppLocale, type WhatsAppLocale } from './locale'

function helpText(actor: WhatsAppActor, locale: WhatsAppLocale) {
  if (locale === 'en') {
    const lines = [
      `Hi, ${actor.roleName} 👋`,
      'Commands (natural language also works):',
      '',
      '• help',
      '• remind → contracts / matters / recurring due',
      '• recent → your recent public-ledger entries',
      '• categories',
      '• pools',
    ]
    if (actor.isAdmin) {
      lines.push('• report → this month text summary')
      lines.push('• report pdf → English PDF (short-lived download link)')
    }
    if (actorCanUsePublicLedger(actor)) {
      lines.push(
        '',
        'Ledger entry (reply confirm):',
        '• ledger expense 120 food lunch',
        '• ledger income 5000 rent',
        '• expense 88.5 transport taxi @MainPool',
        '',
        'Format: [ledger] <expense|income> <amount> [category] [note…] [@pool]',
        'Chinese「公帳 …」still works.',
      )
    }
    lines.push('', 'Cancel pending: cancel')
    lines.push('Groups: broadcast only; chat 1:1 with the bot.')
    return lines.join('\n')
  }

  const lines = [
    `你好，${actor.roleName} 👋`,
    '可用指令（亦可口語／英文；英文會用英文回覆）：',
    '',
    '• 幫助 / help',
    '• 提醒　→ 合約／事項／恆常到期一覽',
    '• 最近　→ 你最近的公帳紀錄',
    '• 分類　→ 列出常用分類',
    '• 資金池',
  ]
  if (actor.isAdmin) {
    lines.push('• 報表　→ 本月收支文字摘要')
    lines.push('• 報表PDF　→ 產生本月摘要 PDF（短時下載連結）')
  }
  if (actorCanUsePublicLedger(actor)) {
    lines.push(
      '',
      '公帳入數（需回覆「確認」／confirm）：',
      '• 公帳 支 120 餐飲 午餐',
      '• ledger expense 120 food lunch',
      '',
      '格式：公帳 <收|支> <金額> [分類] [備註…] [@資金池]',
    )
  }
  lines.push('', '取消待確認：取消 / cancel')
  lines.push('群組只收系統推播；互動請用 1 對 1 對話。')
  return lines.join('\n')
}

function parseLedgerCommand(text: string): {
  type: 'INCOME' | 'EXPENSE'
  amountAbs: number
  categoryHint?: string
  note?: string
  poolHint?: string
} | null {
  const zh = text.match(
    /^公帳\s*(支|支出|收|收入)\s*([\d]+(?:\.\d{1,2})?)\s*(.*)$/i,
  )
  if (zh) {
    const type: 'INCOME' | 'EXPENSE' =
      zh[1] === '收' || zh[1] === '收入' ? 'INCOME' : 'EXPENSE'
    const amountAbs = Number(zh[2])
    if (!Number.isFinite(amountAbs) || amountAbs <= 0) return null
    let rest = (zh[3] || '').trim()
    let poolHint: string | undefined
    const atIdx = rest.lastIndexOf('@')
    if (atIdx >= 0) {
      poolHint = rest.slice(atIdx + 1).trim() || undefined
      rest = rest.slice(0, atIdx).trim()
    }
    const parts = rest.split(/\s+/).filter(Boolean)
    return {
      type,
      amountAbs,
      categoryHint: parts[0],
      note: parts.slice(1).join(' ') || undefined,
      poolHint,
    }
  }

  const en = text.match(
    /^(?:ledger\s+)?(expense|exp|spend|income|inc)\s+([\d]+(?:\.\d{1,2})?)\s*(.*)$/i,
  )
  if (!en) return null
  const type: 'INCOME' | 'EXPENSE' = /^(income|inc)$/i.test(en[1]!)
    ? 'INCOME'
    : 'EXPENSE'
  const amountAbs = Number(en[2])
  if (!Number.isFinite(amountAbs) || amountAbs <= 0) return null
  let rest = (en[3] || '').trim()
  let poolHint: string | undefined
  const atIdx = rest.lastIndexOf('@')
  if (atIdx >= 0) {
    poolHint = rest.slice(atIdx + 1).trim() || undefined
    rest = rest.slice(0, atIdx).trim()
  }
  const parts = rest.split(/\s+/).filter(Boolean)
  return {
    type,
    amountAbs,
    categoryHint: parts[0],
    note: parts.slice(1).join(' ') || undefined,
    poolHint,
  }
}

async function handleConfirm(
  actor: WhatsAppActor,
  localeHint: WhatsAppLocale,
): Promise<string> {
  const pending = await getPendingAction(actor.phoneE164)
  const locale = pending?.locale || localeHint
  if (!pending || pending.kind !== 'ledger') {
    return locale === 'en'
      ? 'No pending ledger entry. Send help for commands.'
      : '沒有待確認的公帳入數。可傳送「幫助」查看指令。'
  }
  if (pending.userId !== actor.userId) {
    await clearPendingAction(actor.phoneE164)
    return locale === 'en'
      ? 'Pending data does not match this user; cleared. Please re-enter.'
      : '待確認資料與目前用戶不符，已清除。請重新輸入。'
  }

  const { record, status, amount } = await createPublicLedgerForWhatsApp({
    actor,
    type: pending.type,
    amountAbs: Math.abs(pending.amount),
    categoryId: pending.categoryId,
    subCategoryId: pending.subCategoryId,
    thirdCategoryId: pending.thirdCategoryId,
    poolId: pending.poolId,
    note: pending.note,
    date: new Date(pending.dateIso),
  })
  await clearPendingAction(actor.phoneE164)

  const sign = amount >= 0 ? '+' : ''
  const statusLabel =
    locale === 'en'
      ? status === 'PENDING'
        ? 'Pending approval'
        : status === 'PENDING_PAYMENT'
          ? 'Pending payment'
          : 'Completed'
      : status === 'PENDING'
        ? '待審批'
        : status === 'PENDING_PAYMENT'
          ? '待付款'
          : '已完成'

  if (locale === 'en') {
    return [
      '✅ Posted',
      `${pending.type === 'INCOME' ? 'Income' : 'Expense'} ${sign}${amount.toFixed(2)} HKD`,
      `Category: ${pending.categoryLabel}`,
      pending.poolLabel ? `Pool: ${pending.poolLabel}` : null,
      pending.note ? `Note: ${pending.note}` : null,
      `Status: ${statusLabel}`,
      `Id: ${record.id.slice(0, 8)}…`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '✅ 已入帳',
    `${pending.type === 'INCOME' ? '收入' : '支出'} ${sign}${amount.toFixed(2)} HKD`,
    `分類：${pending.categoryLabel}`,
    pending.poolLabel ? `資金池：${pending.poolLabel}` : null,
    pending.note ? `備註：${pending.note}` : null,
    `狀態：${statusLabel}`,
    `單號：${record.id.slice(0, 8)}…`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function prepareLedger(
  actor: WhatsAppActor,
  parsed: NonNullable<ReturnType<typeof parseLedgerCommand>>,
  locale: WhatsAppLocale,
): Promise<string> {
  if (!actorCanUsePublicLedger(actor)) {
    return locale === 'en'
      ? 'You do not have public-ledger permission.'
      : '你沒有公帳權限，無法經 WhatsApp 入數。'
  }

  const cat = await resolveCategoryPath(parsed.type, parsed.categoryHint)
  const pool = await resolveDefaultPool(actor, parsed.poolHint)

  const draft: PendingLedgerDraft = {
    kind: 'ledger',
    type: parsed.type,
    amount: parsed.amountAbs,
    categoryId: cat.categoryId,
    categoryLabel: cat.label,
    subCategoryId: cat.subCategoryId,
    thirdCategoryId: cat.thirdCategoryId,
    poolId: pool.poolId,
    poolLabel: pool.poolLabel,
    note: parsed.note,
    dateIso: new Date().toISOString(),
    createdAt: Date.now(),
    userId: actor.userId,
    locale,
  }
  await setPendingAction(actor.phoneE164, draft)

  if (locale === 'en') {
    return [
      'Please confirm this ledger entry (valid 5 minutes):',
      `${parsed.type === 'INCOME' ? 'Income' : 'Expense'} ${parsed.amountAbs.toFixed(2)} HKD`,
      `Category: ${cat.label}${parsed.categoryHint ? '' : ' (default / uncategorized)'}`,
      pool.poolLabel ? `Pool: ${pool.poolLabel}` : 'Pool: (none)',
      parsed.note ? `Note: ${parsed.note}` : null,
      '',
      'Reply confirm to submit, or cancel to abort.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '請確認公帳入數（5 分鐘內有效）：',
    `${parsed.type === 'INCOME' ? '收入' : '支出'} ${parsed.amountAbs.toFixed(2)} HKD`,
    `分類：${cat.label}${parsed.categoryHint ? '' : '（未指定，用未分类）'}`,
    pool.poolLabel ? `資金池：${pool.poolLabel}` : '資金池：（無）',
    parsed.note ? `備註：${parsed.note}` : null,
    '',
    '回覆「確認」提交，或「取消」放棄。',
  ]
    .filter(Boolean)
    .join('\n')
}

async function handleReportSummary(
  actor: WhatsAppActor,
  locale: WhatsAppLocale,
): Promise<string> {
  if (!actor.isAdmin) {
    return locale === 'en'
      ? 'Report summary is admin-only.'
      : '報表摘要僅管理員可用。'
  }
  const s = await getMonthSummaryAdmin()
  if (locale === 'en') {
    return [
      `📊 ${s.year}/${s.month} public ledger summary`,
      `Entries: ${s.count}`,
      `Income: +${s.income.toFixed(2)}`,
      `Expense: -${s.expense.toFixed(2)}`,
      `Net: ${s.net >= 0 ? '+' : ''}${s.net.toFixed(2)}`,
      `Pools total: ${s.poolTotal.toFixed(2)} HKD`,
      '',
      'For PDF: send report pdf (short-lived download link).',
    ].join('\n')
  }
  return [
    `📊 ${s.year}/${s.month} 公帳摘要`,
    `筆數：${s.count}`,
    `收入：+${s.income.toFixed(2)}`,
    `支出：-${s.expense.toFixed(2)}`,
    `淨額：${s.net >= 0 ? '+' : ''}${s.net.toFixed(2)}`,
    `資金池合計：${s.poolTotal.toFixed(2)} HKD`,
    '',
    '需要 PDF：傳送「報表PDF」（短時下載連結，不經聊天傳檔）。',
  ].join('\n')
}

async function handleReportPdf(
  actor: WhatsAppActor,
  locale: WhatsAppLocale,
): Promise<string> {
  if (!actor.isAdmin) {
    return locale === 'en'
      ? 'Report PDF is admin-only.'
      : '報表 PDF 僅管理員可用。'
  }
  const created = await createWhatsAppMonthReportPdf({
    userId: actor.userId,
    locale,
  })
  if (!created.ok) {
    return locale === 'en'
      ? `PDF failed: ${created.error}`
      : `產生 PDF 失敗：${created.error}`
  }
  const mins = Math.max(1, Math.round((created.expiresAt - Date.now()) / 60000))
  if (locale === 'en') {
    return [
      `📄 ${created.summaryLabel} summary PDF ready (English)`,
      `Download (≈${mins} min):`,
      created.url,
      '',
      'Link expired? Send report pdf again. Full packs: web export.',
    ].join('\n')
  }
  return [
    `📄 ${created.summaryLabel} 公帳摘要 PDF 已備妥`,
    `下載（約 ${mins} 分鐘內有效）：`,
    created.url,
    '',
    '連結過期後請再傳送「報表PDF」。完整會計包請用網頁匯出。',
  ].join('\n')
}

async function dispatchIntent(
  actor: WhatsAppActor,
  intent: WhatsAppLlmIntent,
  locale: WhatsAppLocale,
): Promise<string | null> {
  const minConfidence = Number(process.env.WHATSAPP_LLM_MIN_CONFIDENCE || 0.55)
  if (intent.confidence < minConfidence) return null

  switch (intent.intent) {
    case 'help':
      return helpText(actor, locale)
    case 'reminders': {
      const items = await collectWhatsAppReminders(actor)
      return formatRemindersMessage(items, locale)
    }
    case 'recent': {
      if (!actorCanUsePublicLedger(actor)) {
        return locale === 'en' ? 'No public-ledger permission.' : '沒有公帳權限。'
      }
      const rows = await getRecentRecordsForUser(actor.userId, 5)
      if (rows.length === 0) {
        return locale === 'en' ? 'No ledger entries yet.' : '尚無公帳紀錄。'
      }
      const lines = [locale === 'en' ? '🧾 Recent ledger:' : '🧾 最近公帳：', '']
      for (const r of rows) {
        const sign = r.amount >= 0 ? '+' : ''
        const kind =
          locale === 'en'
            ? r.type === 'INCOME'
              ? 'in'
              : 'out'
            : r.type === 'INCOME'
              ? '收'
              : '支'
        lines.push(
          `• ${r.date.toISOString().slice(0, 10)} ${kind} ${sign}${r.amount.toFixed(2)}`,
          `  ${r.category?.name || '—'}${r.note ? `｜${r.note}` : ''}`,
        )
      }
      return lines.join('\n')
    }
    case 'categories': {
      const [ex, inc] = await Promise.all([
        listTopCategories('EXPENSE'),
        listTopCategories('INCOME'),
      ])
      if (locale === 'en') {
        return [
          '📂 Categories (sample)',
          '',
          'Expense: ' + (ex.join(', ') || '(none)'),
          'Income: ' + (inc.join(', ') || '(none)'),
        ].join('\n')
      }
      return [
        '📂 分類（部分）',
        '',
        '支出：' + (ex.join('、') || '（無）'),
        '收入：' + (inc.join('、') || '（無）'),
      ].join('\n')
    }
    case 'pools': {
      const pools = await listPools()
      if (pools.length === 0) {
        return locale === 'en' ? 'No pools yet.' : '尚未建立資金池。'
      }
      return [
        locale === 'en' ? '🏦 Pools' : '🏦 資金池',
        '',
        ...pools.map((p) => `• ${p.name}：${p.balanceHkd.toFixed(2)} HKD`),
      ].join('\n')
    }
    case 'report_summary':
      return handleReportSummary(actor, locale)
    case 'report_pdf':
      return handleReportPdf(actor, locale)
    case 'ledger_draft':
      return prepareLedger(
        actor,
        {
          type: intent.type,
          amountAbs: intent.amountAbs,
          categoryHint: intent.categoryHint,
          note: intent.note,
          poolHint: intent.poolHint,
        },
        locale,
      )
    default:
      return null
  }
}

/**
 * 處理單則入站文字，回傳要回覆給用戶的訊息。
 * 英文入站 → 英文回覆／英文 PDF；中文則中文。
 */
export async function handleWhatsAppCommand(
  actor: WhatsAppActor,
  rawText: string,
): Promise<string> {
  const text = rawText.replace(/\u200e|\u200f/g, '').trim()
  const locale = detectWhatsAppLocale(text)
  if (!text) return helpText(actor, locale)

  const lower = text.toLowerCase()

  if (
    ['幫助', '帮忙', 'help', '?', '？', '選單', '菜单', 'menu'].includes(lower) ||
    text === '幫助'
  ) {
    return helpText(actor, locale)
  }

  if (['確認', '确认', 'confirm', 'ok', '是', 'yes', 'y'].includes(lower)) {
    return handleConfirm(actor, locale)
  }

  if (['取消', 'cancel', '否', 'no', 'n'].includes(lower)) {
    await clearPendingAction(actor.phoneE164)
    return locale === 'en'
      ? 'Pending action cancelled.'
      : '已取消待確認操作。'
  }

  if (
    ['提醒', '事項', '事项', '合約', '合同', '到期'].includes(text) ||
    lower === 'remind' ||
    lower === 'reminder' ||
    lower === 'reminders'
  ) {
    const items = await collectWhatsAppReminders(actor)
    return formatRemindersMessage(items, locale)
  }

  if (['最近', '紀錄', '记录', 'recent'].includes(lower) || text === '最近') {
    if (!actorCanUsePublicLedger(actor)) {
      return locale === 'en' ? 'No public-ledger permission.' : '沒有公帳權限。'
    }
    const rows = await getRecentRecordsForUser(actor.userId, 5)
    if (rows.length === 0) {
      return locale === 'en' ? 'No ledger entries yet.' : '尚無公帳紀錄。'
    }
    const lines = [locale === 'en' ? '🧾 Recent ledger:' : '🧾 最近公帳：', '']
    for (const r of rows) {
      const sign = r.amount >= 0 ? '+' : ''
      const kind =
        locale === 'en'
          ? r.type === 'INCOME'
            ? 'in'
            : 'out'
          : r.type === 'INCOME'
            ? '收'
            : '支'
      lines.push(
        `• ${r.date.toISOString().slice(0, 10)} ${kind} ${sign}${r.amount.toFixed(2)}`,
        `  ${r.category?.name || '—'}${r.note ? `｜${r.note}` : ''}`,
      )
    }
    return lines.join('\n')
  }

  if (
    text === '分類' ||
    text === '分类' ||
    lower === 'categories' ||
    lower === 'category'
  ) {
    const [ex, inc] = await Promise.all([
      listTopCategories('EXPENSE'),
      listTopCategories('INCOME'),
    ])
    if (locale === 'en') {
      return [
        '📂 Categories (sample)',
        '',
        'Expense: ' + (ex.join(', ') || '(none)'),
        'Income: ' + (inc.join(', ') || '(none)'),
        '',
        'You can type a category name when posting an entry.',
      ].join('\n')
    }
    return [
      '📂 分類（部分）',
      '',
      '支出：' + (ex.join('、') || '（無）'),
      '收入：' + (inc.join('、') || '（無）'),
      '',
      '入數時可寫分類名稱，系統會模糊匹配。',
    ].join('\n')
  }

  if (text === '資金池' || text === '资金池' || lower === 'pools' || lower === 'pool') {
    const pools = await listPools()
    if (pools.length === 0) {
      return locale === 'en' ? 'No pools yet.' : '尚未建立資金池。'
    }
    return [
      locale === 'en' ? '🏦 Pools' : '🏦 資金池',
      '',
      ...pools.map((p) => `• ${p.name}：${p.balanceHkd.toFixed(2)} HKD`),
      '',
      locale === 'en'
        ? 'Use @PoolName when posting, e.g. expense 50 food coffee @Main'
        : '入數可用 @資金池名 指定，例如：公帳 支 50 餐飲 咖啡 @公司戶',
    ].join('\n')
  }

  if (
    text === '報表PDF' ||
    text === '报表PDF' ||
    text === '報表 pdf' ||
    lower === 'report pdf' ||
    lower === 'reportpdf' ||
    lower === 'pdf report' ||
    text === 'PDF報表' ||
    text === 'pdf報表'
  ) {
    return handleReportPdf(actor, locale)
  }

  if (
    text === '報表' ||
    text === '报表' ||
    lower === 'report' ||
    text === '摘要' ||
    lower === 'summary'
  ) {
    return handleReportSummary(actor, locale)
  }

  const ledger = parseLedgerCommand(text)
  if (ledger) {
    return prepareLedger(actor, ledger, locale)
  }

  const intent = await parseWhatsAppLlmIntent(text, locale)
  if (intent) {
    const viaLlm = await dispatchIntent(actor, intent, locale)
    if (viaLlm) return viaLlm
  }

  return [
    locale === 'en' ? 'Could not understand that.' : '未能辨識指令。',
    '',
    helpText(actor, locale),
  ].join('\n')
}
