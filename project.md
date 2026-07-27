# 蟹足腫（Keloid）研究資料收集平台 — 專案總覽

> 本文件是本專案的架構藍圖，任何人（含未來的我）開始改動程式前，應先讀本檔掌握現況。
> 慣例／踩坑／API／決策細節另見 `project_conventions.md`、`project_decisions.md`、`project_api.md`、`project_bugfix.md`（隨開發進度陸續建立）。

## 專案目標

外科部門建置一個蟹足腫（keloid）臨床研究的資料收集平台，取代目前分散、非結構化的收案方式，目標是收集**結構化、乾淨**的資料供未來研究分析使用。

團隊組成（4人）：助理、專科護理師、外科部長（PI）、開發者（本人）。非全院正式系統，是單一研究團隊的專案級平台。

## Demo 存取資訊

- 網址：https://keloid-research-platform.vercel.app
- 共用密碼：見團隊內部通知（.env.local 的 `APP_SHARED_PASSWORD`，部署於 Vercel 環境變數）
- Supabase 專案：`keloid-research-platform`（ap-northeast-1）
- 登入後需先選擇「目前操作者」，已預先建立助理/專科護理師/部長/系統管理者四個操作者
- 已預先塞入 4 筆模擬個案（含 1 筆舊資料回溯建檔範例）與 1 批舊資料匯入示範批次，供部長直接體驗操作流程

## 目前階段

**Phase 0（進行中）**：先做 demo（Supabase 真實後端 + 模擬資料，部署 Vercel）給部長看操作流程，確認方向後才進入 Phase 1 正式串接（真實 LINE 官方帳號、正式收案）。目前沒有時間壓力。

## 核心架構決策

### 1. 去識別化混合架構（資安/IRB 前提）
雲端平台（Supabase + Vercel）**只存研究編號相關資料，完全不觸碰病歷號**。病歷號↔研究編號對照表存放在診間本機一個獨立的小型工具（**不在本專案雲端平台開發範圍內**），只有診間電腦能查，支援雙向查詢。

### 2. 病人聯絡與 LINE 綁定
雲端只存「研究編號 + 手機號碼」（不含姓名、病歷號）。正式版流程：
- 診間用 LINE 官方帳號 QR code 讓病人加好友
- 建立個案時系統產生一次性綁定碼，病人於 LINE 對話框輸入完成綁定
- **GAS（Google Apps Script）作為轉接/排程層**：處理 LINE webhook（綁定碼比對）與排程推播提醒，本身不存資料，所有讀寫即時呼叫 Supabase API（避免資料分裂成兩份）
- 病人端問卷/拍照透過 **LIFF**（LINE 內嵌網頁）
- **Demo 階段不接真實 LINE/LIFF/GAS**，病人端用一般網頁模擬「類 LINE 對話框」外觀

### 3. 傷口拍照
拍照頁提供「通用對齊框＋比例尺參照框」（對應醫院現有紙質直尺），少數常見部位可有客製輪廓蒙板（可逐步擴充）。**第一階段不做任何自動影像分析或 AI 判讀**，純記錄「時間戳記＋研究編號＋對應追蹤時間點」的照片檔案。

### 4. 通用問卷產生器（核心引擎）
後台可自訂問卷與題目（單選/複選/數字/文字/量表評分等），疤痕嚴重度量表（Vancouver Scar Scale / POSAS 等，**待部長確認採用哪一種**）與飲食運動習慣問卷都用此引擎產生，內容異動不需改程式碼。

### 5. 醫學術語庫
後台可自行新增/編輯/刪除，每則術語可搭配示意圖，依「術前／術中／術後」分三份清單，記錄時可複選。

### 6. 治療紀錄模組
依治療類型顯示對應結構化欄位；常用參數組合可存成可維護的「套組/範本」，選套組帶入欄位並可微調另存新套組；未列舉類型歸入「其他（自由文字）」。

### 7. 追蹤時程規則引擎
後台可維護多套「時程範本」（例：標準術後追蹤＝第2週/1個月/3個月/6個月/12個月，每個時間點掛填問卷/拍照提醒/回診提醒等動作），建立個案時套用範本並可個別微調，範本本身不寫死。

### 8. 研究編號規則
格式：`[醫師代碼]-[年份]-[流水序號]`（例：`CHN-2026-001`）
- 流水序號依「醫師代碼＋年份」**每年歸零**
- 醫師代碼從後台維護清單選取（下拉，非手動輸入）
- 不含部位資訊

### 9. 帳號與權限
全體共用同一組帳號密碼，不分角色權限；**每次操作前需選擇「目前操作者」**（下拉選單，稽核用，無需 PIN）。

### 10. 知情同意
紙本簽署流程不變，平台僅加「同意書已簽署」狀態欄位（簽署日期＋確認人）。

### 11. 診斷碼（ICD-9/10）
僅收錄蟹足腫相關的精簡常用碼清單（含 ICD-9、ICD-10 對照），每筆記錄含「代碼＋完整診斷全文」，可複選（主診斷＋共病），後台可維護。

### 12. 資料匯出
手動觸發，兩個獨立下載：①結構化資料表（CSV/Excel）②照片打包 zip（研究編號＋日期命名）。不做自動排程寫本機硬碟，人工下載後手動備份。

