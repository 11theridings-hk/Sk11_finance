import type { WhatsAppLocale } from './locale'
import { parseMatterCreateCommand } from './matters'

/** 各主要操作的 WhatsApp 內嵌用法說明（繁中／英文） */

export function publicLedgerUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '📒 Public ledger — usage',
      '',
      'Post (reply confirm):',
      '• ledger expense 120 food lunch',
      '• ledger income 5000 rent',
      '• 公帳 支 120 餐飲 午餐 @MainPool',
      '',
      'Format: [ledger] <expense|income> <amount> [category] [note…] [@pool]',
      'Chinese: 公帳 <收|支> <金額> [分類] [備註…] [@資金池]',
      '',
      'Also: recent · categories · pools',
      'Cancel pending: cancel',
    ].join('\n')
  }
  return [
    '📒 公帳指令用法',
    '',
    '入數（需回覆「確認」）：',
    '• 公帳 支 120 餐飲 午餐',
    '• 公帳 收 5000 租金',
    '• 公帳 支 50 交通 的士 @公司戶',
    '',
    '格式：公帳 <收|支> <金額> [分類] [備註…] [@資金池]',
    '英文：ledger expense 120 food lunch',
    '',
    '查最近：最近　｜　分類　｜　資金池',
    '取消待確認：取消',
  ].join('\n')
}

export function privateLedgerUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '🔒 Private ledger 【私帳】— usage',
      '',
      'Post (reply confirm; card shows PRIVATE):',
      '• private expense 120 lunch',
      '• 私帳 支 120 午餐',
      '',
      'Format: private <expense|income> <amount> [category] [note…]',
      'Chinese: 私帳 <收|支> <金額> [分類] [備註…]',
      '',
      'Also: recent private · private report · private report pdf',
      '(PDF: open while signed in as yourself; single-use)',
      'Cancel pending: cancel',
    ].join('\n')
  }
  return [
    '🔒【私帳】指令用法',
    '',
    '入數（需回覆「確認」；確認卡標明私帳）：',
    '• 私帳 支 120 午餐',
    '• 私帳 收 200 退款',
    '• private expense 120 lunch',
    '',
    '格式：私帳 <收|支> <金額> [分類] [備註…]',
    '',
    '查最近：最近私帳',
    '報表：私帳報表　／　私帳報表PDF',
    '（PDF 須本人登入網頁後開啟；單次有效）',
    '取消待確認：取消',
  ].join('\n')
}

export function matterUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '📌 Matter commands',
      '',
      'Create (reply confirm):',
      '• matter Title|YYYY-MM-DD|15|private',
      '• 事項 泳池保養|2026-11-25|15|私人',
      '',
      'Format: matter <title>|<YYYY-MM-DD>[|<days>][|public|private][|note]',
      'Default: 15 days · private',
      '',
      'List: matters / 查事項',
      'Due list: 查提醒 / remind',
    ].join('\n')
  }
  return [
    '📌 事項指令用法',
    '',
    '建立（需回覆「確認」）：',
    '• 事項 標題|YYYY-MM-DD|15|私人',
    '• 事項 泳池保養|2026-11-25|15|公開',
    '',
    '格式：事項 <標題>|<日期 YYYY-MM-DD>[|<提醒天數>][|公開|私人][|備註]',
    '預設：提醒 15 天 · 私人',
    '',
    '查列表：查事項　／　matters',
    '到期提醒：查提醒　／　提醒',
  ].join('\n')
}

export function contractUsageText(locale: WhatsAppLocale, isAdmin: boolean) {
  if (locale === 'en') {
    const lines = [
      '📄 Contract commands',
      '',
      'Due reminders: remind / 查提醒',
      '(Bare「合約」shows this help, not create.)',
    ]
    if (isAdmin) {
      lines.push(
        '',
        'Create draft — admin only (reply confirm):',
        '• contract draft Title|income|YYYY-MM-DD|YYYY-MM-DD|amount|days',
        '• 合約草稿 租約|收|2026-01-01|2026-12-31|5000|30',
        '',
        'Format: contract draft <title>|<income|expense>|<effective>|<expiry>[|<amount>][|<days>] [@pool]',
      )
    } else {
      lines.push('', 'Creating contracts is admin-only.')
    }
    return lines.join('\n')
  }
  const lines = [
    '📄 合約指令用法',
    '',
    '到期提醒：查提醒　／　提醒',
    '（只傳「合約」會顯示本說明，不會建立合約。）',
  ]
  if (isAdmin) {
    lines.push(
      '',
      '建立草稿 — 僅管理員（需「確認」）：',
      '• 合約草稿 租約|收|2026-01-01|2026-12-31|5000|30',
      '• contract draft Lease|income|2026-01-01|2026-12-31|5000|30',
      '',
      '格式：合約草稿 <標題>|<收|支>|<生效日>|<到期日>[|<金額>][|<提醒天>] [@資金池]',
      '金額／提醒可省略（金額預設 0、提醒 15 天）',
    )
  } else {
    lines.push('', '建立合約僅管理員可用。')
  }
  return lines.join('\n')
}

