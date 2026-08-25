-- 示範時程範本「標準術後追蹤（示範）」對齊 2026-08-24 的追蹤規則。
--
-- 落差：這份範本是 Phase 0 建 demo 時塞的，還停在舊規則——
--   · 第 1、6 個月掛著單一份問卷（原本是 VSS，20260824010000 把它改指到 JSS），
--     但 08-24 定案的是「術後滿 1／6／12 個月各測 JSS ＋ SF-36 ＋ PSQI」三份。
--     `questionnaire_id` 是單一欄位，掛一份會讓另外兩份看起來不用測。
--   · 第 3、12 個月掛的是「飲食運動習慣問卷（示範，待補齊正式題目）」——
--     飲食運動衛教已於 2026-07-27 決議不列入研究要收的結構化資料，那份是佔位問卷。
--   · 第 12 個月是追蹤時間點卻沒有任何量表提示。
--
-- 改法比照 lib/biobank.ts 的 followupSchedule()：把「要測哪三份」寫進 label，
-- 不掛 actions.questionnaire。實際判定由 lib/visitFlow.ts 依窗期（±10 天）算。

update public.schedule_template_items i
   set label = case i.offset_days
                 when 30  then '第1個月（含 JSS／SF-36／PSQI）'
                 when 180 then '第6個月（含 JSS／SF-36／PSQI）'
                 when 365 then '第12個月（含 JSS／SF-36／PSQI）'
                 else i.label
               end,
       questionnaire_id = null,
       actions = (select coalesce(jsonb_agg(a), '[]'::jsonb)
                    from jsonb_array_elements(i.actions) a
                   where a <> '"questionnaire"'::jsonb)
  from public.schedule_templates t
 where t.id = i.template_id
   and t.name = '標準術後追蹤（示範）';