### 13. 舊資料匯入與回溯建檔（新增分支，2026-07-25 確認）
現況：既有 Excel/CSV 格式舊資料，**規模為數百筆以上**，且同時存在三種缺口：
  - 舊欄位對應不到新系統欄位（需人工決定歸類/拆分）
  - 舊資料本身有空值
  - 舊資料完全沒涵蓋新系統才有的項目（例如 ICD 碼、術前中後術語、新版治療套組結構）

設計方向：
- **去識別化前提不變**：匯入前需先在診間本機對照工具內為每筆舊病人建立研究編號（沿用 `[醫師代碼]-[年份]-[流水序號]` 規則，年份建議採用該病人「原始收案年份」而非匯入當年），雲端平台的匯入功能只接受**已完成去識別化、帶有研究編號**的資料表，不接受含病歷號/姓名的原始檔案
- **匯入流程**：上傳 CSV/Excel → 欄位對應介面（把舊欄位對應到新系統欄位，對應規則可存成範本供下次匯入重複使用）→ 匯入前驗證預覽（列出筆數、必要欄位缺失/格式錯誤的列）→ 寫入 staging（暫存）表 → 人工檢視修正 → 正式寫入個案/治療紀錄等正式表
- **資料完整度追蹤**：每個個案有一份「資料完整度」檢查清單，逐欄標記三種狀態：
  - 已有（匯入時就有值）
  - 待補（舊資料該欄位是空的，但屬於系統仍要求的欄位，之後回診/回頭確認時可以補）
  - 不適用（系統上線前不存在的概念，例如舊資料沒有 ICD 碼或術語紀錄，無法回溯，永久標記不適用，不強求填寫）
- 之後在個案頁面上，「待補」欄位會被標示提醒，方便助理/護理師在下次接觸病人時補齊

## 技術棧

- **前端/後端框架**：Next.js（App Router, TypeScript）部署於 Vercel
- **資料庫**：Supabase（Postgres），唯一資料來源（single source of truth）
- **檔案儲存**：Supabase Storage（傷口照片、術語庫示意圖）
- **LINE Bot（Phase 1）**：Google Apps Script（webhook + 排程），呼叫 Supabase REST API
- **Demo 階段**：不接 LINE/GAS，病人端用一般網頁路由模擬 LINE/LIFF 外觀

## 開發階段

- **Phase 0（本次交付）**：project.md + Next.js/Supabase 骨架 + 模擬資料 + 可點擊功能雛形（含舊資料匯入雛形）部署 Vercel demo 給部長看
- **Phase 1（部長確認方向後）**：正式 LINE 官方帳號 + LIFF + GAS 串接；依部長確認的量表/飲食運動問卷題目與治療方式清單，把問卷/治療套組內容做實；建置診間本機病歷號對照工具；正式匯入既有舊資料
- **Phase 2（後續擴充，非本次範圍）**：客製部位拍照蒙板、影像量測/AI 輔助評估、後台易用性優化

## 安全性備忘（Demo 階段的已知取捨）

- 資料庫層（Supabase RLS）目前對 `anon` 角色開放所有應用資料表的完整讀寫權限，實際的存取控制放在應用層（單一共用帳號登入 + 操作者選單，見決策 #9）。這是為了避免在 demo 階段引入 service_role 金鑰管理的複雜度所做的取捨。
- **Phase 1 正式上線前應重新檢視**：改用 service_role 金鑰（僅存於伺服器端環境變數）+ 收回 anon 的資料表存取權限，讓資料庫層也有一層防護，避免 anon key 外洩就等於資料庫外洩。

## 待部長/研究團隊確認的開放項目

- ~~疤痕嚴重度量表要採用哪一種~~ → 已確認採用 **Vancouver Scar Scale (VSS)**，2026-07-26 已建好（醫師評分、非病人自填，4 項：血管分布/色素沉澱/柔軟度/高度，總分 0-13）
- 飲食運動習慣問卷的具體題目
- 常用治療方式清單與各自要記錄的欄位（用於治療套組模組）
- ICD-9/10 常用碼清單的實際內容（哪些碼要收錄）

## 2026-07-26 架構調整（跟部長溝通後）

與主任確認方向後，做了以下重大調整：

