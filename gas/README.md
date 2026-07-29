# LINE 提醒與衛教機器人：上線步驟

平台這邊的程式已經完成並測過（見 `project.md` 2026-07-29）。**平台不持有任何 LINE 憑證**——
channel access token 只放在 GAS，所以 Vercel 這邊即使被入侵也發不出訊息。

整條鏈路：

```
病人的 LINE ──webhook──> GAS ──x-line-relay-secret──> 平台 /api/line/*  ──> Supabase
GAS 每日排程 ─────────> 平台 /api/line/reminders（拿名單）
             <───────── 名單
             ──────────> LINE Messaging API（推播）
             ──────────> 平台 /api/line/reminders（回報，避免重複推）
```

---

## 一、啟用 Messaging API（你已有官方帳號，這步是把它變成可程式化的 bot）

1. 進 [LINE Developers Console](https://developers.line.biz/console/)，用**與官方帳號同一個 LINE 商用帳號**登入
2. 建立 Provider（若還沒有）→ 建立 **Messaging API channel**，選擇「連結既有的官方帳號」
3. 在該 channel 的 **Messaging API** 分頁：
   - **Channel access token（long-lived）** → 按「Issue」產生並複製（等一下貼進 GAS）
   - **自動回應訊息** → 停用（否則官方帳號會用罐頭訊息搶先回覆，bot 就不會回應）
   - **加入好友的歡迎訊息** → 可停用（我們的 bot 自己會發引導訊息）
4. **Webhook URL** 先留著，等 GAS 部署完拿到網址再回來填

> 免費方案（輕用量）每月有訊息則數上限。回診＋放療提醒一位病人整個療程大約 5-8 則，
> 以目前規模（93 案）綽綽有餘；衛教問答走 reply token **不計入**推播額度。

## 二、部署 GAS 轉接層

1. [script.google.com](https://script.google.com) → 新增專案，把 `gas/line-relay.gs` 整份貼進去
2. **專案設定 → 指令碼屬性**，新增三筆：

   | 屬性 | 值 |
   |---|---|
   | `LINE_CHANNEL_ACCESS_TOKEN` | 上一步產生的 long-lived token |
   | `PLATFORM_BASE_URL` | `https://keloid-research-platform.vercel.app`（結尾不要斜線） |
   | `LINE_RELAY_SECRET` | 自己產生一組長亂數，**平台環境變數要填同一組** |

3. **專案設定 → 時區** 改成 `(GMT+08:00) Taipei`（排程用得到）
4. **部署 → 新增部署作業 → 網頁應用程式**
   - 執行身分：**我**
   - 具有存取權的使用者：**所有人**（LINE 的伺服器要打得到）
   - 複製產生的網址 → 回 LINE Developers 填進 **Webhook URL**，並開啟「Use webhook」
5. **觸發條件 → 新增觸發條件**：函式 `sendDailyReminders`、時間驅動、每日、早上 8–9 點
6. 先執行一次 `testPlatformConnection()`，執行紀錄應該印出「平台連線正常」

## 三、平台環境變數（Vercel）

| 變數 | 說明 |
|---|---|
| `LINE_RELAY_SECRET` | 與 GAS 指令碼屬性**完全相同**的那組亂數 |
| `LINE_OA_BASIC_ID` | 官方帳號的 basic id（形如 `@abc1234`，在 LINE Official Account Manager 看得到）。設了才會產生「掃碼即綁」的 QR code；沒設只顯示綁定碼 |

`.env.local` 已有這兩個變數，本機那組 `LINE_RELAY_SECRET` 是開發測試用的**請自行更換**。

## 四、驗收

1. 個案頁 → 「LINE 提醒綁定」→ 產生綁定碼與 QR code
2. 用手機 LINE 掃 QR → 會開啟與官方帳號的對話並**預填**「綁定 XXXXXX」→ 按送出
3. 應收到「綁定完成！」，個案頁重整後顯示「已綁定」
4. 直接在對話框問一個衛教資料庫裡有的問題，應該得到依資料庫內容的回答；
   問資料庫沒有的內容，應該回「建議洽詢診間人員」而不是自己編
5. 隔天早上排程跑完，到期的追蹤／放療會收到提醒

---

## 設計上的幾個決定（之後要改時先看這裡）

- **提醒訊息不含任何可識別資訊**：沒有研究編號、沒有部位、沒有病歷號。LINE 訊息可能被家人看到，
  也會出現在鎖定畫面通知上。訊息只說「您有一次追蹤預定於 X 月 X 日」。
- **重跑不會重複推**：`line_reminder_log` 對 `(kind, ref_id, due_date)` 有唯一索引（只約束成功的紀錄），
  排程重跑或手動再執行一次都不會讓病人收到兩則。失敗的會留紀錄並在下次重試。
- **回診提醒補推、放療提醒不補推**：回診逾期了提醒仍有意義（`due_date <= 今天`）；
  放療是當天的事，隔天才推只會造成困惑（`due_date = 今天`）。
- **綁定碼的字母表避開易混字元**（沒有 0/O、1/I/L、2/Z、5/S、8/B），有效期 72 小時，
  綁定成功後立刻清空。`line_user_id` 有唯一索引，一支 LINE 只能綁一個個案。
- **病人封鎖官方帳號（unfollow）會自動解除綁定**，否則那個 user id 會卡住唯一索引，
  病人換手機後綁不回來。
- **衛教問答不帶入任何個案資料**（決策 2026-07-26）：不用免費層做個人化諮詢，
  機器人只依後台「衛教資料庫」的內容回答，資料庫沒涵蓋就請病人洽詢診間。

---

## 用 clasp 部署（不用再手動貼程式碼）

專案根目錄有 `dev-tools.bat`，選 **1. GAS push + deploy** 就會把 `gas/` 推上去並更新部署。

### 第一次設定

```bash
npm i -g @google/clasp
clasp login
```

然後把 Apps Script 的 **Script ID** 填進根目錄的 `.clasp.json`：
Apps Script 編輯器 → 專案設定 → ID → 複製「指令碼 ID」。

```json
{ "scriptId": "貼在這裡", "rootDir": "./gas" }
```

### deployment id 一定要固定住

`gas/deployment-id.txt` 存的是部署 ID。**這件事比看起來重要**：
LINE 的 webhook URL 綁的是特定部署，每次 `clasp deploy` 不帶 `-i` 都會建立**新的**部署、產生**新的網址**，
舊網址仍然指向舊版程式 —— bot 看起來還活著，但你改的東西永遠不會生效。

第一次部署後，把產生的 deployment id 存進 `gas/deployment-id.txt`（單獨一行），
之後 `dev-tools.bat` 就會自動用 `-i` 更新同一個部署，webhook URL 保持不變。

已經在網頁介面部署過的話，用 `clasp list-deployments` 找出現有的 ID。

### 這支 GAS 要的權限很小

`gas/appsscript.json` 只宣告了一個 scope：`script.external_request`（連到外部服務）。
因為資料都在 Supabase，這支腳本不碰 Google Sheet 也不碰 Drive —— 授權時看到的畫面會相對單純。
