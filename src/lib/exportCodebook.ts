// 部長 2026-08 版 Excel 編碼簿（docs/Keloid Operation treat.xlsx）的欄位說明與共用編碼。
//
// 那份檔案是一份「編碼簿」：4 張工作表，每張只有第 1 列編碼說明＋第 2 列欄名，沒有資料列。
// 匯出的 4 張主表必須跟它「欄名與順序一模一樣、儲存格只放數字碼」，他才能直接貼進統計軟體。
//
// 這裡只放「不在資料庫裡的」常數（性別、劑量方案、缺值哨兵、以及第 1 列的說明文字）。
// 選項類的碼一律存在資料庫的 export_code 欄位（決策 2026-08-12），後台改選項不需動這支檔案。

/** 性別：男=1、女=0（部長碼表）。與資料庫的 cases.sex（'M'/'F'）對應。 */
export const SEX_CODE: Record<string, number> = { M: 1, F: 0 };

/**
 * 放射治療總劑量的編碼。部長碼表寫的是「1800x3d = 1, 1500x2d = 2, 800x1d = 3」，
 * 剛好與我們既有的三個 radiotherapy_dose_protocols 一對一，不需要任何換算。
 */
export const DOSE_CODE: Record<string, number> = {
  chest_scapular: 1, // 1800cGy × 3 次（胸/肩胛）
  other: 2, // 1500cGy × 2 次（其他部位）
  ear: 3, // 800cGy × 1 次（耳）
};

/**
 * 「無紀錄／不清楚」哨兵值。**只用在部長碼表明確定義過 9999 的欄位**
 * （height / weight / BMI / Keloid_family_history / F/W_photo），其餘缺值一律留空白。
 * 濫用會污染數值欄位——統計軟體讀進 9999 當成真實身高，平均值就毀了。
 */
export const NO_RECORD = 9999;

/**
 * 部長格式的硬上限。超出的資料不丟棄，改列進 long-format 附表（決策 2026-08-12）。
 *
 * 2026-08-14 依助理／部長確認擴充（原示範 Excel 是 5/4/3/24，文字回覆才是這組，已確認以文字為準）：
 *   · 病灶 5 → 20（Basic Info. 因此從 61 欄變 206 欄，使用者已知情並確認）
 *   · 手術部位 4（維持）
 *   · 放療部位 3 → 4（與手術部位一樣多）
 *   · 追蹤 24 → 27 次（Year 1 表 FW1–FW12 不動，加開的 3 格接在 Year 2 表尾＝FW13–FW27）
 */
export const MAX_LESIONS = 20;
export const MAX_OP_SITES = 4;
export const MAX_RT_SITES = 4;
/** Year 1 工作表的月份格子數（FW1–FW12）。 */
export const MAX_FW_YEAR1 = 12;
/** Year 2 工作表的月份格子數（FW13–FW27）。 */
export const MAX_FW_YEAR2 = 15;
/** 兩張追蹤表合計的月份格子數（＝最後一格是 FW27）。 */
export const MAX_FW_TOTAL = MAX_FW_YEAR1 + MAX_FW_YEAR2;

/**
 * 追蹤分年的界線：距手術日 ≤365 天算第一年，366–730 天算第二年。
 * （目前程式一律用「距手術第幾個月」對格子，這兩個常數只作為文件性質的參考值。）
 */
export const YEAR1_DAYS = 365;
export const YEAR2_DAYS = 730;

/**
 * 各主表第 1 列的編碼說明，逐字沿用部長原檔（key = 欄名）。
 * 病灶區塊 2–5 的說明與區塊 1 相同，原檔只在第 1 個區塊寫，這裡也照辦。
 */