1. **LINE 角色限縮**：只做「回診提醒通知」與「衛教諮詢機器人」（Gemini API 免費層），**拿掉病人自行填問卷/拍照的路徑**。主要收案資料回歸集中在門診由診間人員操作。原本規劃的 LIFF 病人自填流程整個作廢。
2. **衛教機器人**：嚴格限制只能依據後台維護的衛教資料庫內容回答，不帶入病人個資/研究編號，資料庫沒涵蓋的問題要引導病人洽詢診間，不用免費層做個人化諮詢（避免免費層資料訓練使用條款風險）。
3. **人形部位圖**：正面＋背面自製簡化人形輪廓（非解剖寫實圖，無授權疑慮），細緻部位分區（15-20 熱區），每個精確部位對應到三大劑量分類（胸/肩胛區、耳、其他部位）的後台可維護對照表。點選部位會跳出蒙板/尺規對齊拍照頁。
4. **拍照設備**：統一使用醫院已配發的公務機（手機瀏覽器），電腦不外接攝影機（避免醫院資安 USB 白名單審查）。人形圖點部位＋拍照在手機上一次完成，**不做跨裝置即時同步**，電腦端靠重新整理頁面看最新進度即可。
5. **放射治療（單位 Gy，非 J）**：三大部位分類固定療程 — 胸/肩胛區 18Gy(6+6+6三次)、耳 8Gy(一次)、其他部位 15Gy(7.5+7.5兩次)。登打「手術切除」治療紀錄並填入手術日期後，系統依個案部位分類**自動產生對應次數的放療待辦**，首次到期日＝手術隔天（24小時內），之後連續每日一次排到做完。
6. **生物資料庫**：勾選式清單，不追蹤抽取人/領取人、不追蹤培養結果（這些留給院內檢驗/實驗室自己的系統管理）。
   - 勾「組織」→ 顯示：蠟塊／Keloid fibroblast原代培養／Periskin fibroblast原代培養，各自勾選＋日期（預帶當天，可改）
   - 勾「血液」→ 顯示：術前／術後治療第一天，各自獨立勾選＋日期，**可分次事後補填**，狀態呈現已收/待收
7. **個案頁面**：新增「收案階段進度條」（初診建檔→部位標記→手術登記→放療進行中→生物資料庫收集→長期追蹤），並優化建檔流程與版面易讀性（此項已著手進行，見 `PipelineProgress` 元件與 `v_case_pipeline_progress` view）。
8. **問卷/拍照頁面**：拿掉模擬 LINE 對話框的視覺包裝，改為診間工具風格的一般表單/拍照介面（因為現在是診間人員操作，不是病人自己在家用手機）。

**已知取捨**：問卷改為病人回診當下由診間人員協助完成，若病人未回診，該時間點問卷會缺漏——這是拿掉 LINE 自助填寫後必然的取捨。

**建議硬體**：不需新增採購。拍照沿用醫院已配發公務機；電腦沿用現有 HIS 工作站。需請資訊室確認：公務機瀏覽器版本是否支援相機權限存取；醫院內網防火牆是否允許連上 Vercel/Supabase 網域。

### 實作完成狀況（2026-07-26）

上述 1-8 項已全數實作並部署：

- **Schema**：新增 `body_part_zones`（精細部位＋劑量分類對照，後台可維護）、`radiotherapy_dose_protocols`（三大固定劑量方案）、`radiotherapy_sessions`（個案逐次放療追蹤）、`biobank_checklist_items`（勾選式生物資料庫）、`health_education_kb`（衛教資料庫）；`cases.body_part_zone_id`、`photos.body_part_zone_id` 新增欄位。與另一分支合併進來的 `biobank_samples`／`放射治療` treatment_type（舊資料 Excel 匯入用的整體療程摘要欄位）並存不衝突，用途不同（見 migration 檔內註解）。
- **人形部位圖**：`src/lib/bodyZones.ts` 定義正面/背面各 15-18 個熱區座標（簡化幾何圖形，非解剖寫實），`BodyDiagram.tsx` 呈現，`PhotoCaptureFlow.tsx` 串接「點部位→蒙板/尺規拍照」兩步驟。第一次拍照選的部位會自動設為個案主要部位；也可在個案頁面手動變更。
- **放射治療自動排程**：登打「手術切除」治療紀錄時（`src/app/cases/[id]/actions.ts` 的 `generateRadiotherapySessions`），依個案主要部位的劑量分類自動產生對應次數的 `radiotherapy_sessions`，首次到期日為手術隔天，之後連續每日一次。個案頁面可逐次標記完成並填實際劑量。
- **生物資料庫**：個案頁面新增勾選清單（組織：蠟塊/兩種原代培養；血液：術前/術後第一天），各自獨立勾選＋日期，可分次補填。
- **問卷/拍照頁面**：已移除模擬 LINE 對話框視覺包裝，改為一般診間表單/相機頁面；`submitted_via`/`uploaded_via` 預設值改為 `staff`。
- **衛教機器人**：`/admin/health-kb` 維護資料庫內容，`/kb-chat` 為示範對話頁（`src/lib/gemini.ts`），呼叫 Gemini API 並在 system instruction 中強制限定只能依資料庫內容回答。**尚未設定 `GEMINI_API_KEY` 環境變數**，需要使用者提供金鑰（Google AI Studio 免費層）才能實際測試；未設定金鑰時頁面會顯示提示訊息而非報錯。
- **未變動**：`v_case_pipeline_progress` 的 8 階段定義本次未擴充（仍是通用的建檔/同意書/LINE/診斷/治療/時程/追蹤/完整度），新功能（部位/放療/生物資料庫）目前是個案頁面上的獨立區塊，未整合進階段進度條的 8 個燈號，之後如需要可再擴充。

### 2026-07-27：對照《Keloid 收案資料平台建置》需求文件補齊落差

使用者提供部長端的完整需求文件（docx＋截圖），逐項比對後發現多處欄位缺漏或資料模型不一致，已補齊以下部分：

