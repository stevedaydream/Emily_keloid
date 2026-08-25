-- ============================================================
-- Storage：兩個 bucket 與存取政策
-- 在新專案跑完 01/02 之後跑這一支。
-- ============================================================

-- wound-photos：**私有**。傷口照片絕對不能公開讀取——
-- 平台一律透過 /api/photos/<id> 產生 300 秒的簽章網址。
insert into storage.buckets (id, name, public)
values ('wound-photos', 'wound-photos', false)
on conflict (id) do update set public = false;

-- term-library-images：公開。術語庫的示意圖，沒有病人資料。
insert into storage.buckets (id, name, public)
values ('term-library-images', 'term-library-images', true)
on conflict (id) do update set public = true;

-- ⚠️ 下面兩條政策是給 anon 用的（demo 期的刻意取捨）。
-- 正式上線改用 SUPABASE_SERVICE_ROLE_KEY 之後，service_role 本來就會繞過 RLS，
-- 這兩條可以（也應該）連同 03_lockdown_anon.sql 一起收掉。
drop policy if exists anon_wound_photos_access on storage.objects;
create policy anon_wound_photos_access on storage.objects
  for all to anon
  using (bucket_id = 'wound-photos') with check (bucket_id = 'wound-photos');

drop policy if exists anon_term_images_access on storage.objects;
create policy anon_term_images_access on storage.objects
  for all to anon
  using (bucket_id = 'term-library-images') with check (bucket_id = 'term-library-images');
