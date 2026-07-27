-- 縮圖：拍照上傳時額外產生一張小尺寸縮圖（前端 canvas 縮放後上傳），
-- 個案頁面的照片 grid 用縮圖顯示、點擊看大圖才載入原始解析度，降低瀏覽流量（egress）。
alter table photos add column if not exists thumbnail_path text;

comment on column photos.thumbnail_path is '縮圖在 wound-photos bucket 的路徑（thumbs/ 前綴），舊資料沒有縮圖時前端 fallback 用原圖。';
