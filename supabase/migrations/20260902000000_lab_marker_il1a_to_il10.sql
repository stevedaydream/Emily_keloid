-- 2026-09-02：Lab 生物標記清單改版——移除 IL-1α，改收 IL-10。
-- lab_results 有外鍵指向 lab_marker_definitions，要先清掉引用該標記的檢驗值
-- （Phase 0 demo 階段，這些是預塞的模擬資料）才刪得掉定義本身。
delete from public.lab_results
where marker_id in (select id from public.lab_marker_definitions where marker_key = 'il1a');

delete from public.lab_marker_definitions where marker_key = 'il1a';

-- 排序放在 IL-6（50）與 TNF-α（60）之間，讓清單維持 IgE→Exosome→IL-1β→IL-6→IL-10→TNF-α→MMP2→MMP9
insert into public.lab_marker_definitions (marker_key, display_name, unit, sort_order)
values ('il10', 'IL-10', 'pg/mL', 55)
on conflict (marker_key) do update
  set display_name = excluded.display_name,
      unit = excluded.unit,
      sort_order = excluded.sort_order,
      active = true;
