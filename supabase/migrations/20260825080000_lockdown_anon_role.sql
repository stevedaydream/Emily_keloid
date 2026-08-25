-- 收回 anon 角色的資料表權限（pending.md G1）。
--
-- ⚠️⚠️ **套用之前一定要先把 `SUPABASE_SERVICE_ROLE_KEY` 設進執行環境**
--        （Vercel 專案的環境變數 ＋ 本機 .env.local），否則整個平台會立刻讀不到任何資料。
--        程式端已改成優先用 service_role、找不到才退回 anon（見 src/lib/supabase.ts）。
--
-- 為什麼要做：2026-08-25 起病歷號與姓名明文存在 cases 裡。在那之前 anon key 外流只會流出
-- 去識別化資料；現在等同姓名與病歷號外流。
--
-- 要誠實說明風險有多大：這個平台的 anon key **沒有**進到瀏覽器端（環境變數沒有 NEXT_PUBLIC_
-- 前綴，也沒有任何 client component 直接查 Supabase，實測 grep 打包後的 .next/static 找不到），
-- 所以這不是「金鑰正在外流」的緊急修補，而是**深度防禦**：萬一哪天有人手滑加了 NEXT_PUBLIC_、
-- 或金鑰從 log／截圖／舊備份流出去，資料庫層還有一道。
--
-- 做法：撤掉 anon 對 public schema 所有資料表的權限，並關掉「未來新建的表自動給 anon 權限」。
-- authenticated 一併撤——本平台不使用 Supabase Auth，沒有任何 authenticated 使用者。

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 之後新建的表不要再自動授權給 anon（否則加一張表就破一個洞）
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 連 schema 都不給用，PostgREST 就查不出任何東西
revoke usage on schema public from anon, authenticated;

-- RLS policies 留著不動：它們現在沒有作用（沒有角色進得來），但如果日後要恢復
-- anon 存取或導入 Supabase Auth，policy 還在就不必重寫。
