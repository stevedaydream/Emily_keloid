# 待處理事項

> 統一收攏尚未完成／待決策的項目。做完就從這裡刪掉，並到 `project.md` 對應段落補上結論。
> 最後更新：2026-07-28

---

## A. 需要臨床判讀（部長／研究團隊）

### A1. 10 筆病灶的部位分類未指定

舊資料匯入後用「RT 劑量 ＋ 部位英文文字」批次回推了 81 筆中的 71 筆，剩下這 10 筆兩個訊號打架或判不出來，程式刻意不猜。**未指定分類的部位不會自動產生放療排程。**

補法：個案頁 →「現存病灶大小測量」→ 該筆下方的「部位分類」下拉 → 儲存。

**文字與 RT 劑量衝突（7 筆）** — 可能是舊表登打有誤，也可能臨床上刻意用了不同劑量：

| 研究編號 | 部位原文 | RT 劑量推出的分類 | 文字推出的分類 |
|---|---|---|---|
| YAN-2023-007 | R't scapular area | 耳 | 胸/肩胛 |
| YAN-2020-005 | left breast, chest and pubic area | 其他 | 胸/肩胛 |
| YAN-2020-006 | Left below axillary | 胸/肩胛 | 其他 |
| YAN-2021-004 | Abdomen keloid | 胸/肩胛 | 其他 |
| YAN-2021-007 | right upper arm | 胸/肩胛 | 其他 |
| YAN-2022-007 | postauricular region | 其他 | 耳 |
| YAN-2023-022 | umbilical keloid | 胸/肩胛 | 其他 |

**判不出來（3 筆）**：

| 研究編號 | 部位原文 | 問題 |
|---|---|---|
| YAN-2020-002 | pubic area | 人形圖沒有恥骨/鼠蹊區塊 |
| YAN-2024-009 | pubic keloid | 同上（RT 劑量是 1800cGy，推出胸/肩胛，但部位明顯不符） |
| YAN-2023-005 | left posterior keloid | 只寫「後側」，不知道是哪個部位 |

→ 恥骨那兩筆若要正式支援，需在後台部位對照表新增區塊（`body_part_zones`，含劑量分類），否則暫時歸到腹部。

### A2. 9 筆已套左側但原文是雙側／沒寫左右

回推時一律先套左側，需人工確認實際是哪一側（或是否該拆成兩個部位）：

| 研究編號 | 目前套用 | 部位原文 |
|---|---|---|
| YAN-2019-001 | 左肩 | Bilateral shoulders, right back and anterior chest keloid |
| YAN-2019-003 | 左耳 | ear helix |
| YAN-2020-008 | 左耳 | bilateral ear lobe |
| YAN-2020-009 | 左耳 | Bilateral earlobe |
| YAN-2021-005 | 左肩胛 | bilateral scapular |
| PU-2022-001 | 左耳 | ear lobe |
| YAN-2022-010 | 左耳 | ear lobe |
| YAN-2023-014 | 左耳 | ear helix |
| PU-2024-001 | 前胸 | upper chest wall, bilateral upper arm |

### A3. 舊資料復發欄位的判讀是否正確

舊表 `是否復發` 只有 `YES`(4) / `NA`(56) / 空(32)，但 `NA` 的列「復發日期」欄也有值。匯入時判定那其實是最後追蹤日，所以：

- `YES` → `recurrence_status = 'recurred'`，帶入復發日期與天數
- `NA` → `recurrence_status = 'none'`，該日期寫進 `followup_cutoff_date`（**不寫** `recurrence_date`，避免被當成復發）
- 空 → `unknown`

→ 若判讀有誤，改一行 SQL 即可調整。

### A4. 其他待確認的內容

- 飲食運動習慣問卷的具體題目（目前是示範題目）
- 常用治療方式清單與各自要記錄的欄位（治療套組模組）
- ICD-9/10 常用碼清單是否還要再收錄其他碼（目前只有院內對照表那三組＋兩個共病參考碼）
- **JSS 診斷分類表的分類切點**：已改為正式 JSW Scar Scale 2015（12 項、總分 0-25），但規格文件只給各項分數、沒給「幾分算蟹足腫」的切點，所以系統目前只顯示總分不做自動分類。部長提供切點後可加回判定。

