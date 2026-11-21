import { actorCanUsePublicLedger, type WhatsAppActor } from './identity'
import {
  clearPendingAction,
  getPendingAction,
  setPendingAction,
  type PendingContractDraft,
  type PendingLedgerDraft,
  type PendingMatterDraft,
  type PendingPrivateLedgerDraft,
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
import {
  createPrivateLedgerForWhatsApp,
  getPrivateMonthSummaryForUser,
  getRecentPrivateRecordsForUser,
  resolvePrivateCategoryPath,
} from './privateLedger'
import {
  createMatterForWhatsApp,
  listMattersForWhatsApp,
  loadWhatsAppPluginFlags,
  parseMatterCreateCommand,
  parseYmd,
} from './matters'
import {
  createContractDraftForWhatsApp,
  parseContractDraftCommand,
} from './contracts'
import { collectWhatsAppReminders, formatRemindersMessage } from './reminders'
import { parseWhatsAppLlmIntent, type WhatsAppLlmIntent } from './llmInbound'
import {
  createWhatsAppMonthReportPdf,
  createWhatsAppPrivateMonthReportPdf,
} from './reportExport'
import { detectWhatsAppLocale, type WhatsAppLocale } from './locale'

function helpText(actor: WhatsAppActor, locale: WhatsAppLocale) {
  if (locale === 'en') {
    const lines = [
      `Hi, ${actor.roleName} 👋`,
      'Commands (natural language also works):',
      '',
      '• help',
      '• remind → contracts / matters / recurring due',
      '• recent → recent public-ledger entries',
      '• recent private → your private-ledger entries',
      '• categories',
      '• pools',
      '• matters → list matters',
    ]
    if (actor.isAdmin) {
      lines.push('• report → this month public text summary')
      lines.push('• report pdf → public PDF (short-lived link)')
    }
    lines.push('• private report → your private month summary')
    lines.push('• private report pdf → your private PDF link')
    if (actorCanUsePublicLedger(actor)) {
      lines.push(
        '',
        'Public ledger (reply confirm):',
        '• ledger expense 120 food lunch',
        '• ledger income 5000 rent',
        '',
        'Format: [ledger] <expense|income> <amount> [category] [note…] [@pool]',
      )
    }
    lines.push(
      '',
      'Private ledger 【私帳】(reply confirm):',
      '• private expense 120 lunch',
      '• 私帳 支 80 交通',
      '',
      'Matters (reply confirm):',
      '• matter Pool service|2026-11-25|15|private',
      '• 事項 泳池保養|2026-11-25|15|私人',
    )
    if (actor.isAdmin) {
      lines.push(
        '',
        'Contract draft (admin, reply confirm):',
        '• contract draft Lease|income|2026-01-01|2026-12-31|5000|30',
        '• 合約草稿 租約|收|2026-01-01|2026-12-31|5000|30',
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
    '• 最近　→ 最近公帳紀錄',
    '• 最近私帳　→ 你的私帳紀錄',
    '• 分類　→ 列出常用分類',
    '• 資金池',
    '• 查事項 / matters　→ 事項列表',
  ]
  if (actor.isAdmin) {
    lines.push('• 報表　→ 本月公帳文字摘要')
    lines.push('• 報表PDF　→ 公帳 PDF（短時下載連結）')
  }
  lines.push('• 私帳報表　→ 本月私帳文字摘要（僅本人）')
  lines.push('• 私帳報表PDF　→ 私帳 PDF（短時連結）')
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
  lines.push(
    '',
    '【私帳】入數（需確認；確認卡會標明私帳）：',
    '• 私帳 支 120 午餐',
    '• private expense 120 lunch',
    '',
    '格式：私帳 <收|支> <金額> [分類] [備註…]',
    '',
    '事項建立（需確認）：',
    '• 事項 泳池保養|2026-11-25|15|私人',
    '• matter Pool service|2026-11-25|15|private',
  )
  if (actor.isAdmin) {
    lines.push(
      '',
      '合約草稿（管理員，需確認）：',
      '• 合約草稿 租約|收|2026-01-01|2026-12-31|5000|30',
      '• contract draft Lease|income|2026-01-01|2026-12-31|5000|30',
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
  // 避免吃掉 private expense …
  if (/^private\b/i.test(text)) return null
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

function parsePrivateLedgerCommand(text: string): {
  type: 'INCOME' | 'EXPENSE'
  amountAbs: number
  categoryHint?: string
  note?: string
} | null {
  const zh = text.match(
    /^私帳\s*(支|支出|收|收入)\s*([\d]+(?:\.\d{1,2})?)\s*(.*)$/i,
  )
  if (zh) {
    const type: 'INCOME' | 'EXPENSE' =
      zh[1] === '收' || zh[1] === '收入' ? 'INCOME' : 'EXPENSE'
    const amountAbs = Number(zh[2])
    if (!Number.isFinite(amountAbs) || amountAbs <= 0) return null
    const parts = (zh[3] || '').trim().split(/\s+/).filter(Boolean)
    return {
      type,
      amountAbs,
      categoryHint: parts[0],
      note: parts.slice(1).join(' ') || undefined,
    }
  }

  const en = text.match(
    /^private\s+(expense|exp|spend|income|inc)\s+([\d]+(?:\.\d{1,2})?)\s*(.*)$/i,
  )
  if (!en) return null
  const type: 'INCOME' | 'EXPENSE' = /^(income|inc)$/i.test(en[1]!)
    ? 'INCOME'
    : 'EXPENSE'
  const amountAbs = Number(en[2])
  if (!Number.isFinite(amountAbs) || amountAbs <= 0) return null
  const parts = (en[3] || '').trim().split(/\s+/).filter(Boolean)
  return {
    type,
    amountAbs,
    categoryHint: parts[0],
    note: parts.slice(1).join(' ') || undefined,
  }
}

function formatRecentRows(
  rows: Array<{
    date: Date
    type: string
    amount: number
    category?: { name: true } | { name: string } | null
    note?: string | null
    customCategory?: string | null
  }>,
  locale: WhatsAppLocale,
  labelZh: string,
  labelEn: string,
) {
  const lines = [locale === 'en' ? labelEn : labelZh, '']
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
    const cat =
      ('customCategory' in r && r.customCategory) ||
      r.category?.name ||
      '—'
    lines.push(
      `• ${r.date.toISOString().slice(0, 10)} ${kind} ${sign}${r.amount.toFixed(2)}`,
      `  ${cat}${r.note ? `｜${r.note}` : ''}`,
    )
  }
  return lines.join('\n')
}

async function handleConfirm(
  actor: WhatsAppActor,
  localeHint: WhatsAppLocale,
): Promise<string> {
  const pending = await getPendingAction(actor.phoneE164)
  const locale = pending?.locale || localeHint
  if (!pending) {
    return locale === 'en'
      ? 'No pending action. Send help for commands.'
      : '沒有待確認操作。可傳送「幫助」查看指令。'
  }
  if (pending.userId !== actor.userId) {
    await clearPendingAction(actor.phoneE164)
    return locale === 'en'
      ? 'Pending data does not match this user; cleared. Please re-enter.'
      : '待確認資料與目前用戶不符，已清除。請重新輸入。'
  }

  if (pending.kind === 'ledger') {
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
        '✅ Posted (public ledger)',
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
      '✅ 已入帳（公帳）',
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

  if (pending.kind === 'private_ledger') {
    const { record, amount } = await createPrivateLedgerForWhatsApp({
      actor,
      type: pending.type,
      amountAbs: Math.abs(pending.amount),
      categoryId: pending.categoryId,
      subCategoryId: pending.subCategoryId,
      thirdCategoryId: pending.thirdCategoryId,
      customCategory: pending.customCategory,
      note: pending.note,
      date: new Date(pending.dateIso),
    })
    await clearPendingAction(actor.phoneE164)
    const sign = amount >= 0 ? '+' : ''
    if (locale === 'en') {
      return [
        '✅ Posted 【PRIVATE ledger】',
        `${pending.type === 'INCOME' ? 'Income' : 'Expense'} ${sign}${amount.toFixed(2)} HKD`,
        `Category: ${pending.categoryLabel}`,
        pending.note ? `Note: ${pending.note}` : null,
        `Id: ${record.id.slice(0, 8)}…`,
      ]
        .filter(Boolean)
        .join('\n')
    }
    return [
      '✅ 已入帳【私帳】',
      `${pending.type === 'INCOME' ? '收入' : '支出'} ${sign}${amount.toFixed(2)} HKD`,
      `分類：${pending.categoryLabel}`,
      pending.note ? `備註：${pending.note}` : null,
      `單號：${record.id.slice(0, 8)}…`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (pending.kind === 'matter') {
    const flags = await loadWhatsAppPluginFlags()
    if (!flags.matters) {
      await clearPendingAction(actor.phoneE164)
      return locale === 'en'
        ? 'Matters plugin is disabled.'
        : '事項插件已關閉。'
    }
    const { activity } = await createMatterForWhatsApp({
      actor,
      title: pending.title,
      eventDate: new Date(pending.eventDateIso),
      reminderDays: pending.reminderDays,
      visibility: pending.visibility,
      note: pending.note,
    })
    await clearPendingAction(actor.phoneE164)
    const vis =
      locale === 'en'
        ? pending.visibility === 'PUBLIC'
          ? 'Public'
          : 'Private'
        : pending.visibility === 'PUBLIC'
          ? '公開'
          : '私人'
    if (locale === 'en') {
      return [
        '✅ Matter created',
        pending.title,
        `Date: ${pending.eventDateIso.slice(0, 10)}`,
        `Reminder: ${pending.reminderDays}d · ${vis}`,
        `Id: ${activity.id.slice(0, 8)}…`,
      ].join('\n')
    }
    return [
      '✅ 已建立事項',
      pending.title,
      `日期：${pending.eventDateIso.slice(0, 10)}`,
      `提醒：${pending.reminderDays} 天 · ${vis}`,
      `編號：${activity.id.slice(0, 8)}…`,
    ].join('\n')
  }

  if (pending.kind === 'contract') {
    if (!actor.isAdmin) {
      await clearPendingAction(actor.phoneE164)
      return locale === 'en'
        ? 'Contract create is admin-only.'
        : '建立合約僅管理員可用。'
    }
    const flags = await loadWhatsAppPluginFlags()
    if (!flags.contracts) {
      await clearPendingAction(actor.phoneE164)
      return locale === 'en'
        ? 'Contracts plugin is disabled.'
        : '合約插件已關閉。'
    }
    try {
      const { contract } = await createContractDraftForWhatsApp({
        actor,
        title: pending.title,
        type: pending.type,
        effectiveDate: new Date(pending.effectiveDateIso),
        expiryDate: new Date(pending.expiryDateIso),
        reminderDays: pending.reminderDays,
        amount: pending.amount,
        poolId: pending.poolId,
        note: pending.note,
      })
      await clearPendingAction(actor.phoneE164)
      if (locale === 'en') {
        return [
          '✅ Contract draft created',
          pending.title,
          `${pending.type === 'INCOME' ? 'Income' : 'Expense'} ${pending.amount.toFixed(2)} HKD`,
          `Effective: ${pending.effectiveDateIso.slice(0, 10)}`,
          `Expiry: ${pending.expiryDateIso.slice(0, 10)}`,
          pending.poolLabel ? `Pool: ${pending.poolLabel}` : null,
          `Id: ${contract.id.slice(0, 8)}…`,
        ]
          .filter(Boolean)
          .join('\n')
      }
      return [
        '✅ 已建立合約草稿',
        pending.title,
        `${pending.type === 'INCOME' ? '收入' : '支出'} ${pending.amount.toFixed(2)} HKD`,
        `生效：${pending.effectiveDateIso.slice(0, 10)}`,
        `到期：${pending.expiryDateIso.slice(0, 10)}`,
        pending.poolLabel ? `資金池：${pending.poolLabel}` : null,
        `編號：${contract.id.slice(0, 8)}…`,
      ]
        .filter(Boolean)
        .join('\n')
    } catch (e: unknown) {
      await clearPendingAction(actor.phoneE164)
      const msg = e instanceof Error ? e.message : 'failed'
      return locale === 'en'
        ? `Contract create failed: ${msg}`
        : `建立合約失敗：${msg}`
    }
  }

  await clearPendingAction(actor.phoneE164)
  return locale === 'en'
    ? 'Unknown pending action; cleared.'
    : '未知待確認類型，已清除。'
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
      'Please confirm this PUBLIC ledger entry (valid 5 minutes):',
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

async function preparePrivateLedger(
  actor: WhatsAppActor,
  parsed: NonNullable<ReturnType<typeof parsePrivateLedgerCommand>>,
  locale: WhatsAppLocale,
): Promise<string> {
  const cat = await resolvePrivateCategoryPath(parsed.type, parsed.categoryHint)

  const draft: PendingPrivateLedgerDraft = {
    kind: 'private_ledger',
    type: parsed.type,
    amount: parsed.amountAbs,
    categoryId: cat.categoryId,
    categoryLabel: cat.label,
    subCategoryId: cat.subCategoryId,
    thirdCategoryId: cat.thirdCategoryId,
    customCategory: parsed.categoryHint,
    note: parsed.note,
    dateIso: new Date().toISOString(),
    createdAt: Date.now(),
    userId: actor.userId,
    locale,
  }
  await setPendingAction(actor.phoneE164, draft)

  if (locale === 'en') {
    return [
      'Please confirm this 【PRIVATE】 ledger entry (valid 5 minutes):',
      `${parsed.type === 'INCOME' ? 'Income' : 'Expense'} ${parsed.amountAbs.toFixed(2)} HKD`,
      `Category: ${cat.label}${parsed.categoryHint ? '' : ' (default)'}`,
      parsed.note ? `Note: ${parsed.note}` : null,
      '',
      'This posts to YOUR private ledger only — not the public ledger.',
      'Reply confirm to submit, or cancel to abort.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '請確認【私帳】入數（5 分鐘內有效）：',
    `${parsed.type === 'INCOME' ? '收入' : '支出'} ${parsed.amountAbs.toFixed(2)} HKD`,
    `分類：${cat.label}${parsed.categoryHint ? '' : '（未指定）'}`,
    parsed.note ? `備註：${parsed.note}` : null,
    '',
    '此筆將寫入你的私帳，不會進入公帳。',
    '回覆「確認」提交，或「取消」放棄。',
  ]
    .filter(Boolean)
    .join('\n')
}

async function prepareMatter(
  actor: WhatsAppActor,
  parsed: NonNullable<ReturnType<typeof parseMatterCreateCommand>>,
  locale: WhatsAppLocale,
): Promise<string> {
  const flags = await loadWhatsAppPluginFlags()
  if (!flags.matters) {
    return locale === 'en'
      ? 'Matters plugin is disabled.'
      : '事項插件已關閉。'
  }

  const draft: PendingMatterDraft = {
    kind: 'matter',
    title: parsed.title,
    eventDateIso: parsed.eventDate.toISOString(),
    reminderDays: parsed.reminderDays,
    visibility: parsed.visibility,
    note: parsed.note,
    createdAt: Date.now(),
    userId: actor.userId,
    locale,
  }
  await setPendingAction(actor.phoneE164, draft)

  const vis =
    locale === 'en'
      ? parsed.visibility === 'PUBLIC'
        ? 'Public'
        : 'Private'
      : parsed.visibility === 'PUBLIC'
        ? '公開'
        : '私人'

  if (locale === 'en') {
    return [
      'Please confirm this matter (valid 5 minutes):',
      parsed.title,
      `Date: ${parsed.eventDate.toISOString().slice(0, 10)}`,
      `Reminder: ${parsed.reminderDays}d · ${vis}`,
      parsed.note ? `Note: ${parsed.note}` : null,
      '',
      'Reply confirm to create, or cancel to abort.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '請確認建立事項（5 分鐘內有效）：',
    parsed.title,
    `日期：${parsed.eventDate.toISOString().slice(0, 10)}`,
    `提醒：${parsed.reminderDays} 天 · ${vis}`,
    parsed.note ? `備註：${parsed.note}` : null,
    '',
    '回覆「確認」建立，或「取消」放棄。',
  ]
    .filter(Boolean)
    .join('\n')
}

async function prepareContract(
  actor: WhatsAppActor,
  parsed: NonNullable<Awaited<ReturnType<typeof parseContractDraftCommand>>>,
  locale: WhatsAppLocale,
): Promise<string> {
  if (!actor.isAdmin) {
    return locale === 'en'
      ? 'Contract draft is admin-only.'
      : '合約草稿僅管理員可用。'
  }
  const flags = await loadWhatsAppPluginFlags()
  if (!flags.contracts) {
    return locale === 'en'
      ? 'Contracts plugin is disabled.'
      : '合約插件已關閉。'
  }

  const draft: PendingContractDraft = {
    kind: 'contract',
    title: parsed.title,
    type: parsed.type,
    effectiveDateIso: parsed.effectiveDate.toISOString(),
    expiryDateIso: parsed.expiryDate.toISOString(),
    reminderDays: parsed.reminderDays,
    amount: parsed.amount,
    poolId: parsed.poolId,
    poolLabel: parsed.poolLabel,
    note: parsed.note,
    createdAt: Date.now(),
    userId: actor.userId,
    locale,
  }
  await setPendingAction(actor.phoneE164, draft)

  if (locale === 'en') {
    return [
      'Please confirm this CONTRACT draft (valid 5 minutes):',
      parsed.title,
      `${parsed.type === 'INCOME' ? 'Income' : 'Expense'} ${parsed.amount.toFixed(2)} HKD`,
      `Effective: ${parsed.effectiveDate.toISOString().slice(0, 10)}`,
      `Expiry: ${parsed.expiryDate.toISOString().slice(0, 10)}`,
      `Reminder: ${parsed.reminderDays}d`,
      parsed.poolLabel ? `Pool: ${parsed.poolLabel}` : null,
      parsed.note ? `Note: ${parsed.note}` : null,
      '',
      'Reply confirm to create, or cancel to abort.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    '請確認合約草稿（5 分鐘內有效）：',
    parsed.title,
    `${parsed.type === 'INCOME' ? '收入' : '支出'} ${parsed.amount.toFixed(2)} HKD`,
    `生效：${parsed.effectiveDate.toISOString().slice(0, 10)}`,
    `到期：${parsed.expiryDate.toISOString().slice(0, 10)}`,
    `提醒：${parsed.reminderDays} 天`,
    parsed.poolLabel ? `資金池：${parsed.poolLabel}` : null,
    parsed.note ? `備註：${parsed.note}` : null,
    '',
    '回覆「確認」建立，或「取消」放棄。',
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
      `📄 ${created.summaryLabel} public summary PDF ready`,
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

async function handlePrivateReportSummary(
  actor: WhatsAppActor,
  locale: WhatsAppLocale,
): Promise<string> {
  const s = await getPrivateMonthSummaryForUser(actor.userId)
  if (locale === 'en') {
    return [
      `📊 ${s.year}/${s.month} 【PRIVATE】 ledger summary (yours only)`,
      `Entries: ${s.count}`,
      `Income: +${s.income.toFixed(2)}`,
      `Expense: -${s.expense.toFixed(2)}`,
      `Net: ${s.net >= 0 ? '+' : ''}${s.net.toFixed(2)}`,
      '',
      'For PDF: send private report pdf',
    ].join('\n')
  }
  return [
    `📊 ${s.year}/${s.month}【私帳】摘要（僅本人）`,
    `筆數：${s.count}`,
    `收入：+${s.income.toFixed(2)}`,
    `支出：-${s.expense.toFixed(2)}`,
    `淨額：${s.net >= 0 ? '+' : ''}${s.net.toFixed(2)}`,
    '',
    '需要 PDF：傳送「私帳報表PDF」。',
  ].join('\n')
}

async function handlePrivateReportPdf(
  actor: WhatsAppActor,
  locale: WhatsAppLocale,
): Promise<string> {
  const created = await createWhatsAppPrivateMonthReportPdf({
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
      `📄 ${created.summaryLabel} 【PRIVATE】 PDF ready (yours only)`,
      `Download (≈${mins} min):`,
      created.url,
      '',
      'Do not forward this link. Expired? Send private report pdf again.',
    ].join('\n')
  }
  return [
    `📄 ${created.summaryLabel}【私帳】PDF 已備妥（僅本人）`,
    `下載（約 ${mins} 分鐘內有效）：`,
    created.url,
    '',
    '請勿轉發連結。過期後再傳「私帳報表PDF」。',
  ].join('\n')
}

async function handleListMatters(
  actor: WhatsAppActor,
  locale: WhatsAppLocale,
): Promise<string> {
  const flags = await loadWhatsAppPluginFlags()
  if (!flags.matters) {
    return locale === 'en'
      ? 'Matters plugin is disabled.'
      : '事項插件已關閉。'
  }
  const rows = await listMattersForWhatsApp(actor, 8)
  if (rows.length === 0) {
    return locale === 'en' ? 'No matters yet.' : '尚無事項。'
  }
  const lines = [
    locale === 'en' ? '📌 Matters:' : '📌 事項列表：',
    '',
  ]
  for (const r of rows) {
    const vis =
      locale === 'en'
        ? r.visibility === 'PUBLIC'
          ? 'public'
          : 'private'
        : r.visibility === 'PUBLIC'
          ? '公開'
          : '私人'
    lines.push(
      `• ${r.eventDate.toISOString().slice(0, 10)}｜${r.title}`,
      `  ${vis} · remind ${r.reminderDays}d`,
    )
  }
  return lines.join('\n')
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
      return formatRecentRows(rows, locale, '🧾 最近公帳：', '🧾 Recent public ledger:')
    }
    case 'recent_private': {
      const rows = await getRecentPrivateRecordsForUser(actor.userId, 5)
      if (rows.length === 0) {
        return locale === 'en'
          ? 'No private-ledger entries yet.'
          : '尚無私帳紀錄。'
      }
      return formatRecentRows(
        rows,
        locale,
        '🧾 最近【私帳】：',
        '🧾 Recent 【PRIVATE】 ledger:',
      )
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
    case 'private_report_summary':
      return handlePrivateReportSummary(actor, locale)
    case 'private_report_pdf':
      return handlePrivateReportPdf(actor, locale)
    case 'list_matters':
      return handleListMatters(actor, locale)
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
    case 'private_ledger_draft':
      return preparePrivateLedger(
        actor,
        {
          type: intent.type,
          amountAbs: intent.amountAbs,
          categoryHint: intent.categoryHint,
          note: intent.note,
        },
        locale,
      )
    case 'matter_draft': {
      const eventDate = parseYmd(intent.eventDate)
      if (!eventDate) return null
      return prepareMatter(
        actor,
        {
          title: intent.title,
          eventDate,
          reminderDays: intent.reminderDays ?? 15,
          visibility: intent.visibility || 'PRIVATE',
          note: intent.note,
        },
        locale,
      )
    }
    case 'contract_draft': {
      const effectiveDate = parseYmd(intent.effectiveDate)
      const expiryDate = parseYmd(intent.expiryDate)
      if (!effectiveDate || !expiryDate) return null
      const pool = await resolveDefaultPool(actor, intent.poolHint)
      return prepareContract(
        actor,
        {
          title: intent.title,
          type: intent.type,
          effectiveDate,
          expiryDate,
          reminderDays: intent.reminderDays ?? 15,
          amount: intent.amount ?? 0,
          poolId: pool.poolId,
          poolLabel: pool.poolLabel,
          note: intent.note,
        },
        locale,
      )
    }
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
    ['提醒', '到期'].includes(text) ||
    lower === 'remind' ||
    lower === 'reminder' ||
    lower === 'reminders'
  ) {
    const items = await collectWhatsAppReminders(actor)
    return formatRemindersMessage(items, locale)
  }

  // 查事項（純查詢；「事項」單獨字仍走提醒相容，但「查事項／matters」專查列表）
  if (
    text === '查事項' ||
    text === '查事项' ||
    text === '事項列表' ||
    text === '事项列表' ||
    lower === 'matters' ||
    lower === 'list matters'
  ) {
    return handleListMatters(actor, locale)
  }

  // 單獨「事項／合約」維持提醒一覽（相容舊行為）
  if (['事項', '事项', '合約', '合同'].includes(text)) {
    const items = await collectWhatsAppReminders(actor)
    return formatRemindersMessage(items, locale)
  }

  if (
    text === '最近私帳' ||
    text === '最近私账' ||
    lower === 'recent private' ||
    lower === 'private recent'
  ) {
    const rows = await getRecentPrivateRecordsForUser(actor.userId, 5)
    if (rows.length === 0) {
      return locale === 'en'
        ? 'No private-ledger entries yet.'
        : '尚無私帳紀錄。'
    }
    return formatRecentRows(
      rows,
      locale,
      '🧾 最近【私帳】：',
      '🧾 Recent 【PRIVATE】 ledger:',
    )
  }

  if (['最近', '紀錄', '记录', 'recent'].includes(lower) || text === '最近') {
    if (!actorCanUsePublicLedger(actor)) {
      return locale === 'en' ? 'No public-ledger permission.' : '沒有公帳權限。'
    }
    const rows = await getRecentRecordsForUser(actor.userId, 5)
    if (rows.length === 0) {
      return locale === 'en' ? 'No ledger entries yet.' : '尚無公帳紀錄。'
    }
    return formatRecentRows(rows, locale, '🧾 最近公帳：', '🧾 Recent public ledger:')
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
    text === '私帳報表PDF' ||
    text === '私账报表PDF' ||
    text === '私帳報表 pdf' ||
    lower === 'private report pdf' ||
    lower === 'private pdf' ||
    lower === 'private reportpdf'
  ) {
    return handlePrivateReportPdf(actor, locale)
  }

  if (
    text === '私帳報表' ||
    text === '私账报表' ||
    lower === 'private report' ||
    lower === 'private summary'
  ) {
    return handlePrivateReportSummary(actor, locale)
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

  const privateLedger = parsePrivateLedgerCommand(text)
  if (privateLedger) {
    return preparePrivateLedger(actor, privateLedger, locale)
  }

  const matter = parseMatterCreateCommand(text)
  if (matter) {
    return prepareMatter(actor, matter, locale)
  }

  const contract = await parseContractDraftCommand(text, actor)
  if (contract) {
    return prepareContract(actor, contract, locale)
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