- **通用「後台可維護選單＋個案多選紀錄」機制**：新增 `case_intake_option_lists`／`case_intake_option_records`／`case_intake_option_record_items`（比照醫學術語庫模式），涵蓋四類：發生原因、如何得知看診資訊、飲食衛教、運動禁忌衛教——**飲食衛教/運動禁忌衛教特別要求做成可維護清單，不能只是單一勾選**（決策）。後台管理頁：`/admin/intake-options`。
- **病史與過往治療**：`cases` 新增 `keloid_onset_date`（初次發生時間）、`disease_history`（一般疾病史，與 keloid_history 不同）、`prior_treatment_physician`／`prior_steroid_treatment`／`prior_tcm_treatment`／`prior_ogawa_patch`／`prior_radiation_treatment`（收案前的治療史，與平台內 treatment_records 追蹤的「收案後」治療是不同概念）。個案頁面新增「病史與過往治療」區塊。
- **治療方式改為單次可複選多筆**：`TreatmentForm.tsx` 從單選改成 checkbox 多選，選中的每種方式各自展開欄位區塊，送出時每種方式各自建立一筆 `treatment_records`（同一天可有多筆），共用同一個治療/追蹤日期。新增「藥膏」「貼片」「追蹤（無治療）」三種治療類型。
- **復發改為每次追蹤都可記錄**：`treatment_records` 新增 `recurrence_observed`／`recurrence_description` 欄位，取代原本只能在個案層級記一次的做法；`cases.recurrence_status` 等欄位保留（仍作為統計截止時的個案層級結果快照，供舊資料 Excel 對齊使用），兩者並存、用途不同。
- **抽血從固定兩時間點放寬為任何追蹤時間點**：`treatment_records` 新增 `blood_drawn`／`blood_drawn_note`，任何一筆治療/追蹤紀錄都可勾選抽血並於備註註記是否為非常規時間點；原本 `biobank_checklist_items` 的術前/術後第一天兩個固定項目保留不動（仍是生物資料庫檢體收取的主要追蹤方式）。
- **生物資料庫補欄位**：`biobank_samples` 新增 `cell_quantity`（細胞量）、`storage_plate_count`（儲存盤數，與 `cryotube_location` 凍管位置是不同資訊）。
- **匯出同步更新**：`/api/export/structured-data` 的「2026平台新增欄位」群組新增上述所有欄位（含依個案彙總的治療方式清單、復發次數與情形、抽血次數與非常規備註等）。

**2026-07-27 追加：SF-36／PSQI 題目已建置完成**（`supabase/migrations/20260727030000_sf36_psqi_questionnaires_seed.sql`）：
- SF-36 健康調查簡表：36 道子題，`category='other'`（刻意不用 `'scale'`，避免跟 VSS 匯出邏輯裡假設 order_no 1-4 的計分寫死邏輯衝突）
- 匹茲堡睡眠品質量表 PSQI：18 道子題（含4題時間類用 text/number、10題睡眠困擾頻率單選、1題其他原因文字說明、4題整體評估單選）
- 兩者皆已可透過個案頁面「填寫問卷」直接選用並收資料
- **正式標準化計分公式尚未實作**（SF-36 各分量表轉換為0-100分；PSQI 7面向組合計算0-21分），目前只會收原始逐題答案，計分邏輯留待下一階段依需求撰寫

**2026-07-27 追加：Lab 生物標記數據模組已建置完成**：
- 新增 `lab_marker_definitions`（後台可維護標記清單，比照 term_library 模式，已預先塞入 IgE/Exosome/IL-1α/IL-1β/IL-6/TNF-α/MMP2/MMP9 共 8 項含單位）與 `lab_results`（個案＋標記＋採檢日期＋數值，`value` 存數字、`value_text` 保留無法轉數字的原始字串如 `<0.35` 等檢驗報告常見寫法）
- 後台管理頁：`/admin/lab-markers`（新增標記／停用啟用）
- 個案頁面新增「Lab 生物標記數據」區塊：選標記＋採檢日期＋數值＋備註即可新增，列表依採檢日期新到舊排序
- **尚未串接**：結構化資料匯出（`/api/export/structured-data`）目前還沒有把 lab 數據併入匯出欄位；因為同一個案可能有多標記×多次採檢，wide-table 格式怎麼攤平需要再確認（例如「每標記最新一筆」或「每標記每次採檢各一欄」），先收資料，匯出邏輯留待下一步

