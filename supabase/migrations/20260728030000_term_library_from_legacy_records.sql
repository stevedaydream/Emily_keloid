-- 醫學術語庫擴充（2026-07-28）：來源是主任舊表 `20230912_keloid病人治療table(1)-2.xlsm`
-- 實際紀錄文字的詞彙整理（words.md），依術前／術中／術後三階段收錄常用術語。
--
-- 設計說明：
--  * term_library 沒有子分類欄位，改用 term 文字前綴【症狀】【病史】… 標子類，並用 sort_order 分段讓同類相鄰，
--    這樣後台與個案頁的勾選清單都不用改程式。
--  * 沿用主任的原始寫法（含縮寫 CD / ROS / s/p），後面接中文說明，方便打字的人對照。
--  * 既有 12 筆中文示範術語（紅／腫／突起…）保留不動，如要淘汰請在後台停用。
--  * 「病灶尺寸標示」（15*8 cm 這類）沒有收進來，那是格式範例不是術語，尺寸有專門的病灶測量欄位。
--  * 【部位描述】組與人形圖／病灶清單的部位有重疊，收錄是為了保留主任原本的文字描述習慣，不需要可停用。

with new_terms(stage, term, sort_order) as (
  values
    -- 一、術前：主訴症狀
    ('pre', '【症狀】pain / painful 疼痛', 110),
    ('pre', '【症狀】itching / itchy 搔癢', 111),
    ('pre', '【症狀】tenderness 壓痛', 112),
    ('pre', '【症狀】warmness 局部發熱', 113),
    -- 一、術前：過往病史與誘發原因
    ('pre', '【病史】keloid formation 蟹足腫形成', 120),
    ('pre', '【病史】hypertrophic scar 肥厚性疤痕', 121),
    ('pre', '【病史】s/p (status post) 曾接受過某項處置/手術', 122),
    ('pre', '【病史】steroid injection 過往類固醇注射史', 123),
    ('pre', '【病史】shicort injection 過往 Shicort 注射史', 124),
    ('pre', '【病史】IVG 病灶內注射史', 125),
    ('pre', '【病史】laser treatment 過往雷射治療史', 126),
    ('pre', '【病史】C/S wound (cesarean section) 剖腹產傷口', 127),
    ('pre', '【病史】piercing 穿耳洞創傷史', 128),
    -- 一、術前：處置目的與計畫
    ('pre', '【計畫】for excision and local RT 擬行切除併局部放療', 140),
    ('pre', '【計畫】for re-excision 擬行二次切除', 141),
    -- 一、術前：解剖部位（文字描述用；部位分類仍以人形圖/病灶清單為準）
    ('pre', '【部位描述】anterior chest wall 前胸壁', 160),
    ('pre', '【部位描述】presternal region 胸骨前區', 161),
    ('pre', '【部位描述】bilateral shoulders 雙肩', 162),
    ('pre', '【部位描述】deltoid 三角肌區', 163),
    ('pre', '【部位描述】ear helix 耳輪', 164),
    ('pre', '【部位描述】ear lobe 耳垂', 165),
    ('pre', '【部位描述】umbilicus 肚臍', 166),
    ('pre', '【部位描述】low abdominal C/S wound 下腹剖腹產傷口', 167),
    ('pre', '【部位描述】scapular 肩胛區', 168),
    ('pre', '【部位描述】back 背部', 169),
    ('pre', '【部位描述】chin 下巴', 170),
    ('pre', '【部位描述】mandibular 下顎區', 171),

    -- 二、術中：主要切除手術
    ('intra', '【切除】Excision 蟹足腫切除術', 110),
    ('intra', '【切除】Core excision 核心切除術（留皮切芯）', 111),
    ('intra', '【切除】Re-excision 再切除術', 112),
    ('intra', '【切除】Debulking 減積切除', 113),
    ('intra', '【切除】Resection 病灶切除', 114),
    -- 二、術中：傷口修復與重建
    ('intra', '【重建】Z-plasty Z 字成形術', 120),
    ('intra', '【重建】multiple Z-plasty 多重 Z 字成形術', 121),
    ('intra', '【重建】scar revision 疤痕修整術', 122),
    ('intra', '【重建】local flap 局部皮瓣轉位', 123),
    ('intra', '【重建】neo-umbilicoplasty 新肚臍成形術', 124),
    ('intra', '【重建】STSG (split-thickness skin graft) 分層植皮', 125),
    ('intra', '【重建】skin graft 植皮', 126),
    ('intra', '【重建】primary closure 直接對合縫合', 127),
    -- 二、術中：聯合輔助治療
    ('intra', '【術中注射】intralesional injection 病灶內注射', 140),
    ('intra', '【術中注射】shicort 40mg injection Shicort 40mg 病灶內注射', 141),

    -- 三、術後：傷口復原與照顧
    ('post', '【傷口照護】CD (clean and dry) 傷口清潔乾燥', 110),
    ('post', '【傷口照護】ROS / suture removal / stitch off 拆線', 111),
    ('post', '【傷口照護】good healing 癒合良好', 112),
    ('post', '【傷口照護】good scar 疤痕狀況良好', 113),
    ('post', '【傷口照護】spersin Spersin 藥膏', 114),
    ('post', '【傷口照護】foamlite Foamlite 泡綿敷料', 115),
    ('post', '【傷口照護】sifutapping 矽膠貼片壓貼', 116),
    ('post', '【傷口照護】silicone tape 矽膠貼布', 117),
    ('post', '【傷口照護】silicone gel 矽膠凝膠', 118),
    -- 三、術後：急性反應
    ('post', '【急性反應】no infection sign 無感染徵兆', 130),
    ('post', '【急性反應】ecchymosis 瘀斑/皮下出血', 131),
    ('post', '【急性反應】scaly 皮膚脫屑', 132),
    ('post', '【急性反應】reddish at wound 傷口發紅', 133),
    ('post', '【急性反應】erythematous change 紅斑變化', 134),
    ('post', '【急性反應】no reddish 已退紅', 135),
    ('post', '【急性反應】mild itching 輕微搔癢', 136),
    ('post', '【急性反應】itching better 搔癢改善', 137),
    ('post', '【急性反應】no itching 無搔癢', 138),
    ('post', '【急性反應】pain after injection 注射後疼痛', 139),
    ('post', '【急性反應】hyperpigmentation 色素沉澱', 140),
    -- 三、術後：追蹤結果與復發評估
    ('post', '【追蹤結果】flat scar 疤痕平整', 160),
    ('post', '【追蹤結果】good result 效果良好', 161),
    ('post', '【追蹤結果】stationary 病情穩定、無明顯變化', 162),
    ('post', '【追蹤結果】no recurrence / no relapse 無復發', 163),
    ('post', '【追蹤結果】hypertrophy 局部肥厚增生', 164),
    ('post', '【追蹤結果】recurrence 復發', 165),
    ('post', '【追蹤結果】OPD follow up (F/U) 門診定期追蹤', 166),
    ('post', '【追蹤結果】shicort injection with xylocaine 類固醇併 Xylocaine 補強注射', 167)
)
insert into term_library (stage, term, sort_order)
select n.stage, n.term, n.sort_order
from new_terms n
where not exists (
  select 1 from term_library t where t.stage = n.stage and t.term = n.term
);
