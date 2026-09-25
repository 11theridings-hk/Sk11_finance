# WhatsApp 閘道橋接（WS-BOT / wwebjs）

現階段主渠道：家用 iMac 上的 [WS-BOT](https://github.com/11theridings-hk/WS-BOT)（whatsapp-web.js）。  
Meta Cloud API 程式（`/api/webhooks/whatsapp`）**保留**，審批通過後可切回。

## 架構

```
用戶 WhatsApp
    → WS-BOT（iMac + Tunnel）
    → POST /api/internal/whatsapp/inbound  （Railway SK11）
    → 回傳 { reply }
    → WS-BOT 發回 WhatsApp

提醒等出站：
SK11 → POST {WHATSAPP_GATEWAY_URL}/api/send → WS-BOT
```

## Railway 環境變數

```env
WHATSAPP_PROVIDER=gateway
WHATSAPP_BRIDGE_SECRET=與 WS-BOT 的 BRIDGE_SECRET 相同
WHATSAPP_GATEWAY_URL=https://你的-tunnel-網域
WHATSAPP_ALLOWED_PHONES=8529xxxxxxx
WHATSAPP_REMINDER_PHONES=8529xxxxxxx
```

| 變數 | 說明 |
|------|------|
| `WHATSAPP_PROVIDER` | `gateway` \| `cloud` \| `auto`（預設）。`auto`：有閘道則用閘道 |
| `WHATSAPP_BRIDGE_SECRET` | 閘道 ↔ SK11 共用密鑰 |
| `WHATSAPP_GATEWAY_URL` | Tunnel 根 URL（無尾斜線） |
| `WHATSAPP_ALLOWED_PHONES` | 建議白名單（後台可覆寫；非清單不回覆） |

Meta 變數（`WHATSAPP_VERIFY_TOKEN` 等）審過後再填；設 `WHATSAPP_PROVIDER=cloud` 即可切回官方通道。

## 白名單（SK11 管理後台）

白名單在 **SK11 管理後台 → WhatsApp** 維護（`SystemSetting` key `whatsapp.allowed_phones`），**不是** WS-BOT。  
未於後台寫入前，入站仍可讀 `WHATSAPP_ALLOWED_PHONES`。非白名單來電時入站 API 回傳 `reply: null`、`ignored: true`，閘道**不得**代發任何訊息。

## 提醒／廣播目標群組（SK11 管理後台）

目標群組同樣在 **管理後台 → WhatsApp** 維護（`SystemSetting` key `whatsapp.reminder_groups`），存穩定 JID（`…@g.us`）＋顯示名稱。

- 優先：閘道已配置時按「從閘道載入群組」→ `GET {WHATSAPP_GATEWAY_URL}/api/groups`（Bearer 密鑰）
- 後備：手動輸入 `1203630……@g.us`
- 每日提醒 cron 會發到：`WHATSAPP_REMINDER_PHONES` **與** 此群組清單
- 出站群組訊息：`POST /api/send` body `{ "to": "……@g.us", "body": "…" }`（需閘道支援群組 JID）

預期閘道回傳：

```json
{ "ok": true, "groups": [{ "id": "1203630…@g.us", "name": "財務群" }] }
```

群組 **只作出站推播**（提醒等）；**不**在群內回覆指令。互動入數／查詢請用 1 對 1。

## LLM 進出站（可選）

複用 `OCR_API_KEY` + `OCR_API_BASE_URL`（OpenAI 相容），**模型與 OCR 分開**：

```env
WHATSAPP_LLM_ENABLED=true
WHATSAPP_LLM_INBOUND=true
WHATSAPP_LLM_OUTBOUND=true
WHATSAPP_LLM_MODEL=deepseek/deepseek-v4-pro-0813
# 可選
WHATSAPP_LLM_MIN_CONFIDENCE=0.55
WHATSAPP_EXPORT_TTL_MS=1800000
APP_BASE_URL=https://sk11finance.up.railway.app
```

- 入站：固定指令優先；未命中才 LLM → Intent（入帳仍須「確認」）
- 出站：提醒推播潤飾；結構化確認卡不潤飾
- `報表PDF`：伺服器產 PDF → `GET /api/exports/whatsapp/{token}` 短時連結

傳圖 OCR 入數暫緩（需改 WS-BOT 媒體管線）。

## 入站 API

`POST /api/internal/whatsapp/inbound`

```http
Authorization: Bearer <WHATSAPP_BRIDGE_SECRET>
Content-Type: application/json

{ "from": "85291234567", "text": "幫助", "messageId": "optional" }
```

```json
{ "ok": true, "reply": "你好…" }
```

非白名單：

```json
{ "ok": true, "reply": null, "ignored": true }
```

指令與身份綁定與舊 Meta 路徑相同（`src/lib/whatsapp/`）。

## iMac 部署

見 WS-BOT 倉庫：[`docs/imac-deploy.md`](https://github.com/11theridings-hk/WS-BOT/blob/main/docs/imac-deploy.md)。

## 相關

- Meta Webhook（保留）：[`whatsapp-webhooks.md`](./whatsapp-webhooks.md)
- 互動路線：[`whatsapp-interaction-roadmap.md`](./whatsapp-interaction-roadmap.md)
