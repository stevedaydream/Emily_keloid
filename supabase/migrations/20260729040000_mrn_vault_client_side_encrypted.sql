-- 病歷號對照表的「雲端加密保管庫」。
-- 決策 #1 的界線維持不變：伺服器與資料庫**永遠只看得到密文**。
-- 加解密全部在瀏覽器端用 Web Crypto 完成（PBKDF2-SHA256 + AES-GCM），
-- 通行碼不會出現在任何請求、log 或資料庫欄位裡。
create table if not exists public.mrn_vault (
  id text primary key default 'default' check (id = 'default'), -- 單列表：整份對照表加密成一個 blob
  ciphertext text not null,   -- base64(AES-GCM 密文)
  salt text not null,         -- base64(16 bytes)，PBKDF2 用
  iv text not null,           -- base64(12 bytes)，AES-GCM 用
  iterations integer not null default 310000,
  row_count integer not null default 0, -- 非敏感的筆數，讓畫面不用解密就能顯示「雲端有 N 筆」
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.mrn_vault is 'Client-side encrypted MRN mapping vault. The server stores only ciphertext; encryption/decryption happens in the browser (PBKDF2-SHA256 + AES-GCM) and the passphrase never reaches the server. Preserves architecture decision #1 (the cloud never holds plaintext medical-record numbers).';
comment on column public.mrn_vault.ciphertext is 'Base64 AES-GCM ciphertext of the whole mapping CSV. Opaque to the server.';
comment on column public.mrn_vault.salt is 'Base64 PBKDF2 salt (16 bytes).';
comment on column public.mrn_vault.iv is 'Base64 AES-GCM initialization vector (12 bytes).';
comment on column public.mrn_vault.row_count is 'Number of mapping rows, stored in clear so the UI can show progress without decrypting. Not sensitive on its own.';

alter table public.mrn_vault enable row level security;
drop policy if exists anon_full_access on public.mrn_vault;
create policy anon_full_access on public.mrn_vault for all to anon using (true) with check (true);
grant all on public.mrn_vault to anon, authenticated;
