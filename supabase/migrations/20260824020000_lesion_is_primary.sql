-- 主病灶標記（助理 2026-08-24 裁決）。
--
-- JSS 疤痕診斷分類表有一半的題目是描述**單一顆疤**的（大小、垂直生長、水平生長、形狀、
-- 周圍紅斑、主觀症狀），而一個病人最多有 5 顆蟹足腫。助理裁決「只評估主要手術的那一顆」，
-- 所以資料上必須指得出來是哪一顆——否則多病灶個案的 JSS 事後仍然無法解讀
-- （pending.md E5 要解的正是這件事）。
--
-- 用「勾一顆」而不是沿用既有的「部位1 慣例」：登記順序是人手排的，
-- 事後沒有任何欄位證明部位1 就是開刀那顆。
--
-- 一個個案只能有一顆主病灶，用 partial unique index 由資料庫保證。

alter table public.case_keloid_lesions
  add column if not exists is_primary boolean not null default false;

comment on column public.case_keloid_lesions.is_primary is
  'The main surgical keloid lesion. JSS scar classification is scored on this lesion only (decision 2026-08-24). At most one per case.';

-- 既有資料：每個個案的 site_no 最小者視為主病灶（＝現行「部位1＝最嚴重、要開刀那顆」的慣例）
update public.case_keloid_lesions l
set is_primary = true
where l.id in (
  select distinct on (case_id) id
  from public.case_keloid_lesions
  order by case_id, site_no nulls last, created_at
);

create unique index if not exists case_keloid_lesions_one_primary_per_case
  on public.case_keloid_lesions (case_id)
  where is_primary;
