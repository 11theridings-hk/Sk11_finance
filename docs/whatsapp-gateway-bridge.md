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
| `WHATSAPP_ALLOWED_PHONES` | 建議白名單 |

Meta 變數（`WHATSAPP_VERIFY_TOKEN` 等）審過後再填；設 `WHATSAPP_PROVIDER=cloud` 即可切回官方通道。

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

指令與身份綁定與舊 Meta 路徑相同（`src/lib/whatsapp/`）。

## iMac 部署

見 WS-BOT 倉庫：[`docs/imac-deploy.md`](https://github.com/11theridings-hk/WS-BOT/blob/main/docs/imac-deploy.md)。

## 相關

- Meta Webhook（保留）：[`whatsapp-webhooks.md`](./whatsapp-webhooks.md)
- 互動路線：[`whatsapp-interaction-roadmap.md`](./whatsapp-interaction-roadmap.md)
