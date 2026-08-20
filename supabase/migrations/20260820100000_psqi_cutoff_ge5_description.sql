-- PSQI 判定門檻依 docs/生活品質量表及睡眠量表計分.docx 改為「>= 5 分」。
--
-- docx 原文：「當 PSQI 分數為 5 分或 5 分以上時，即顯示有睡眠品質障礙，分數愈高顯示睡眠品質愈差。」
-- Buysse et al. 1989 原文用的是 > 5，兩者差在「剛好 5 分」這一格：原文算正常，本研究算有障礙。
-- 依 docx 為準，程式端 src/lib/scoring.ts 的 PSQI_POOR_SLEEP_CUTOFF 已同步改為 >= 5。
--
-- 這裡只更新問卷描述文字（先前寫成 >5），讓後台與問卷頁看到的說明跟實際判定一致。

update questionnaire_templates
set description = '中文版睡眠品質量表，病人自填，共25道子題（第1-9題為計分題，第10-11題為睡伴／室友觀察的篩檢題不計分）。正式計分為7大面向組合計算（0-21分，≥5分視為有睡眠品質障礙），非單題加總。'
where name = '匹茲堡睡眠品質量表（PSQI）';

update questionnaire_templates
set description = '台灣/IQOLA 標準中文版，共36道子題，病人自填。八大構面各自轉換為0-100分：（構面實際得分－可能最低得分）÷分數範圍×100，非簡單加總。'
where name = 'SF-36 健康調查簡表';