**2026-07-27 追加：SF-36／PSQI 正式標準化計分公式已實作**（`src/lib/scoring.ts`）：
- SF-36：採用 RAND Corporation 公版「RAND 36-Item Health Survey 1.0」計分法（公開資料，非需授權的 QualityMetric SF-36 版本），依 order_no 1-36 對照官方 Table 1（子題→0-100分重新編碼表）與 Table 2（8 個分量表各自平均的子題清單），輸出生理功能/生理健康角色限制/情緒問題角色限制/活力疲勞/情緒健康/社交功能/身體疼痛/一般健康感受 8 個 0-100 分數，缺題採「已答題目平均」（官方規則），非整份問卷作廢
- PSQI：採用 Buysse et al. 1989 原始計分演算法，7 面向各 0-3 分（主觀睡眠品質/睡眠潛伏期/睡眠時數/睡眠效率/睡眠困擾/安眠藥物使用/日間功能障礙），總分 0-21 分，>5 分＝睡眠品質不佳。**已知限制**：本平台第5j題（其他睡眠困擾原因）只收文字說明未收 0-3 頻率評分（官方要求 5b-5j 共9小題加總，本平台只加總 5b-5i 共8小題），會讓極少數重度個案的睡眠困擾面向分數略為低估，其餘6面向不受影響；睡眠效率計算需解析 Q1/Q3 的時間文字欄位與 Q4 的時數文字欄位，格式無法解析時該筆與總分回傳 null（顯示「資料不足」）而非用 0 頂替
- 個案頁面「問卷回覆紀錄」區塊：SF-36/PSQI 回覆會即時顯示計算後的分量表分數徽章
- 結構化資料匯出：`NEW_HEADERS` 新增 SF-36 8 分量表欄位＋PSQI 7 面向＋總分＋睡眠品質判定欄位

**2026-07-27 追加：人形部位圖蒙板對齊已完成**：使用者提供的 Gemini 生成人形參考圖（2x2：男/女×正/背面）經像素量測後確認可用——關鍵是原本用 alpha 通道判斷輪廓的腳本失敗（格線背景是烘焙進 RGB 像素、非真透明），改用白色 RGB 門檻（r,g,b>210）量測後成功取得正面/背面輪廓的真實邊界（頭頂/下巴/肩線/手臂末端/髖部/膝蓋等 y 座標與寬度剖面）。後續處理：
- 取男性版本裁切圖作為通用輪廓（正背面各一張，未做男女差異化，比照原本「非解剖寫實、去性別」的簡化人形圖設計原則）
- 去背並統一填色為淺灰（slate-300），輸出至 `public/body-diagram/front.png`、`back.png`
- `src/lib/bodyZones.ts` 的 18 個正面／15 個背面熱區座標，依實測的頭/頸/肩/軀幹/手臂/髖/腿真實像素邊界重新校正（viewBox 從原本憑空猜測的 `0 0 200 320` 改為對齊圖片實際像素的 `0 0 940 1136`），zone_key 命名不變，資料庫 `body_part_zones` 不需異動
- `BodyDiagram.tsx` 新增 `<image>` 背景圖層渲染輪廓圖，熱區色塊疊加其上；用 Pillow 疊圖腳本實測驗證對齊效果良好（頭/肩/軀幹/四肢/腿部熱區與輪廓吻合，僅少數手部熱區有些微超出輪廓，可接受，畢竟是點選熱區而非精細解剖遮罩）

**2026-07-27 追加：人形部位圖依性別切換男/女蒙板**：`src/lib/bodyZones.ts` 新增 `BODY_ZONE_SHAPES_FEMALE`（獨立一套座標，實測女性輪廓圖裁切位置的頭/頸/肩/胸/腰/四肢真實像素邊界，不能沿用男性座標，因兩張裁切圖的水平中心點與姿勢比例不同），並新增 `bodyZoneShapesFor(sex)`／`silhouetteImageFor(view, sex)` 依性別回傳對應座標與底圖（`front-female.png`/`back-female.png`，同樣的白色門檻去背處理）；未填/其他性別預設沿用男性版本。`BodyDiagram.tsx` 新增 `sex` prop；`/cases/new` 表單將性別選單移到人形圖之前並用 client state 即時連動；既有個案的拍照流程（`/patient/[caseId]/photo`）從 `cases.sex` 帶入。

**2026-07-27 追加：病歷號↔研究編號本機對照機制**（決策#1的實作落地）：
- 核心原則：病歷號絕對不送到 Vercel/Supabase，但頁面本身可以放在同一個網站上——差別在於「存檔邏輯是否呼叫伺服器」，不在於「頁面網址在哪」。
- `src/lib/localMrnStore.ts`：全部函式皆為瀏覽器端執行（`"use client"`），用 File System Access API（僅 Chrome/Edge 桌面版支援）直接讀寫使用者選定的本機 CSV 檔案；檔案 handle 存在 IndexedDB，同一瀏覽器下次造訪可重用（仍需依規範重新確認權限，但不必重選檔案）。權限確認（`requestPermission`）務必在使用者手勢觸發的當下呼叫，不能包在無關的 await 之後，否則瀏覽器會拒絕彈出授權。
- `/cases/new`：新增「病歷號」欄位（明確標示「僅存本機，不上雲端」），送出邏輯改成 client-side 手動兩段式：①用不含病歷號的 FormData 呼叫 `createCaseAction`（改為 return `{caseId, researchId}` 而非直接 `redirect`）建立雲端個案 ②用回傳的研究編號＋本機保留的病歷號寫入本機 CSV。若本機寫入失敗，個案仍已建立成功，畫面會顯示待補資訊與「重試寫入」按鈕，避免這筆對應憑空遺失。
- `/local-tools/mrn-mapping`（新增頁，NAV_LINKS 可進入）：檢視/搜尋本機對照表、手動補登舊資料的對照（用研究編號查 `lookupCaseIdByResearchId` server action 帶出個案 id，這支 action 只接受研究編號，不接受病歷號參數）。
- `CaseSearchBox`（`/cases`、`/` 首頁皆有）：輸入病歷號時，先在瀏覽器本機比對對照表換成研究編號，再用研究編號查詢 Supabase（`?q=` 參數，`/cases` 頁面對 research_id/醫師代碼與姓名/部位做子字串比對）。
- 型別補丁：`src/types/file-system-access.d.ts` 補齊 TS lib.dom.d.ts 缺少的 `queryPermission`/`requestPermission`/`showSaveFilePicker` 宣告。