export function reportUsageText(locale: WhatsAppLocale, isAdmin: boolean) {
  if (locale === 'en') {
    const lines = ['📊 Report commands', '']
    if (isAdmin) {
      lines.push(
        'Public (admin):',
        '• report summary / 報表摘要 — month text',
        '• report pdf / 報表PDF — short-lived PDF link',
        '',
      )
    } else {
      lines.push('Public month summary/PDF is admin-only.', '')
    }
    lines.push(
      'Private (yours only):',
      '• private report / 私帳報表',
      '• private report pdf / 私帳報表PDF',
      '(PDF: sign in as yourself; single-use)',
      '',
      'Full ZIP/filters: use the web app.',
    )
    return lines.join('\n')
  }
  const lines = ['📊 報表指令用法', '']
  if (isAdmin) {
    lines.push(
      '公帳（管理員）：',
      '• 報表摘要　／　報表本月 — 本月文字摘要',
      '• 報表PDF — 短時下載連結',
      '',
    )
  } else {
    lines.push('公帳報表／PDF 僅管理員可用。', '')
  }
  lines.push(
    '私帳（僅本人）：',
    '• 私帳報表',
    '• 私帳報表PDF（須登入網頁後開啟；單次）',
    '',
    '完整 ZIP／複雜篩選請用網頁報表。',
  )
  return lines.join('\n')
}

export function remindUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '⏰ Reminder commands',
      '',
      '• remind / 查提醒 — due contracts, matters, recurring',
      '• matters / 查事項 — matter list',
      '',
      'Create matter: matter Title|YYYY-MM-DD|15|private',
      'Create contract (admin): contract draft …',
    ].join('\n')
  }
  return [
    '⏰ 提醒指令用法',
    '',
    '• 查提醒　／　提醒 — 合約／事項／恆常到期一覽',
    '• 查事項 — 事項列表',
    '',
    '建立事項：事項 標題|YYYY-MM-DD|15|私人',
    '建立合約（管理員）：合約草稿 …',
  ].join('\n')
}

export function categoryUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '📂 Category commands',
      '',
      '• categories / 查分類 — sample expense/income names',
      'Use a category name when posting ledger entries.',
      '',
      'Example: ledger expense 120 food lunch',
      'Chinese: 公帳 支 120 餐飲 午餐',
    ].join('\n')
  }
  return [
    '📂 分類指令用法',
    '',
    '• 查分類　／　分類 — 列出常用收支分類名稱',
    '入數時可寫分類名稱，系統會模糊匹配。',
    '',
    '例：公帳 支 120 餐飲 午餐',
    '例：私帳 支 80 交通',
  ].join('\n')
}

export function poolUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '🏦 Pool commands',
      '',
      '• pools / 查資金池 — list pool names & balances',
      'Tag a pool when posting public ledger: … @PoolName',
      '',
      'Example: ledger expense 50 food coffee @Main',
      'Chinese: 公帳 支 50 餐飲 咖啡 @公司戶',
    ].join('\n')
  }
  return [
    '🏦 資金池指令用法',
    '',
    '• 查資金池　／　資金池 — 列出名稱與餘額',
    '公帳入數可用 @資金池名 指定',
    '',
    '例：公帳 支 50 餐飲 咖啡 @公司戶',
  ].join('\n')
}

export function confirmUsageText(locale: WhatsAppLocale) {
  if (locale === 'en') {
    return [
      '✅ Confirm / cancel',
      '',
      'After a draft card: confirm / ok / yes',
      'Abort: cancel / no',
      'Pending expires in ~5 minutes.',
    ].join('\n')
  }
  return [
    '✅ 確認／取消',
    '',
    '出現確認卡後：確認　／　confirm　／　是',
    '放棄：取消　／　cancel　／　否',
    '待確認約 5 分鐘內有效；新草稿會蓋掉舊的。',
  ].join('\n')
}

// —— detectors ——

export function isBareOrIncompletePublicLedger(
  text: string,
  parsedOk: boolean,
): boolean {
  const t = text.trim()
  if (/^(公帳|公账|ledger)$/iu.test(t)) return true
  if (parsedOk) return false
  return /^(公帳|公账)\s+/u.test(t) || /^ledger\s+/i.test(t)
}

export function isBareOrIncompletePrivateLedger(
  text: string,
  parsedOk: boolean,
): boolean {
  const t = text.trim()
  if (/^(私帳|私账|private)$/iu.test(t)) return true
  if (parsedOk) return false
  if (/^private\s+(report|pdf|summary|recent)\b/i.test(t)) return false
  if (/^(私帳報表|私账报表|最近私帳|最近私账)/u.test(t)) return false
  return /^(私帳|私账)\s+/u.test(t) || /^private\s+/i.test(t)
}

export function isMatterUsageRequest(text: string): boolean {
  const t = text.trim()
  if (/^(事項|事项|matter)$/iu.test(t)) return true
  if (
    /^(新建事項|建立事項|新增事項|事項建立|事項|create\s+matter|new\s+matter|matter)(?:\s+|$)/iu.test(
      t,
    )
  ) {
    return parseMatterCreateCommand(t) === null
  }
  return false
}

export function isBareOrIncompleteContract(
  text: string,
  parsedOk: boolean,
): boolean {
  const t = text.trim()
  if (/^(合約|合同|contract)$/iu.test(t)) return true
  if (parsedOk) return false
  return /^(合約草稿|合同草稿|新建合約|建立合約|contract\s+draft|new\s+contract|create\s+contract)(?:\s+|$)/iu.test(
    t,
  )
}

/** 只傳「報表」→ 用法；「報表摘要／報表PDF／私帳報表」仍執行 */
export function isReportUsageKeyword(text: string): boolean {
  const t = text.trim()
  const lower = t.toLowerCase()
  return t === '報表' || t === '报表' || lower === 'report'
}