export const LEGEND: Record<string, string> = {
  gender: "男性= 1,    女性= 0",
  birthday: "格式範例：1999/9/9",
  height: "無紀錄= 9999",
  weight: "無紀錄= 9999",
  BMI: "無紀錄= 9999",
  Doctor_ID: "顏v = 01,  蒲v = 02",
  Diagnosis: "1. L730 ,  2. L910 ,  3. L905",
  // 「無= 0」是 2026-08-26 加的，部長原檔沒有這一格。加的理由：原本「問過了、一項也沒有」
  // 只能留空白，跟「還沒問」在匯出檔裡完全一樣。空白仍然保留原意（沒問／沒填）。
  Medical_history_self:
    "無= 0, 1. 高血壓 , 2. 糖尿病 , 3. 心臟病 , 4. 腦中風 , 5. 癌症 , 6. 氣喘/過敏性疾病 , 7. 蟹足腫或肥厚性疤痕 , 8. 其他",
  Fmaily_history:
    "無= 0, 1. 高血壓 , 2. 糖尿病 , 3. 心臟病 , 4. 腦中風 , 5. 癌症 , 6. 氣喘/過敏性疾病 , 7. 肥厚性疤痕 , 8. 其他",
  Keloid_family_history: "無=0, 有=1, 不清楚= 9999",
  "time of occurrence": "發生時間以 month 計算　ex： 1年填「12」",
  KeloidLo:
    "1. L't helix , 2. R't helix , 3. L't earlobe , 4. R't earlobe , 5. lower jaw/ neck region , 6. anteriror chest/ chest wall , 7. L't chest , 8. R't chest , 9. L't upper arm , 10. R't upper arm , 11. upper back/ back , 12. L't back , 13. R't back , 14. L't scapular , 15. R't scapular , 16. Abdomen , 17. suprapubic , 18. L't lateral thigh , 19. R't lateral thigh , 20. L't anterior lower leg , 21. R't anterior lower leg , 22. other",
  KC: "1. 外傷 , 2. 燒傷 , 3. 手術切口 , 4. 疫苗接種 , 5. 耳洞穿刺 , 6. 痤瘡 , 7. 自發 , 8. 其他",
  KOR: "手術+放射線治療　有= 1, 無=0",
  KSI: "類固醇注射　無=0, 40mg = 1 , 10mg = 2",
  // 「同次多項以逗號併排」是 2026-08-28 加的說明。助理明講這欄的目的是觀察術後有沒有在用
  // 藥膏或矽膠貼布，而同一次回診常常是藥膏＋矽膠片一起用，只留一個碼就答不出這件事。
  KOST:
    "藥膏及貼片（同次多項以逗號併排，例 6, 8）　1. 類固醇藥膏_可立舒 , 2. 類固醇藥膏_妥膚淨 , 3. 礙沙凝膠Esarin Gel , 4. 類固醇藥膏_可立舒+矽膚貼 , 5. 類固醇藥膏_妥膚淨+矽膚貼 , 6. 新醫疤痕貼（矽膠片） , 7. 美皮豐疤痕貼（矽膠片） , 8. 小川令疤痕貼 , 9. 矽膚貼 , 10. 倍舒痕凝膠Dermatix , 11. 優潔Eurogel , 12. 其他",
  "F/W_photo": "無=0, 有=1, 不清楚= 9999",
  Keloid_symptom:
    "1. 無明顯不適 , 2. 搔癢 , 3. 疼痛 , 4. 灼熱感 , 5. 緊繃或拉扯感 , 6. 影響活動 , 7. 影響睡眠或日常生活 , 8. 因外觀造成困擾 , 9. 其他",
  BioBank: "組織庫　無=0, 有= 1",
  "paraffin blocks No.": "臘塊編號",
  "Cryotube      Location": "冷凍小管組織保存位置",
  surgical_procedure: "1. Excision , 2. Z-plasty , 3. Scar revision , 4. Wedge excision",
  RT_Doctor: "吳錦榕=1, 粘心華=2, 蕭世禎=3, 雷德=4, 蔡有倫=5, 王南宗=6, 張瑞珊=7",
  TotalDose: "1800x3d = 1, 1500x2d = 2, 800x1d = 3",
  FW_k_symptom:
    "1. 明顯改善 , 2. 稍微改善 , 3. 沒有明顯變化 , 4. 稍微加重 , 5. 明顯加重 , 6. 不清楚",
  Recurrence: "無=0, 有=1",
  visit_reason:
    // 2026-08-14 改採新版碼表：整份只剩 6 項，拿掉「希望取得第二醫療意見或了解其他治療選擇」，
    // 「其他」從 7 遞補為 6（見 migration 20260814010000）
    "1. 初次發生蟹足腫，尋求治療 , 2. 已接受治療，但效果不理想，尋求其他治療方式 , 3. 治療後復發，尋求再次治療 , 4. 曾多次治療及復發，尋求進一步治療 , 5. 原有治療效果良好，希望持續接受治療或追蹤 , 6. 其他",
};

/** 距離兩個日期的天數（b - a）。任一為空回 null。 */
export function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** 相差幾個「月」（部長的 time of occurrence 以 month 計）。 */
export function monthsBetween(a?: string | null, b?: string | null): number | null {
  const d = daysBetween(a, b);
  return d === null ? null : Math.round(d / 30.44);
}