**2026-07-27 追加：發生原因/衛教選單「其他」可填詳細說明**：`IntakeOptionForm.tsx`（新拆出的 client component）用 checkbox 狀態偵測是否勾選了 label 以「其他」開頭的選項，勾選時才顯示一個 `notes` 文字輸入框（`case_intake_option_records.notes` 欄位原本就有、只是先前 UI 沒開放輸入）。判斷純靠 label 前綴，哪個分類有「其他」選項由後台 `/admin/intake-options` 自行決定，不寫死在程式碼。

**2026-07-27 追加：JSS 疤痕量表（JSW Scar Scale, 2015版）已建置**（`supabase/migrations/20260727050000_jss_scar_scale_seed.sql`、計分邏輯在 `src/lib/scoring.ts`）：
- 拆成兩份獨立問卷（`category='other'`，原因同 SF-36/PSQI，避免跟 VSS 的 `category='scale'` 加總邏輯衝突）：
  - **JSS 疤痕診斷分類表**（初診用，7題）：4項臨床特徵（高度隆起/發紅血管/硬度浸潤/生長趨勢，各0/1/3分）＋部位風險（1/2/3分，單選三個風險等級）＋家族史／個人史（各0/2分）。選項的 value 就是計分點數，加總即總分：0-5分成熟疤痕、6-15分肥厚性疤痕、16分以上蟹足腫。
  - **JSS 症狀與治療追蹤評估表**（每次追蹤用，6題）：硬度/隆起高度/發紅程度/充血範圍/疼痛感/瘙癢感，各0-3分，總分0-18分。
- 個案頁面「問卷回覆紀錄」：分類表顯示總分＋判定；評估表顯示總分，並自動算 **Delta Score**（以個案最早一筆評估回覆的總分當基準，跟每筆回覆相減，正值代表改善）。
- 結構化匯出新增對應欄位（分類總分/判定、評估初次總分/最近總分/Delta Score）。

**2026-07-27 追加：視覺設計系統（黃綠色醫學機構風格）與按鈕/連結互動優化**：
- `src/app/globals.css` 新增 `@theme` 品牌色階（`brand-*` 松綠、`accent-*` 暖金黃、`ink`/`paper` 中性色），全站背景改為淡雅的雙色放射狀漸層取代純白
- 字型：`layout.tsx` 改用 `next/font/google` 載入 Noto Serif TC（標題，`font-heading`）／Noto Sans TC（內文，`font-body`）／IBM Plex Mono（數據/表格數字，`font-data`），取代原本沒有中文字重的 Geist
- 全站按鈕/連結互動回饋（`globals.css`）：所有 `<button>`/`<a>` 統一有 `:active` 按下縮小+變暗效果與 `:focus-visible` 焦點框，不需個別頁面處理，任何按鈕都看得出「有沒有按到」
- 新增共用元件 `src/components/ui/`：`Button.tsx`（variant: primary/accent/outline/ghost/danger，`pending` prop 顯示 loading 圈圈）、`SubmitButton.tsx`（用 React `useFormStatus()` 自動反映所在 `<form action={...}>` 的送出中狀態，不需每個表單手動管理 loading state）、`Spinner.tsx`、`BrandMark.tsx`（品牌識別圖案）、`buttonStyles.ts`（純樣式函式 `buttonClasses()`，給 `<Link>` 等非 button 元素套用同款樣式；**注意**：`Button.tsx` 有 `"use client"`，Server Component 要用樣式必須從 `buttonStyles.ts` 直接 import，不能從 `Button.tsx` re-export，否則會炸「Attempted to call from server but function is on the client」)
- 已套用新視覺＋SubmitButton 的頁面：`/login`、`/operator`、`AppHeader`、`/`（dashboard）、`/cases`、`/cases/new`、`/cases/[id]`（含所有子表單提交鈕，逐一手動轉換，共 12 個）
- `src/lib/pipeline.ts` 的 `progressTone()` 改用品牌綠階取代 sky 藍

