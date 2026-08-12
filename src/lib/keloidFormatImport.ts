// 部長 2026-08 版 Excel 格式的匯入解析與解碼。
//
// 與匯出對稱：助理下載 /api/export/import-template 的空白範本（欄位與匯出完全相同），
// 填好後上傳，這支負責把 4 張工作表合併成「一個案一筆」並把數字碼翻回資料庫的 id。
//
// 設計原則同 sizeParser：**能確定的才寫，不確定的標成待人工確認，絕不猜**。
// errors 會擋住該列不寫入；warnings 只是提醒，仍可寫入。

import { parseSize, type ParsedSize } from "./sizeParser";
import { MAX_LESIONS, MAX_OP_SITES, MAX_RT_SITES, MAX_FW_PER_YEAR, SEX_CODE, NO_RECORD } from "./exportCodebook";

/** 一列原始資料：欄名 → 儲存格值 */
export type SheetRow = Record<string, unknown>;

export type ImportLookups = {
  /** 部位碼 → zone id。碼 22 對到「其他部位」那個 zone。 */
  zoneIdByCode: Map<number, { id: string; display_name: string }>;
  /** 醫師的數字碼（部長碼表的 Doctor_ID）→ doctors.id／code。只用來交叉檢查。 */
  doctorByCode: Map<number, { id: string; code: string }>;
  /** 醫師的字母代碼（研究編號裡那段，例 YEN）→ doctors.id。這才是決定個案掛在哪位醫師底下的依據。 */
  doctorIdByLetterCode: Map<string, string>;
  /** 診斷碼 → icd_codes.id */
  icdIdByCode: Map<number, string>;
  /** category → 碼 → case_intake_option_lists.id */
  optionIdByCategoryCode: Map<string, Map<number, string>>;
};

export type DecodedLesion = {
  site_no: number;
  body_site: string;
  body_part_zone_id: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  /** 原始尺寸文字，解析不確定時保留下來供人工比對 */
  raw_size: string;
  size_confidence: ParsedSize["confidence"];
  size_note: string;
};

export type DecodedVisit = {
  date: string;
  recurrence: boolean;
  /** 只有第一年那一格，掛在該年最後一次回診上 */
  symptom_change_option_id: string | null;
};

export type DecodedCase = {
  research_id: string;
  sequence_no: number;
  enrollment_year: number;
  doctor_id: string;
  fields: {
    sex: string | null;
    age_at_enrollment: number | null;
    phone_number: string | null;
    jsw_score: string | null;
  };
  icd_code_ids: string[];
  /** 個案層級的發生原因（範本是每個病灶各一欄，我們的資料模型是個案層級，取聯集） */
  onset_cause_option_ids: string[];
  keloid_symptom_option_ids: string[];
  lesions: DecodedLesion[];
  surgery: { date: string | null; zone_ids: (string | null)[] };
  radiotherapy: {
    date: string | null;
    /** Keloid Lo_R1..3：各療程的部位 zone id（對不到就是 null） */
    zone_ids: (string | null)[];
    fractions: number | null;
    bolus: string | null;
    electron_beam: string | null;
    treatment_response: string | null;
    acute_reactions: string | null;
  };
  visits: DecodedVisit[];
  biobank: { paraffin_block_no: string | null; primary_culture: string | null; cryotube_location: string | null };
  errors: string[];
  warnings: string[];
};

