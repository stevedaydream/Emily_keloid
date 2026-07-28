-- 問卷填寫區塊原本只列「已送出的回覆」，診間人員無從得知這個個案還有哪幾份問卷沒填。
-- 改為由後台標記哪些問卷是「正式上線需填寫」的，個案頁面就照這份清單列出待填/已完成。
--
-- active 與 required_for_intake 是兩件事：
--   active            = 這份問卷還能不能被使用（停用後連選單都不出現）
--   required_for_intake = 正式收案流程中每位個案都必須填的問卷（打勾清單的來源）
alter table public.questionnaire_templates
  add column if not exists required_for_intake boolean not null default false;

comment on column public.questionnaire_templates.required_for_intake is
  'Whether this questionnaire is part of the live intake checklist every case must complete (maintained in /admin/questionnaires). Distinct from active, which only controls availability.';

-- 目前實際要收的正式量表：VSS、SF-36、PSQI、JSS 疤痕診斷分類表。
-- 飲食運動習慣問卷仍是示範題目（pending.md A4），題目定稿前先不列入必填。
update public.questionnaire_templates
set required_for_intake = true
where active
  and name in (
    'Vancouver Scar Scale (VSS)',
    'SF-36 健康調查簡表',
    '匹茲堡睡眠品質量表（PSQI）',
    'JSS 疤痕診斷分類表'
  );
