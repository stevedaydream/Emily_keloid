-- 2026-08-13：放射治療紀錄新增「放射科醫師」欄位。
--
-- 新格式 Operation 工作表的 RT_Doctor 碼表是 7 位放射腫瘤科醫師
-- （吳錦榕=1、粘心華=2、蕭世禎=3、雷德=4、蔡有倫=5、王南宗=6、張瑞珊=7），
-- 但系統原本沒有地方可以填，匯出時 101 筆全空。
--
-- 做法：沿用 2026-08-12 為「類固醇劑量」新增的 select 欄位型別，直接放進
-- 放射治療的 field_schema，選項各自帶 export_code。
-- 不併進 doctors 表：那張表的 code 會進研究編號（YEN-2026-001），
-- 且 export_code 1/2 已被主治醫師（顏v/蒲v）用掉，混在一起會撞碼，
-- 也會讓放射科醫師出現在收案頁的「主治醫師」下拉裡。
update public.treatment_types
set field_schema = '[
  {"key":"rt_doctor","type":"select","label":"放射科醫師","options":[
    {"value":"吳錦榕","export_code":1},
    {"value":"粘心華","export_code":2},
    {"value":"蕭世禎","export_code":3},
    {"value":"雷德","export_code":4},
    {"value":"蔡有倫","export_code":5},
    {"value":"王南宗","export_code":6},
    {"value":"張瑞珊","export_code":7}
  ]},
  {"key":"total_dose_cgy","type":"number","label":"Total Dose (cGy)"},
  {"key":"fractions","type":"number","label":"Fractions"},
  {"key":"bolus","type":"text","label":"Bolus"},
  {"key":"electron_beam","type":"text","label":"Electron Beam Energy"},
  {"key":"treatment_response","type":"text","label":"Treatment Response"},
  {"key":"acute_reactions","type":"text","label":"Acute Reactions"}
]'::jsonb
where name = '放射治療';
