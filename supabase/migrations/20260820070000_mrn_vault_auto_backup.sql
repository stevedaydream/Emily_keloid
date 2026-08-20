-- 決策 2026-08-20：收案動線移到平板後，本機 CSV 不再是病歷號對照的權威來源，
-- `mrn_vault` 那一個 blob 變成唯一來源。單一 blob 損毀／誤刪＝所有已收案病人再也對不回真人，
-- 而且會在最壞的時間點才被發現，所以每次寫入都自動留一份版本快照。
--
-- 這只防「blob 壞掉／被覆蓋錯」，**防不了忘記通行碼**——快照一樣是密文，
-- 用的是同一組通行碼。那個風險只能靠人記得，系統無解（伺服器從頭到尾沒有通行碼）。

create table if not exists public.mrn_vault_versions (
  id uuid primary key default gen_random_uuid(),
  ciphertext text not null,
  salt text not null,
  iv text not null,
  iterations int not null,
  row_count int not null,
  created_at timestamptz not null default now(),
  created_by text
);

comment on table public.mrn_vault_versions is
  'Automatic snapshot of every mrn_vault write. Ciphertext only — the server never holds the passphrase, so these protect against corruption/overwrite, not against a forgotten passphrase. Pruned to the newest 30 on each write.';

create index if not exists mrn_vault_versions_created_at_idx
  on public.mrn_vault_versions(created_at desc);

alter table public.mrn_vault_versions enable row level security;
drop policy if exists anon_full_access on public.mrn_vault_versions;
create policy anon_full_access on public.mrn_vault_versions for all to anon using (true) with check (true);
grant all on public.mrn_vault_versions to anon, authenticated;