/**
 * 病灶尺寸的顯示字串。主表的 KL size_N 是單一儲存格（部長格式），
 * 統一成 `長*寬*高`；數字化的長/寬/高/最大徑/面積/體積在「病灶測量」附表。
 */
export function sizeText(l: { length_cm?: number | null; width_cm?: number | null; height_cm?: number | null }): string {
  const dims = [l.length_cm, l.width_cm, l.height_cm].filter((d) => d !== null && d !== undefined);
  return dims.length ? dims.join("*") : "";
}

/** cases.jsw_score 存的是「15分（肥厚性疤痕）」這種文字，匯出要的是數字。 */
export function jswNumber(raw?: string | null): number | "" {
  if (!raw) return "";
  const m = String(raw).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : "";
}

// ===== 4 張主表的欄名與第 1 列說明 =====
// 匯出（產生資料）與匯入範本（產生空白表）必須用同一份定義，
// 否則助理填好的範本會對不上匯入解析——這正是最容易在改了一邊、忘了另一邊時炸掉的地方。
//
// Name／Chart No. 兩欄的說明對兩邊的意思不同（2026-08-25 改）：
//   · 匯出：預設留空，勾「含病歷號與姓名」並輸入匯出金鑰才會有值（見 lib/exportKey.ts）
//   · 匯入範本：一律留空——雲端匯入只收去識別化的檔案（決策 #13），有值會整份擋掉

// 2026-08-13 依助理回覆改版（Keloid Operation treat＿1150813.xlsx）：
//   · 病灶區塊從 6 欄變 9 欄：KC 移到尺寸前面，尺寸拆成 長/寬/高/總面積 四格
//   · 總面積＝長×寬（示範資料 1.3×1.6=2.08 驗證過），不是體積
//   · 新增 Primary_Visit_Reason 欄（此次就診主要原因）
//   · **移除 Keloid_family_history 欄**：家族史第 7 項已含「蟹足腫或肥厚性疤痕」，不需獨立一欄
//   · Primary culture 從自由文字改為 0/1 編碼
const lesionBlockHeaders = (n: number) => [
  `Keloid Lo_${n}`,
  `KC_${n}`,
  `KL size_${n}L`,
  `KL size_${n}W`,
  `KL size_${n}H`,
  `KL size_${n}T`,
  `KOR_${n}`,
  `KSI_${n}`,
  `KOST_${n}`,
];
const lesionBlockLegends = (n: number): (string | null)[] =>
  n === 1
    ? [LEGEND.KeloidLo, LEGEND.KC, "未測量可留空", "未測量可留空", "未測量可留空", "長×寬，自動計算", LEGEND.KOR, LEGEND.KSI, LEGEND.KOST]
    : [null, null, "未測量可留空", "未測量可留空", "未測量可留空", "長×寬，自動計算", null, null, null];

/**
 * 追蹤區塊。每一次追蹤都有「當次治療」的三個欄位（KOR／KSI／KOST）。
 *
 * 2026-08-26：原本只有第 1、2 次有這三欄，那是照著部長原檔抄的。他在 08-26 的討論裡說明
 * 那是**他來不及放**，不是不需要——FW3 之後同樣會有治療。平台本來就每一筆回診都算得出這三個碼
 * （見 route.ts 的 Visit），先前等於把 FW3 以後的治療資料丟掉，只剩「追蹤逐筆」附表查得到。
 */
const fwBlock = (n: number) => [
  `FW${n}_time`,
  `FW${n}_days`,
  `KOR_FW${n}`,
  `KSI_FW${n}`,
  `KOST_FW${n}`,
  `Recurrence_${n}`,
];
/** 說明只寫在第 1 組（部長原檔的慣例：同型區塊只在第一個寫說明）。 */
const fwLegends = (n: number): (string | null)[] =>
  n === 1
    ? [`${n}　未回診請直接填 0`, "距手術日天數", LEGEND.KOR, LEGEND.KSI, LEGEND.KOST, LEGEND.Recurrence]
    : [`${n}　未回診請直接填 0`, null, null, null, null, null];

export type SheetDef = { name: string; headers: string[]; legends: (string | null)[] };

