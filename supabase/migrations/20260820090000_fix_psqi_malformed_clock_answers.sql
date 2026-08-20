-- 修正 PSQI 上床／起床時間題（order_no 1、3）被手打成 `23::40` 這類重複冒號的答案。
--
-- 影響：src/lib/scoring.ts 的 parseClockMinutes 用 /(\d{1,2}):(\d{2})/ 比對，`23::40` 比不到，
-- 於是 C4 睡眠效率為 null；只要任一面向是 null 就不給總分，整筆 PSQI 分數變成「資料不足」。
-- 2026-08-20 盤點時遠端有 2 筆這種資料（同一個案 PU-2026-001，皆為診間人員代填）。
--
-- 只處理「數字＋連續冒號＋數字」這種明確是多打冒號的情形，而且正規化後必須是合法的 HH:MM
-- （00-23:00-59）才寫回；其餘認不出來的髒格式一律不動——寧可留著讓它顯示「資料不足」，
-- 也不要硬猜病人的就寢時間。修好之後條件就不再成立，重跑安全。
--
-- 判斷條件刻意全部用字串比對，不做 ::int 轉型：Postgres 不保證 WHERE 各條件的求值順序，
-- 一旦未來有非數字的髒資料混進來，轉型會讓整個 migration 直接報錯。
--
-- 來源端已同時修掉（同一批 commit）：
--   - 診間問卷表單這兩題改用 input type=time，瀏覽器保證送出 HH:MM
--   - submitQuestionnaireAction 再加一層 normalizeClockInput 正規化

update questionnaire_answers a
set answer_value = to_jsonb(
      lpad(split_part(regexp_replace(a.answer_value #>> '{}', ':+', ':', 'g'), ':', 1), 2, '0')
      || ':' ||
      lpad(split_part(regexp_replace(a.answer_value #>> '{}', ':+', ':', 'g'), ':', 2), 2, '0')
    )
from questionnaire_questions q
join questionnaire_templates t on t.id = q.questionnaire_id
where q.id = a.question_id
  and t.name = '匹茲堡睡眠品質量表（PSQI）'
  and q.order_no in (1, 3)
  and a.answer_value #>> '{}' ~ '^[0-9]{1,2}:{2,}[0-9]{1,2}$'
  and (
        lpad(split_part(regexp_replace(a.answer_value #>> '{}', ':+', ':', 'g'), ':', 1), 2, '0')
        || ':' ||
        lpad(split_part(regexp_replace(a.answer_value #>> '{}', ':+', ':', 'g'), ':', 2), 2, '0')
      ) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