---

## B. 開發待辦

### B1. 舊資料匯入後的資料缺口（非 bug，舊表本來就沒有）

匯入的 92 筆沒有 ICD 診斷、術語紀錄、問卷回覆、照片，所以收案一條龍平均只有 3.7/8。這些要等病人回診時由診間人員補，或決定標為「不適用」。

### B2. Lab 匯出只給「最新一次」

結構化匯出的主表每個標記固定 3 欄（最新值／最新採檢日／採檢次數），完整時間序列在第二張工作表。若之後要「術前/術後配對比較」這類固定時間點欄位，需先定義時間點對應規則（例如以手術日為基準前後幾天內視為術前/術後）。

### B3. 尚未實際瀏覽器實測的項目

以下改動通過 `tsc --noEmit` 與 `next build`，但沒跑過真實操作：

- 結構化匯出的第二張工作表（lab 生物標記逐筆）有資料
- 個案頁時程項目「更換問卷」後，連結指向新問卷
- 照片頁停留超過 1 小時仍看得到圖（`/api/photos/[id]` 即時簽章轉址）
- 多部位放療：勾兩個不同分類的部位＋手術切除，各產生一組次數不同的排程
- 診斷區塊的 ICD-9/ICD-10 切換與後台一次輸入一組對照

### B4. 追蹤時程範本的問卷指定

後台設定時程範本時，每個時間點各自指定固定的 `questionnaire_id`。套用範本產生個案時程後，**個案層級已可單獨更換問卷**（2026-07-27 已做）。目前沒有「批次改某範本所有既有個案的問卷」的功能，如有需要要另外加。

### B5. Supabase CLI 沒有納入版控

`supabase` CLI 目前只在 `node_modules`（`npx supabase` 可用），沒有寫進 `package.json`。理由是 commit 後 Vercel 每次 build 都會下載約 40MB 的 CLI 執行檔，拖慢部署且網路受限時可能失敗；而 Supabase MCP 已連上，migration 可直接套用，CLI 用不太到。

**副作用**：下次 `npm install` 或別台機器 clone 就沒有了。要永久保留跑 `npm i -D supabase` 再 commit。

### B6. `supabase db push` 不能用

遠端 migration 歷史表的版本號跟本機 `supabase/migrations/*.sql` 檔名對不上（歷史是用 MCP `apply_migration` 寫的，時間戳自己產生）。直接 `db push` 會認為 25 支本機 migration 全都沒跑過而重跑一遍。

**往後流程**：用 Supabase MCP `apply_migration` 套用並自動記錄歷史。CLI 只拿來做 `migration list`、`gen types`、`db diff` 這類唯讀用途。

---

## C. Phase 1 上線前必做

### C1. 資料庫層權限收緊（安全性）

目前 Supabase RLS 對 `anon` 角色開放所有應用資料表的完整讀寫，存取控制只在應用層（單一共用帳號 + 操作者選單）。這是 demo 階段為了避免 service_role 金鑰管理複雜度的取捨。

**正式上線前應改為**：service_role 金鑰（僅存伺服器端環境變數）＋ 收回 anon 的資料表存取權限，避免 anon key 外洩就等於資料庫外洩。

### C2. 病歷號對照表的保管

舊資料匯入產生的 `病歷號 ↔ 研究編號 ↔ case_id` 對照表寫在 `C:\Users\user\Downloads\keloid_mrn_mapping.csv`（92 列）。

**這是唯一能還原身分的檔案**，需移到診間電腦妥善保管，不要放在會同步到雲端的資料夾（目前在 Downloads，尚未移動）。姓名沒有收進這份檔案，只留在原始 Excel。

### C3. 其他 Phase 1 項目

- 正式 LINE 官方帳號 + GAS 串接（回診提醒推播、衛教機器人 webhook）
- `GEMINI_API_KEY` 已設定，但衛教機器人尚未實際對話測試
- 診間本機病歷號對照工具的正式部署流程（目前是瀏覽器 File System Access API，僅 Chrome/Edge 桌面版支援）
- 請資訊室確認：公務機瀏覽器是否支援相機權限；院內網路是否允許連 Vercel/Supabase 網域
