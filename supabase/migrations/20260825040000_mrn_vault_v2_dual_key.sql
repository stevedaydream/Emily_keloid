-- 保管庫格式 v2：雙金鑰（通行碼／救援碼）。
-- v1 是「通行碼直接導出內容金鑰」，忘記＝永久解不開。v2 改成內容用隨機 DEK 加密，
-- DEK 分別用通行碼與救援碼各包一份，任一把都能解開 → 忘記通行碼可用救援碼還原並重設。
--
-- salt/iv/iterations 三欄在 v2 用不到（改放進 wraps 裡，兩份 wrap 各有自己的一組），
-- 但保留可為 null 以相容既有的 v1 資料列。

alter table public.mrn_vault
  add column if not exists format smallint not null default 1,
  add column if not exists wraps jsonb;

alter table public.mrn_vault
  alter column salt drop not null,
  alter column iv drop not null,
  alter column iterations drop not null;

comment on column public.mrn_vault.format is '1=通行碼直接加密內容（舊）；2=雙金鑰包 DEK（通行碼／救援碼）';
comment on column public.mrn_vault.wraps is 'v2：{passphrase:{salt,iv,iterations,wrapped}, recovery:{...}}。兩份都只是被包住的 DEK，沒有通行碼也沒有救援碼。';

alter table public.mrn_vault_versions
  add column if not exists format smallint not null default 1,
  add column if not exists wraps jsonb;

alter table public.mrn_vault_versions
  alter column salt drop not null,
  alter column iv drop not null,
  alter column iterations drop not null;