export const BASIC_INFO_SHEET: SheetDef = {
  name: "Basic Info.",
  headers: [
    "Subject_ID", "Name", "Chart No.", "gender", "mobile", "birthday", "Age", "height", "weight", "BMI",
    "Doctor_ID", "Diagnosis", "Medical_history_self", "Fmaily_history", "time of occurrence", "Primary_Visit_Reason",
    ...Array.from({ length: MAX_LESIONS }, (_, i) => lesionBlockHeaders(i + 1)).flat(),
    "VSS score", "JSW score", "SF-36", "PSQI", "F/W_photo", "Keloid_symptom", "BioBank", "Primary culture",
    "paraffin blocks No.", "Cryotube      Location",
  ],
  legends: [
    null, "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", LEGEND.gender, null,
    LEGEND.birthday, null, LEGEND.height, LEGEND.weight, LEGEND.BMI,
    LEGEND.Doctor_ID, LEGEND.Diagnosis, LEGEND.Medical_history_self, LEGEND.Fmaily_history,
    LEGEND["time of occurrence"], LEGEND.visit_reason,
    ...Array.from({ length: MAX_LESIONS }, (_, i) => lesionBlockLegends(i + 1)).flat(),
    // VSS score：2026-08-24 起停收（助理裁決疤痕評分只留 JSS）。欄位保留、永遠留空，
    // 是為了維持與部長 Excel 的欄位順序一致——抽掉一欄會讓他既有的分析公式整排位移。
    "已停收（2026-08-24 起不再收 VSS）", null, "8 分量表分數（順序見「編碼對照表」）・主表放 Baseline 那一份",
    "PSQI 總分 0-21・主表放 Baseline 那一份", LEGEND["F/W_photo"],
    LEGEND.Keloid_symptom, LEGEND.BioBank, "無=0, 有=1", LEGEND["paraffin blocks No."], LEGEND["Cryotube      Location"],
  ],
};

export const OPERATION_SHEET: SheetDef = {
  name: "Operation",
  headers: [
    "Subject_ID", "Name", "Chart No.", "gender", "Operation date",
    ...Array.from({ length: MAX_OP_SITES }, (_, i) => [`Keloid Lo_O${i + 1}`, `surgical procedure_${i + 1}`]).flat(),
    "Radiation date", "RT_Doctor", "Fractions", "bolus", "electron beam",
    ...Array.from({ length: MAX_RT_SITES }, (_, i) => [`Keloid Lo_R${i + 1}`, `Total Dose_${i + 1} (cGy)`]).flat(),
    "Treatment Response", "Acute Reactions",
  ],
  legends: [
    null, "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", LEGEND.gender, null,
    ...Array.from({ length: MAX_OP_SITES }, (_, i) => [i === 0 ? LEGEND.KeloidLo : null, i === 0 ? LEGEND.surgical_procedure : null]).flat(),
    null, LEGEND.RT_Doctor, null, null, null,
    ...Array.from({ length: MAX_RT_SITES }, (_, i) => [i === 0 ? LEGEND.KeloidLo : null, i === 0 ? LEGEND.TotalDose : null]).flat(),
    null, null,
  ],
};

export const YEAR1_SHEET: SheetDef = {
  name: "Year 1 follow-up",
  headers: [
    "Subject_ID", "Name", "Chart No.", "gender", "Operation date", "FW_k_symptom",
    ...Array.from({ length: MAX_FW_YEAR1 }, (_, i) => fwBlock(i + 1)).flat(),
  ],
  legends: [
    null, "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", LEGEND.gender, null, LEGEND.FW_k_symptom,
    ...Array.from({ length: MAX_FW_YEAR1 }, (_, i) => fwLegends(i + 1)).flat(),
  ],
};

export const YEAR2_SHEET: SheetDef = {
  name: "Year 2 follow-up",
  headers: [
    "Subject_ID", "Name", "Chart No.", "gender", "Operation date",
    // 2026-08-26：第二年也補上 KOR/KSI/KOST，跟 Year 1 一樣六欄一組（見 fwBlock 的說明）
    ...Array.from({ length: MAX_FW_YEAR2 }, (_, i) => fwBlock(MAX_FW_YEAR1 + 1 + i)).flat(),
  ],
  legends: [
    null, "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", "（匯出：勾選並輸入匯出金鑰才會有值／匯入範本：請留空）", LEGEND.gender, null,
    ...Array.from({ length: MAX_FW_YEAR2 }, (_, i) => {
      const n = MAX_FW_YEAR1 + 1 + i;
      // 這張表的第一組（FW13）要寫說明——Year 2 是獨立工作表，讀的人看不到 Year 1 的說明列
      return i === 0
        ? [`${n}　未回診請直接填 0`, "距手術日天數", LEGEND.KOR, LEGEND.KSI, LEGEND.KOST, LEGEND.Recurrence]
        : [`${n}　未回診請直接填 0`, null, null, null, null, null];
    }).flat(),
  ],
};