**2026-07-27 追加：個案頁面互動與資料呈現修正**（使用者實測回饋）：
- **主要蟹足腫部位改為直接人形圖點選**：新增 `src/app/cases/[id]/BodyZonePicker.tsx`（client component），取代原本「變更主要部位」下拉選單，直接嵌入 `BodyDiagram` 讓使用者點圖選部位、選好後按鈕才會啟用送出，不用先點連結跳去拍照頁才能改部位
- **傷口照片改為顯示縮圖**：`wound-photos` bucket 是私有（非公開），原本個案頁面只印出 `file_path` 文字、看不到照片本身；現在改為個案頁面渲染時對每張照片呼叫 `supabase.storage.from("wound-photos").createSignedUrl()` 產生 1 小時效期的簽章網址，用縮圖 grid 呈現，點擊可開大圖（新分頁）
- **收案一條龍「資料完整度」燈號修正**（`v_case_pipeline_progress` view）：原本 `step_complete` 只檢查 `case_data_completeness` 表，但那張表只有舊資料回溯建檔的個案才會有列，正常收案的個案永遠沒有 pending 列、導致這個燈號恆亮，形同虛設。分兩步修正：
  - `20260727060000_pipeline_basic_info_completeness.sql`：正常收案先改為檢查性別/年齡/主要部位三欄
  - `20260727061000_pipeline_completeness_full_demographics.sql`：使用者實測發現 JSW score／家族史／keloid history／keloid 大小四欄空著時燈號仍然亮著——因為第一版只檢查三欄，範圍不夠。改為要求「病人基本資料」區塊全部 7 個欄位（性別/年齡/主要部位/JSW score/家族史/keloid history/keloid 大小）都有值才算完成
- **追蹤時程卡片對齊既有卡片風格**：`section-schedule` 的每一項從「一行 flex-wrap（標籤/狀態/連結全部擠在一起，手機上會亂換行）」改成跟 `/cases` 頁「快速前往待處理項目」一樣的堆疊卡片版型（上方資訊自由換行、下方動作列水平捲動不換行）
- `BodyDiagram.tsx` 順便修掉一個既有的 React 警告（`key` 透過 `{...commonProps}` 展開傳遞，改成直接寫在 JSX 上）

**2026-07-27 追加：照片縮圖與刪除功能**：
- 拍照時瀏覽器端（`CameraCapture.tsx`）額外用 canvas 縮放產生一張最長邊 400px 的縮圖一併上傳，`photos.thumbnail_path` 記錄縮圖路徑（`supabase/migrations/20260727062000_photo_thumbnails.sql`）；個案頁面的照片 grid 改顯示縮圖網址，只有點開大圖才載入原始解析度，降低瀏覽流量（egress）。縮圖上傳失敗不影響原圖，前端會 fallback 顯示原圖。舊照片沒有縮圖時同樣 fallback 用原圖，不需要回填。
- 新增刪除照片功能：`DeletePhotoButton.tsx`（跳確認對話框）→ `deletePhotoAction`，會同時刪除 Storage 裡的原圖與縮圖檔案以及 `photos` 資料表列。
- `/admin` 後台管理首頁新增「病歷號對照設定」入口後，導覽列的「病歷號對照」移除（避免重複入口，統一從後台管理進入）。

**2026-07-27 追加：後台管理頁面分類 + 補齊完整 CRUD**：
- `/admin` 後台管理首頁原本 12 張卡片攤平在一個網格，內容變多後不好找，改為分 5 組呈現：收案內容維護（ICD/術語庫/發生原因衛教選單）、治療與追蹤設定（治療類型套組/時程範本/Lab標記）、問卷與衛教（問卷產生器/衛教資料庫）、團隊與帳號設定（醫師代碼/操作者）、資料與系統工具（舊資料匯入/病歷號對照設定）
- 這幾個「可維護清單」型後台頁面（醫師代碼、ICD碼、衛教資料庫、發生原因等四類選單、Lab標記、操作者、術語庫）原本都只有「新增」＋「停用/啟用」，沒有真正的編輯/刪除，改錯字只能停用舊的、新增一筆對的，很不方便。新增共用元件 `src/components/admin/EditableListItem.tsx`，統一提供「編輯」（原地展開成表單）與「刪除」（跳確認對話框），7 個頁面（doctors/icd/health-kb/intake-options/lab-markers/operators/terms）都補齊了 `update*Action`／`delete*Action`。
  - **設計取捨**：刪除是真的硬刪除（不是軟刪除），但這些清單大多有其他表用外鍵引用（例如 ICD碼被 case_diagnoses 引用、術語被 case_term_record_items 引用），如果該筆已經被個案資料使用，刪除會因外鍵限制而失敗——這是刻意保留的保護機制，失敗時清單不會壞掉，只是那筆刪不掉，這時候應該改用旁邊的「停用」。目前失敗時前端沒有跳錯誤訊息（demo 階段先不做，若之後需要要跟目前病歷號新增流程一樣改成 client 端攔截 server action 回傳值）。
  - 醫師代碼/ICD碼的識別欄位（code）、Lab標記的 marker_key 皆可編輯但保留在同一筆記錄（沒有級聯更新其他表的顯示快取，正常情況不影響，因為其他表都是存 id 外鍵不是存文字快照）。

**2026-07-27 追加：JSS 分類問卷送出後自動回填 JSW score**：`submitQuestionnaireAction`（`src/app/patient/[caseId]/questionnaire/[[...itemId]]/actions.ts`）偵測到送出的是「JSS 疤痕診斷分類表」時，直接算出總分與判定並寫回 `cases.jsw_score`（格式如「15分（肥厚性疤痕）」），不用再手動謄一次。已實測：填完 7 題送出後，個案頁「病人基本資料」的 JSW score 欄位正確帶入分數。（先前使用者回報「性別選了存不進去」，實測 DB／伺服器渲染／瀏覽器 DOM 三方比對皆正確，判斷是瀏覽器快取或畫面渲染的偶發問題，非程式錯誤。）

