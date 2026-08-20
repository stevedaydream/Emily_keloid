-- PSQI 補齊第5題（10）「其他睡眠困擾」的 0-3 頻率評分，原本只收文字說明（order_no 14）。
-- 來源：docs/Keloid 收案資料平台建置_20260727_1.docx 的「匹茲堡睡眠品質量表」正式版本，
-- 該題除了「請說明：____」還有一組 0/1/2/3 頻率選項，先前建置時漏掉了。
--
-- 官方計分的「睡眠困擾」面向（C5）是 5b-5j 共9小題加總，本平台先前只加總 5b-5i 共8小題
-- （見 20260727030000 與 src/lib/scoring.ts 的已知限制註記）。補上這題後 C5 才是完整的。
--
-- 為了讓頻率題緊接在 5j 文字說明之後（而不是掉到問卷最後面），這裡把 order_no 15 以後
-- 整批往後推一格，新題插在 15。作答資料是以 question_id 綁定的（questionnaire_answers.question_id），
-- 讀取時才 join 出 order_no，所以搬 order_no 不會讓舊答案錯位——題目搬到哪，它的答案就跟到哪。
--
-- 搬完後的編號：
--   14 = 5j 文字說明（不動）        15 = 5j 頻率（本次新增）
--   16 = Q6   17 = Q7   18 = Q8   19 = Q9
--   20 = Q10  21-24 = Q11a-11d     25 = 11e 文字說明
-- src/lib/scoring.ts 的 C1/C5/C6/C7 取值與 PatientIntakeFlow.tsx 的常數已同步更新。

do $$
declare
  tpl_id uuid;
begin
  select id into tpl_id from questionnaire_templates where name = '匹茲堡睡眠品質量表（PSQI）';
  if tpl_id is null then
    raise notice 'PSQI template not found, skipping';
    return;
  end if;

  -- 已經補過就不再動（下面的 shift 不是冪等的，重跑會推兩格）。
  -- 判斷依據必須是「5j 頻率題本身存在」——不能只看 order_no 15 有沒有東西，
  -- 補題前那個位置本來就是 Q6。
  if exists (
    select 1 from questionnaire_questions
    where questionnaire_id = tpl_id
      and question_type = 'single'
      and question_text like '5j.%'
  ) then
    raise notice 'PSQI 5j frequency item already present, skipping';
    return;
  end if;

  -- 15 以後整批 +1（沒有 (questionnaire_id, order_no) 唯一約束，不必先騰空）
  update questionnaire_questions
  set order_no = order_no + 1
  where questionnaire_id = tpl_id and order_no >= 15;

  insert into questionnaire_questions (questionnaire_id, order_no, question_text, question_type, options, required)
  values (
    tpl_id, 15,
    '5j. 過去一個月，出現前述以外的其他睡眠困擾的頻率',
    'single',
    '[{"value":"0","label":"0分・從未發生"},{"value":"1","label":"1分・不到一次"},{"value":"2","label":"2分・約一兩次"},{"value":"3","label":"3分・三次或以上"}]'::jsonb,
    true
  );

  -- 描述放在區塊內，跟實際題數一起變動；跳過補題時描述也不會被改掉
  update questionnaire_templates
  set description = '中文版睡眠品質量表，病人自填，共25道子題（第1-9題為計分題，第10-11題為睡伴／室友觀察的篩檢題不計分）。正式計分為7大面向組合計算（0-21分，>5分視為睡眠品質不佳），非單題加總。'
  where id = tpl_id;
end $$;
