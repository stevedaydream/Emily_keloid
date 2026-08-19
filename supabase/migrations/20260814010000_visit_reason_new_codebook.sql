-- Primary_Visit_Reason 改採部長新版碼表（2026-08-14 使用者決議「照新版」）。
--
-- 先前記在 pending.md 衝突 ② 的「選項 5 與 6 文字重複」是誤判：
-- 新版碼表其實是**整份只剩 6 項**——拿掉了「希望取得第二醫療意見或了解其他治療選擇」，
-- 「其他」因此從 7 遞補為 6。我們是拿舊的 7 項清單去對，才會看起來像 5、6 重複。
--
-- 新版原文：
--   1. 初次發生蟹足腫，尋求治療
--   2. 已接受治療，但效果不理想，尋求其他治療方式
--   3. 治療後復發，尋求再次治療
--   4. 曾多次治療及復發，尋求進一步治療
--   5. 原有治療效果良好，希望持續接受治療或追蹤
--   6. 其他
--
-- 「希望取得第二醫療意見…」目前 0 筆個案引用（已確認），所以直接刪除而非停用：
-- 留著停用的話它會繼續出現在匯出的「編碼對照表」附表裡，且代碼 6 會與新的「其他」撞號。
-- 若日後已有個案引用，外鍵會擋下這個 delete——那時改成 active=false ＋ export_code=null。

delete from case_intake_option_lists
where category = 'visit_reason'
  and label = '希望取得第二醫療意見或了解其他治療選擇';

update case_intake_option_lists
set export_code = 6, sort_order = 6
where category = 'visit_reason' and label = '其他';
