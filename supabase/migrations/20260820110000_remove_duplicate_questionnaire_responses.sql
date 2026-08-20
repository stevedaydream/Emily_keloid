-- 刪除「連點兩下」造成的重複問卷回覆。
--
-- 2026-08-20 盤點時發現 PU-2026-001 有兩筆 PSQI 回覆，同一個案、同一份問卷、相隔 4 秒送出，
-- 18 題答案完全相同（md5 指紋一致）。匯出時會多出一列，計分則兩筆算出同樣的分數。
--
-- 判斷條件刻意收得很緊，只抓「連點」這個特徵，不做一般性的去重：
--   1. 同個案、同問卷、同 schedule_item
--   2. 逐題答案的指紋完全相同
--   3. 兩筆送出時間相差 5 分鐘以內
--   4. 保留最早那筆，刪掉後面的
--
-- 第 3 條是關鍵。少了它，同一位病人在不同追蹤時間點填出一模一樣的答案（例如 VSS 兩次都同分）
-- 會被誤判成重複而刪掉真實資料——那是回診資料，不是重複送出。
--
-- 整段包在 DO 區塊裡（單一 transaction），若有其他表參照到這些回覆會直接報錯中止，不會刪一半。

do $$
declare
  dupe_ids uuid[];
begin
  with fp as (
    select r.id,
           r.case_id,
           r.questionnaire_id,
           r.schedule_item_id,
           r.submitted_at,
           md5(coalesce(
             string_agg(q.order_no || '=' || coalesce(a.answer_value #>> '{}', '∅'), '|' order by q.order_no),
             ''
           )) as fingerprint
    from questionnaire_responses r
    left join questionnaire_answers a on a.response_id = r.id
    left join questionnaire_questions q on q.id = a.question_id
    group by r.id, r.case_id, r.questionnaire_id, r.schedule_item_id, r.submitted_at
  )
  select array_agg(distinct later.id)
  into dupe_ids
  from fp later
  join fp keep
    on keep.case_id = later.case_id
   and keep.questionnaire_id = later.questionnaire_id
   and keep.fingerprint = later.fingerprint
   and coalesce(keep.schedule_item_id::text, '') = coalesce(later.schedule_item_id::text, '')
   and keep.submitted_at < later.submitted_at
   and later.submitted_at - keep.submitted_at < interval '5 minutes';

  if dupe_ids is null or array_length(dupe_ids, 1) is null then
    raise notice 'no duplicate questionnaire responses found';
    return;
  end if;

  raise notice 'deleting % duplicate questionnaire response(s)', array_length(dupe_ids, 1);
  delete from questionnaire_answers where response_id = any(dupe_ids);
  delete from questionnaire_responses where id = any(dupe_ids);
end $$;