**2026-07-27 追加：病人基本資料／病史欄位大改版（多項使用者實測回饋）**：
- **家族史／疾病史**：新增 `src/app/cases/[id]/FamilyHistoryPicker.tsx`（彈出視窗勾選常見疾病，後台可維護 `case_intake_option_lists` 新category `family_disease`：高血壓/糖尿病/心臟病/腦中風/癌症/氣喘過敏/蟹足腫或肥厚性疤痕/其他），勾選「其他」可自填，按「帶入」組成文字寫回原本的 `family_history`／`disease_history` 文字欄位（沿用 `updateDemographicsAction`／`updatePriorHistoryAction`，兩個欄位共用同一份選項清單、同一個元件，只是 `name` 不同）。開啟時會嘗試從既有文字反推已勾選項目。
- **Keloid history 改為勾選＋一律顯示詳細內容**：`IntakeOptionForm.tsx` 新增 `alwaysShowNotes` prop（原本只有勾到「其他」開頭選項才顯示備註欄，這裡改成一律顯示，因為部位/時間/治療是必要細節而非「其他請說明」）。新增 category `keloid_history_type`（初次發生/手術後復發/藥物治療後復發/多處復發/自然穩定無變化/其他），沿用既有 `case_intake_option_records` 機制記錄歷次紀錄。
- **Keloid 大小改為可複數的病灶測量**：原本 `cases.keloid_size` 單一自由文字欄位改為新表 `case_keloid_lesions`（部位＋長寬高cm＋備註，可複數筆，配「＋新增病灶」按鈕與各筆刪除鈕），因為現存病灶可能不只一處。舊 `keloid_size` 欄位保留但不再由 UI 寫入（供舊資料對齊/匯出參考）。新增 `src/app/cases/[id]/KeloidLesionSection.tsx` 與對應 `addKeloidLesionAction`／`deleteKeloidLesionAction`。
- **之前類固醇/中醫/小川令貼布/放射治療史改為三態＋詳細欄位**：新增 `PriorTreatmentPicker.tsx`，先選「有／無／不知道」，選「有」才展開日期/次數/劑量/備註，組成文字寫回原本四個文字欄位（沿用 `updatePriorHistoryAction`，未改動 action 本身）。
- **蟹足腫初次發生時間改用日期選擇器**：從純文字（可填「2019年初」）改成 `<input type="date">`，點擊會跳原生日曆選取；取捨是不能再填模糊時間，只能選精確日期。
- `updateDemographicsAction` 已移除 `keloid_history`／`keloid_size` 的寫入（改由上述新機制各自處理），避免舊表單欄位消失後把這兩欄位覆蓋成 null。
- Migration：`20260727070000_family_disease_options_seed.sql`（含放寬 `case_intake_option_lists` 的 category CHECK constraint）、`20260727080000_keloid_history_type_and_lesions.sql`。
- 已用瀏覽器實測：家族史/疾病史彈窗、keloid history 勾選新增紀錄、病灶測量新增（左耳垂 2.5cm 測試資料）皆正確寫入並顯示。

**2026-07-27 追加：個案頁面區塊順序調整**：「主要蟹足腫部位」（`section-bodyzone`）從原本排在「病史與過往治療」之後，移到「病人基本資料」區塊內的「現存病灶大小測量」下方（同樣在「病史與過往治療」之前），流程上大小測量與部位標記相鄰更直覺。純調整 `src/app/cases/[id]/page.tsx` 內 JSX 區塊順序，無資料庫/元件變動。

**2026-07-27 追加：治療紀錄新增每筆各自的部位欄位**：`treatment_records` 新增 `body_site` 欄位（migration `20260727090000_treatment_record_body_site.sql`），不建外鍵、純文字，因為同一個案在不同部位分開治療時，原本只能靠個案層級的主要部位判斷，無法區分是哪一筆治療對應哪個部位。`TreatmentForm.tsx` 新增「部位」欄位（`<input list>` + `<datalist>`），建議清單來自個案目前的主要部位＋「現存病灶大小測量」已登記的各部位，也可自由輸入新部位；同一次送出（可複選多種治療方式）目前共用同一個部位值，跟「治療/追蹤日期」的設計方式一致。已用瀏覽器實測：新增一筆「病灶內注射」勾選部位「左耳垂」，個案頁列表正確顯示「部位：左耳垂」標籤。結構化匯出（`/api/export/structured-data`）用 `select("*")`，新欄位會自動包含不需額外改動。

**仍未處理 / 待確認**：
- Lab 數據尚未併入結構化資料匯出
- 追蹤時程範本的問卷指定：目前是後台 `/admin/schedules` 設定時程範本時，每個時間點各自指定固定的 `questionnaire_id`（可維護、非寫死在程式碼），但套用範本產生個案實際時程後，該筆的問卷是複製自範本、事後不能在個案頁面單獨換成別份問卷——如果需要「同一個時間點事後可以改填別份問卷」，需要額外加編輯功能
- 傷口照片檢視目前用短效期簽章網址（1小時），如果之後要在個案頁面停留很久或分享連結給別人看，需考慮改用重新整理時即時產生，或是提供「重新產生連結」的按鈕