/** 4 張主表，順序即活頁簿裡的工作表順序。 */
export const MAIN_SHEETS: SheetDef[] = [BASIC_INFO_SHEET, OPERATION_SHEET, YEAR1_SHEET, YEAR2_SHEET];

// ===== 編碼對照表（codebook）的資料列 =====
// 匯出檔與匯入範本都要附這張表：匯出時給部長查代碼意義，匯入範本則是助理填表時的對照。
// 內容完全由資料庫產生，後台新增/停用選項這裡就跟著變。

export type CodebookSource = {
  zones: { display_name: string; export_label: string | null; export_code: number | null; dose_category: string; active: boolean }[];
  options: { category: string; label: string; export_code: number | null; active: boolean }[];
  doctors: { code: string; name: string; export_code: number | null }[];
  icdCodes: { code: string; description_full: string; export_code: number | null }[];
  sf36Scales: readonly { readonly label: string }[];
};

const OPTION_CATEGORY_LABEL: Record<string, string> = {
  onset_cause: "發生原因 (KC)",
  keloid_symptom: "目前不適症狀 (Keloid_symptom)",
  symptom_change: "症狀變化 (FW_k_symptom)",
  // visit_reason 在 Basic Info. 有對應欄位（Primary_Visit_Reason），主表就填碼；
  // 這裡列出來是為了讓「收案選項紀錄」附表也看得到逐筆的選項文字與時間。
  visit_reason: "此次就診主要原因 (Primary_Visit_Reason)",
  // referral_source 部長的 4 張主表沒有欄位，只在「收案選項紀錄」附表
  referral_source: "如何得知看診資訊（見「收案選項紀錄」附表）",
};

export function buildCodebookRows(src: CodebookSource): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const z of src.zones.filter((z) => z.active).sort((a, b) => (a.export_code ?? 99) - (b.export_code ?? 99))) {
    rows.push(["部位 (Keloid Lo / Keloid Lo_O / Keloid Lo_R)", z.export_code ?? "", z.display_name, z.export_label ?? "", z.dose_category]);
  }
  for (const o of src.options.filter((o) => OPTION_CATEGORY_LABEL[o.category])) {
    rows.push([OPTION_CATEGORY_LABEL[o.category], o.export_code ?? "", o.label, "", o.active ? "" : "（已停用）"]);
  }
  for (const d of src.doctors) rows.push(["主治醫師 (Doctor_ID)", d.export_code ?? "", d.name, d.code, ""]);
  for (const i of src.icdCodes) rows.push(["診斷 (Diagnosis)", i.export_code ?? "", i.code, i.description_full, ""]);
  rows.push(["性別 (gender)", 1, "男性", "", ""], ["性別 (gender)", 0, "女性", "", ""]);
  rows.push(
    ["放療總劑量 (Total Dose)", 1, "1800cGy × 3 次", "胸/肩胛區", ""],
    ["放療總劑量 (Total Dose)", 2, "1500cGy × 2 次", "其他部位", ""],
    ["放療總劑量 (Total Dose)", 3, "800cGy × 1 次", "耳", ""]
  );
  rows.push(["類固醇劑量 (KSI)", 0, "無", "", ""], ["類固醇劑量 (KSI)", 1, "40mg", "", ""], ["類固醇劑量 (KSI)", 2, "10mg", "", ""]);
  rows.push(["手術+放療 (KOR)", 0, "無", "", ""], ["手術+放療 (KOR)", 1, "有", "", ""]);
  rows.push(["復發 (Recurrence)", 0, "無", "", ""], ["復發 (Recurrence)", 1, "有", "", ""]);
  rows.push(["缺值哨兵", NO_RECORD, "無紀錄／不清楚", "只用於 height / weight / BMI / Keloid_family_history / F/W_photo", ""]);
  src.sf36Scales.forEach((s, i) =>
    rows.push(["SF-36 欄位內的分數順序", i + 1, s.label, "主表以 / 分隔，明細見「問卷分數」附表", ""])
  );
  return rows;
}

export const CODEBOOK_HEADERS = ["類別", "代碼", "名稱", "說明 / 部長原文", "備註"];