const RESEARCH_ID_RE = /^([A-Za-z]+)-(\d{4})-(\d+)$/;

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function num(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 讀成日期字串（YYYY-MM-DD）；Excel 日期儲存格會是 Date 物件。 */
function dateStr(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!iso) return null;
  const [, y, m, d] = iso;
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** 「2, 3」或「2、3」這種多選碼字串拆成數字陣列 */
function codeList(v: unknown): number[] {
  return str(v)
    .split(/[,，、;；\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * 把 4 張工作表依 Subject_ID 合併成「一個案一筆」。
 * 範本裡每張表一位病人各佔一列，Subject_ID 是唯一的關聯鍵。
 */
export function mergeSheetsBySubject(sheets: {
  basic: SheetRow[];
  operation: SheetRow[];
  year1: SheetRow[];
  year2: SheetRow[];
}): Map<string, { basic?: SheetRow; operation?: SheetRow; year1?: SheetRow; year2?: SheetRow }> {
  const merged = new Map<string, { basic?: SheetRow; operation?: SheetRow; year1?: SheetRow; year2?: SheetRow }>();
  const put = (rows: SheetRow[], key: "basic" | "operation" | "year1" | "year2") => {
    for (const r of rows) {
      const id = str(r["Subject_ID"]);
      if (!id) continue;
      const entry = merged.get(id) ?? {};
      entry[key] = r;
      merged.set(id, entry);
    }
  };
  put(sheets.basic, "basic");
  put(sheets.operation, "operation");
  put(sheets.year1, "year1");
  put(sheets.year2, "year2");
  return merged;
}

/** 解碼一位病人的四列資料。 */
export function decodeCase(
  researchId: string,
  rows: { basic?: SheetRow; operation?: SheetRow; year1?: SheetRow; year2?: SheetRow },
  lookups: ImportLookups
): DecodedCase {
  const errors: string[] = [];
  const warnings: string[] = [];
  const basic = rows.basic ?? {};
  const op = rows.operation ?? {};

  const parsedId = researchId.match(RESEARCH_ID_RE);
  if (!parsedId) {
    errors.push(`研究編號「${researchId}」格式不對，應為 醫師代碼-年份-流水號（例 YEN-2023-007）`);
  }
  if (!rows.basic) errors.push("「Basic Info.」工作表沒有這位病人的資料列");

  // ---- 醫師：以研究編號裡的代碼為準，Doctor_ID 欄只用來交叉檢查 ----
  const idDoctorCode = parsedId?.[1]?.toUpperCase() ?? "";
  const doctorCodeNum = num(basic["Doctor_ID"]);
  const byCode = doctorCodeNum !== null ? lookups.doctorByCode.get(doctorCodeNum) : undefined;
  if (doctorCodeNum !== null && !byCode) {
    warnings.push(`Doctor_ID 代碼 ${doctorCodeNum} 在系統的醫師清單裡找不到，已改用研究編號裡的「${idDoctorCode}」`);
  } else if (byCode && idDoctorCode && byCode.code.toUpperCase() !== idDoctorCode) {
    warnings.push(`Doctor_ID 代碼 ${doctorCodeNum}（${byCode.code}）與研究編號裡的「${idDoctorCode}」不一致，以研究編號為準`);
  }
  // 依研究編號的字母代碼找醫師 id（數字碼只用來交叉檢查，見上）
  const doctorId = lookups.doctorIdByLetterCode.get(idDoctorCode) ?? "";
  if (!doctorId) errors.push(`研究編號裡的醫師代碼「${idDoctorCode}」在系統的醫師清單裡找不到，請先到後台新增`);

  // ---- 基本欄位 ----
  const genderCode = num(basic["gender"]);
  const sex = genderCode === null ? null : Object.entries(SEX_CODE).find(([, v]) => v === genderCode)?.[0] ?? null;
  if (genderCode !== null && !sex) warnings.push(`gender 代碼 ${genderCode} 不是 1（男）或 0（女），已留空`);

  const ageRaw = num(basic["Age"]);
  const age = ageRaw === NO_RECORD ? null : ageRaw;
  const jsw = num(basic["JSW score"]);

  // ---- 診斷 ----
  const icdCodeIds: string[] = [];
  for (const code of codeList(basic["Diagnosis"])) {
    const id = lookups.icdIdByCode.get(code);
    if (id) icdCodeIds.push(id);
    else warnings.push(`Diagnosis 代碼 ${code} 找不到對應的 ICD 碼，已略過`);
  }

  // ---- 選項類（發生原因、目前不適症狀）----
  const optionIds = (category: string, codes: number[], label: string) => {
    const map = lookups.optionIdByCategoryCode.get(category);
    const out: string[] = [];
    for (const c of codes) {
      const id = map?.get(c);
      if (id) out.push(id);
      else warnings.push(`${label} 代碼 ${c} 找不到對應選項，已略過`);
    }
    return [...new Set(out)];
  };
  const symptomIds = optionIds("keloid_symptom", codeList(basic["Keloid_symptom"]), "Keloid_symptom");

  // ---- 病灶 ----
  const lesions: DecodedLesion[] = [];
  const onsetCodes: number[] = [];
  let unreadKsiKost = false;
  for (let i = 1; i <= MAX_LESIONS; i++) {
    const zoneCode = num(basic[`Keloid Lo_${i}`]);
    const rawSize = str(basic[`KL size_${i}`]);
    const kc = num(basic[`KC_${i}`]);
    if (kc !== null) onsetCodes.push(kc);
    if (str(basic[`KSI_${i}`]) || str(basic[`KOST_${i}`]) || str(basic[`KOR_${i}`])) unreadKsiKost = true;
    if (zoneCode === null && !rawSize) continue;

    const zone = zoneCode !== null ? lookups.zoneIdByCode.get(zoneCode) : undefined;
    if (zoneCode !== null && !zone) {
      warnings.push(`Keloid Lo_${i} 代碼 ${zoneCode} 不在 1-22 的部位碼表內，該病灶的部位留空`);
    }
    const size = parseSize(rawSize);
    if (rawSize && size.confidence !== "exact") {
      warnings.push(`KL size_${i}「${rawSize}」：${size.note || "無法解析"}`);
    }
    lesions.push({
      site_no: lesions.length + 1,
      body_site: zone?.display_name ?? (rawSize ? "（未指定部位）" : ""),
      body_part_zone_id: zone?.id ?? null,
      length_cm: size.length_cm,
      width_cm: size.width_cm,
      height_cm: size.height_cm,
      raw_size: rawSize,
      size_confidence: size.confidence,
      size_note: size.note,
    });
  }
  if (unreadKsiKost) {
    warnings.push(
      "KOR / KSI / KOST 欄位有填但**不會匯入**：它們在匯出時是由治療紀錄自動推導的。類固醇劑量請改用系統的「治療紀錄 → 病灶內注射」登打。"
    );
  }
  const onsetIds = optionIds("onset_cause", [...new Set(onsetCodes)], "KC（發生原因）");

  // ---- 手術 ----
  const surgeryDate = dateStr(op["Operation date"]);
  const surgeryZoneIds: (string | null)[] = [];
  for (let i = 1; i <= MAX_OP_SITES; i++) {
    const code = num(op[`Keloid Lo_O${i}`]);
    if (code === null) continue;
    const zone = lookups.zoneIdByCode.get(code);
    if (!zone) warnings.push(`Keloid Lo_O${i} 代碼 ${code} 不在部位碼表內，已略過`);
    surgeryZoneIds.push(zone?.id ?? null);
    if (str(op[`surgical procedure_${i}`])) {
      warnings.push(`surgical procedure_${i} 有填但不會匯入：系統目前沒有術式編碼欄位（見匯出檔的「欄位缺口清單」）`);
    }
  }
  // 放療部位（Keloid Lo_R1..3）：不讀的話放療紀錄掛不到病灶上，匯出時 KOR 會永遠是 0
  const rtZoneIds: (string | null)[] = [];
  for (let i = 1; i <= MAX_RT_SITES; i++) {
    const code = num(op[`Keloid Lo_R${i}`]);
    if (code === null) continue;
    const zone = lookups.zoneIdByCode.get(code);
    if (!zone) warnings.push(`Keloid Lo_R${i} 代碼 ${code} 不在部位碼表內，已略過`);
    rtZoneIds.push(zone?.id ?? null);
  }

  if (str(op["RT_Doctor"])) {
    warnings.push("RT_Doctor 有填但不會匯入：系統目前沒有放射科醫師清單（見匯出檔的「欄位缺口清單」）");
  }

  // ---- 追蹤回診（Year 1 + Year 2）----
  const symptomChangeMap = lookups.optionIdByCategoryCode.get("symptom_change");
  const fwSymptomCode = num(rows.year1?.["FW_k_symptom"]);
  const fwSymptomId = fwSymptomCode !== null ? symptomChangeMap?.get(fwSymptomCode) ?? null : null;
  if (fwSymptomCode !== null && !fwSymptomId) {
    warnings.push(`FW_k_symptom 代碼 ${fwSymptomCode} 不在 1-6 的碼表內，已略過`);
  }

  const visits: DecodedVisit[] = [];
  const readVisits = (row: SheetRow | undefined, offset: number) => {
    if (!row) return;
    for (let i = 1; i <= MAX_FW_PER_YEAR; i++) {
      const n = i + offset;
      const raw = row[`FW${n}_time`];
      if (!str(raw)) continue;
      const d = dateStr(raw);
      if (!d) {
        warnings.push(`FW${n}_time「${str(raw)}」不是可辨識的日期（請用 YYYY-MM-DD），該次回診已略過`);
        continue;
      }
      visits.push({ date: d, recurrence: num(row[`Recurrence_${n}`]) === 1, symptom_change_option_id: null });
    }
  };
  readVisits(rows.year1, 0);
  readVisits(rows.year2, 12);
  visits.sort((a, b) => a.date.localeCompare(b.date));
  // FW_k_symptom 是「第一年整體」一個值，掛在第一年最後一次回診上（匯出時也是這樣取回來）
  if (fwSymptomId) {
    const y1 = visits.filter((v) => !surgeryDate || (new Date(v.date).getTime() - new Date(surgeryDate).getTime()) / 86400000 <= 365);
    const target = y1[y1.length - 1];
    if (target) target.symptom_change_option_id = fwSymptomId;
    else warnings.push("FW_k_symptom 有填，但第一年沒有任何回診日期可以掛上，已略過");
  }

  if (surgeryDate) {
    for (const v of visits) {
      if (v.date < surgeryDate) warnings.push(`回診日期 ${v.date} 早於手術日 ${surgeryDate}，請確認`);
    }
  }

  return {
    research_id: researchId,
    sequence_no: parsedId ? Number(parsedId[3]) : 0,
    enrollment_year: parsedId ? Number(parsedId[2]) : 0,
    doctor_id: doctorId,
    fields: {
      sex,
      age_at_enrollment: age,
      phone_number: str(basic["mobile"]) || null,
      jsw_score: jsw === null ? null : String(jsw),
    },
    icd_code_ids: icdCodeIds,
    onset_cause_option_ids: onsetIds,
    keloid_symptom_option_ids: symptomIds,
    lesions,
    surgery: { date: surgeryDate, zone_ids: surgeryZoneIds },
    radiotherapy: {
      date: dateStr(op["Radiation date"]),
      zone_ids: rtZoneIds,
      fractions: num(op["Fractions"]),
      bolus: str(op["bolus"]) || null,
      electron_beam: str(op["electron beam"]) || null,
      treatment_response: str(op["Treatment Response"]) || null,
      acute_reactions: str(op["Acute Reactions"]) || null,
    },
    visits,
    biobank: {
      paraffin_block_no: str(basic["paraffin blocks No."]) || null,
      primary_culture: str(basic["Primary culture"]) || null,
      cryotube_location: str(basic["Cryotube      Location"]) || null,
    },
    errors,
    warnings,
  };
}
