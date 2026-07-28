-- 開發用逃生口（2026-07-29）：行動裝置上以「唯讀、僅此工作階段」的方式掛載病歷號對照表。
--
-- 背景：對照表平常走 File System Access API 直接讀寫本機 CSV，而該 API 只有桌機版
-- Chrome/Edge 有實作，手機／平板一律沒有——那是瀏覽器限制，不是應用層權限，給誰都一樣。
-- 但開發階段在手機上看不到姓名很難對問題，所以另外開一條路：用 <input type="file">
-- 讀一次 CSV，只放在記憶體（React state），**不寫 IndexedDB、不落地**，重整就沒了。
--
-- 為什麼要旗標而不是全面開放：平板是要交到病人手上的那一台（見 pending.md C1b），
-- 不該讓每個人都能順手把病歷號＋姓名讀進那台裝置的畫面。預設 false，只開給工程人員。
-- **Phase 1 正式收案前應全部關掉。**
alter table public.operators
  add column if not exists dev_mobile_mapping boolean not null default false;

comment on column public.operators.dev_mobile_mapping is
  'DEV ESCAPE HATCH: lets this operator mount the local MRN/name CSV read-only on mobile (via <input type=file>, kept in memory for the session only, never persisted). Mobile browsers lack the File System Access API, so the normal read/write mount is desktop-only. Turn every one of these off before Phase 1 go-live.';

update public.operators
set dev_mobile_mapping = true
where role ilike '%開發%' or role ilike '%維運%';
