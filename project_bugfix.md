# 踩坑紀錄（project_bugfix.md）

> 收錄「修了三次以上才解決」或「具平台特殊性」的問題。日常的小 bug 不進來。

---

## 2026-08-20｜平板填問卷到 PSQI 第49題整頁崩掉

**症狀**：平板（Android Chrome）新建個案後交給病人自填，填到「第 49 題」按下選項，
畫面跳到下一題時整頁掛掉（Chrome 顯示 `This page couldn't load`），該次 PSQI 作答未寫入。

**成因**：`PatientIntakeFlow` 把整份流程攤平成 `screens` 陣列，**長度會隨作答改變**——
第 49 題正好是 PSQI 第10題「您有睡伴或室友嗎？」，答「沒有睡伴或室友」時
第11題的四小題（order_no 21-24）整組被濾掉，總題數當場從 51 掉到 49。

但單選題是 `autoAdvance`：`onClickCapture` 在**點下去那一刻**就排了
`setTimeout(() => goNext(index), 220)`，那個 closure 抓到的是**改答案之前**的 `screens`（51 筆）。
220ms 後執行時它看到 `screens[49]` 還在、判定「同一段落、不用存」，於是 `setIndex(49)`；
可是這時真正的 `screens` 只剩 49 筆，`screens[49]` 是 `undefined`，
render 的 `screen.segment` 直接 TypeError → 整棵樹掛掉。順帶連 PSQI 那一段的儲存也被跳過。

**平台特殊性**：桌機開發時很難碰到——要剛好在「會讓題數縮水的那一題」上用自動翻頁才會觸發。

**修法**（`src/app/patient/[caseId]/intake/PatientIntakeFlow.tsx`）：
1. `screensRef` 存最新的 `screens`，`goNext` 一律讀 ref 而不是 closure 裡那份；`current` 不存在就直接 return。
2. render 端把 `index` 夾回範圍內（`pos = Math.min(index, screens.length - 1)`）當保險。
   病人手上的平板沒有錯誤畫面可退，崩一次就得整份重填。

**教訓**：只要「畫面清單的長度會被作答影響」，任何延遲執行的翻頁動作都不能吃 closure 裡的舊清單。

---

## 2026-08-20｜平板上「改選其他對照表」的 CSV 全部反灰選不到

**症狀**：在平板的收案頁按「建立新的」對照表，真的在「下載」資料夾生出兩個 0 byte 的
`病歷號對照表.csv`；接著按「改選其他對照表」時，檔案選擇器裡那些 CSV **全部反灰選不到**，切不過去。

**成因**：`isFileSystemAccessSupported()` 只判斷 `"showSaveFilePicker" in window`。
這條件在寫的時候等同「桌機 Chrome/Edge」，但 Android Chrome 後來也掛得出這支 API，
於是平板走上了為桌機寫的那條路，而那條路有兩個桌機專屬的假設：

1. **`types` 的語意在兩邊不一樣（反灰主因）**：`showOpenFilePicker` 帶了
   `accept: { "text/csv": [".csv"] }`。桌機的選擇器是**過濾副檔名**，Android 的選擇器是
   **過濾系統認定的 MIME**、完全不看副檔名——同樣一個 `.csv`，來源不同會被標成
   `text/comma-separated-values`／`application/vnd.ms-excel`／`application/octet-stream`……
   一設 `accept` 就整批變灰，連自己剛用存檔對話框建的那份也選不到。
   （同一個坑在 `local-tools/mrn-mapping` 的 `<input type="file">` 已經踩過一次，
   那裡的註解就寫著不能設 `accept`。）
2. **權限 API 不存在**：`ensurePermission()` 直接呼叫 `handle.queryPermission()`，
   但那是桌機才有的權限持久化機制，Android Chrome 沒有實作，硬呼叫會 TypeError。

**修法**（`src/lib/localMrnStore.ts`）：**只修反灰，不擋平板**——
使用者明確要求平板必須能讀寫對照表，所以 `isFileSystemAccessSupported()` 維持原判斷：

- 新增 `isMobileDevice()`（`userAgentData.mobile` ＋ UA 比對，含 iPadOS 13+ 偽裝成
  Macintosh 要靠 `maxTouchPoints` 分辨），**只用來決定檔案選擇器要不要帶 `types`**：
  行動裝置一律不帶，內容本來就由 `parseRows` 驗；桌機保留，免得滿畫面無關檔案。
- `showSaveFilePicker` 也一併不帶 `types`：存檔時帶進去的 MIME 會被系統記在那個檔案上，
  之後用開檔選擇器找它反而更容易對不上。
- `ensurePermission()` 補上兩支權限 API 缺席時的處理：直接放行。
  少了它們不代表沒權限——剛從選擇器拿到的 handle 本來就可讀寫，
  真的不能寫時 `createWritable()` 會自己丟錯，訊息也比「權限被拒絕」精確。

**已知取捨**：病歷號與姓名會落在平板上，而平板同時是交給病人自填的那一台
（pending.md C1b：Phase 0 沒有裝置隔離）。使用者在被提醒後決定保留此能力，
正式收案前應搭配裝置管理措施（螢幕鎖、不外借），Phase 1 送 IRB 時要一併說明。
平板下載資料夾那兩個 0 byte 的 CSV 是測試時建的空檔，可以刪掉。

**教訓**：`accept`／`types` 在桌機是過濾副檔名、在 Android 是過濾系統 MIME，行為完全不同。
行動裝置的檔案選擇器一律不要帶型別過濾。

## 病史與過往治療：日期輸入框壓在隔壁欄上（2026-08-29）

**症狀**：手機上「之前類固醇注射治療」「之前小川令貼布使用史」展開後，日期輸入框溢出並蓋住
右邊的「次數」格，文字被截掉（使用者截圖回報）。

**成因（兩層，缺一不可）**：

1. `PriorTreatmentPicker` 的細節列是 `grid-cols-3`，而元件本身又被外層的 `grid-cols-2` 夾住，
   手機上每格只剩約 60px。
2. **關鍵在 grid item 的 `min-width: auto`**，不是軌道。Tailwind 的 `grid-cols-3` 本來就是
   `repeat(3, minmax(0,1fr))`，軌道縮得下去；但 grid item 預設 `min-width:auto` 會解析成
   min-content 寬度，而 `<input type="date">` 是替換元素、min-content 就是它的原生寬度（約 140px+），
   於是**項目撐破自己的軌道**疊到隔壁。

**修法**：項目加 `w-full min-w-0`（真正解掉溢出），並改成手機單欄
`grid-cols-[minmax(0,1fr)] sm:grid-cols-3`（55px 的日期框就算不重疊也沒法用）。
備註框的 `col-span-3` 要改成 `sm:col-span-3`——單欄時跨 3 軌會長出 2 個隱含欄，反而變三倍寬再溢出一次。

**教訓**：grid 裡放原生日期／數字輸入框而排版又窄時，`minmax(0,1fr)` **不夠**，
一定要在項目上加 `min-w-0`。只改軌道不會有效果。

**驗證**：容器壓到 177px 時三欄各 55px、無溢出無重疊；探針確認
`grid-cols-[minmax(0,1fr)]` 有被編出來（單一軌道、三個輸入框各自成列），所以 <640px 會正確堆疊。
