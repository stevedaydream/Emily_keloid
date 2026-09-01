import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";
import { computeSF36, computePSQI, SF36_SCALES, computeJSSClassification } from "@/lib/scoring";
import { timepointLabelFor, FOLLOWUP_TIMEPOINT_MONTHS, TIMEPOINT_TOLERANCE_DAYS } from "@/lib/visitFlow";
import {
  SEX_CODE,
  DOSE_CODE,
  NO_RECORD,
  MAX_LESIONS,
  MAX_OP_SITES,
  MAX_RT_SITES,
  MAX_FW_YEAR1,
  MAX_FW_YEAR2,
  MAX_FW_TOTAL,
  BASIC_INFO_SHEET,
  OPERATION_SHEET,
  YEAR1_SHEET,
  YEAR2_SHEET,
  type SheetDef,
  buildCodebookRows,
  CODEBOOK_HEADERS,
  daysBetween,
  monthsBetween,
  jswNumber,
} from "@/lib/exportCodebook";

// 匯出格式＝部長 2026-08 版 Excel 編碼簿（docs/Keloid Operation treat.xlsx）。
//
// 主體是與他那份「欄位順序完全一致」的 4 張表，儲存格**只放數字碼**，可直接貼進統計軟體。
// 欄位數依 2026-08-14 確認的容量（病灶 20／手術 4／放療 4／追蹤 27）計算：
//   Basic Info.(206) / Operation(28) / Year 1 follow-up(48) / Year 2 follow-up(50)
// 平台多出來的東西（量表分數、Lab、病灶數字化測量、編碼對照、缺口說明）一律放附表，不污染主表。
//
// 刻意的偏離只有一處：欄名去掉原檔的排版空白與冗長括號（原檔是 `Keloid Lo_1                     (Keloid Location)`），
// 改用 `Keloid Lo_1`。原檔那些空白會讓公式參照與程式讀取都很脆弱，完整英文語意改放「編碼對照表」附表。
//
// Name / Chart No. 兩欄：預設留空；勾選「包含病歷號與姓名」並輸入正確的匯出金鑰時才帶出來
// （2026-08-25，取代原本的本機對照表／保管庫回填機制）。

import { verifyExportKey } from "@/lib/exportKey";

export const dynamic = "force-dynamic";

// 三份追蹤量表的名稱。跟 lib/visitFlow.ts 的 FOLLOWUP_SCALE_NAMES 是同一批，
// 但這裡各自要獨立的計分函式，所以分開列出而不是迴圈跑。
const JSS_NAME = "JSS 疤痕診斷分類表";
const SF36_NAME = "SF-36 健康調查簡表";
const PSQI_NAME = "匹茲堡睡眠品質量表（PSQI）";

const first = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

type Zone = {
  id: string;
  zone_key: string;
  display_name: string;
  export_label: string | null;
  export_code: number | null;
  dose_category: string;
  view: string;
  active: boolean;
};

type Lesion = {
  id: string;
  case_id: string;
  site_no: number | null;
  body_site: string;
  is_primary: boolean;
  measured_at: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  note: string | null;
  body_part_zone_id: string | null;
};

type TreatmentRow = {
  id: string;
  case_id: string;
  lesion_id: string | null;
  body_site: string | null;
  treatment_date: string;
  field_values: Record<string, string> | null;
  free_text: string | null;
  recurrence_observed: boolean | null;
  recurrence_description: string | null;
  blood_drawn: boolean | null;
  blood_drawn_note: string | null;
  symptom_change_option_id: string | null;
  treatment_types: { name?: string; field_schema?: FieldDef[] } | { name?: string; field_schema?: FieldDef[] }[] | null;
};

type FieldDef = { key: string; label: string; type: string; options?: { value: string; export_code?: number }[] };

type RtSession = {
  case_id: string;
  lesion_id: string | null;
  dose_category: string;
  fraction_no: number;
  status: string;
  due_date: string | null;
  planned_dose_cgy: number | null;
  actual_dose_cgy: number | null;
  rt_doctor: string | null;
};

/** cases 一列（只列出匯出實際用到的欄位；select("*") 仍會帶回全部） */
type CaseRow = {
  id: string;
  research_id: string;
  created_at: string;
  consent_signed_at: string | null;
  enrollment_year: number | null;
  doctor_id: string | null;
  data_source: string | null;
  /** demo／教育訓練期間建立的測試個案，預設不進匯出檔（2026-08-25） */
  is_test: boolean | null;
  /** 2026-08-25 起明文存雲端；匯出時要金鑰才帶得出來 */
  mrn: string | null;
  patient_name: string | null;
  sex: string | null;
  phone_number: string | null;
  age_at_enrollment: number | null;
  keloid_onset_date: string | null;
  birth_date: string | null;
  jsw_score: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  disease_history: string | null;
  family_history: string | null;
  doctors: { export_code?: number } | { export_code?: number }[] | null;
};

type LabRow = {
  case_id: string;
  marker_id: string;
  sample_date: string | null;
  value: number | null;
  value_text: string | null;
  note: string | null;
  recorded_by: string | null;
};

/**
 * 一次回診（同一天的多筆治療紀錄合併成一次）。
 * monthIndex＝距手術第幾個月，用來對到 FW1~FW27 的固定格子——助理 2026-08-13 明確要求
 * 「原先每個月的追蹤欄位不要刪除，也不要把延後回診直接填到原本月份而不註明」，
 * 所以不能像先前那樣把實際回診依序塞進 FW1、FW2…。
 */
type Visit = {
  date: string;
  days: number | null;
  monthIndex: number | null;
  recurrence: number;
  symptomChangeCode: number | null;
  /** 當次治療（KOR_FW / KSI_FW / KOST_FW；2026-08-26 起 FW1–FW27 每一格都有這三欄） */
  korCode: number;
  ksiCode: number;
  /** 藥膏／貼片品項碼。同一天有多筆時併排成 "6, 8"（2026-08-28），單筆維持數字型別。 */
  kostCode: number | string;
};

export async function GET(request: Request) {
  const supabase = supabaseServer();
  const sp = new URL(request.url).searchParams;

  // ---- 篩選與排序（docx 第 7 點：可照收案順序或其他方式篩選/排序）----
  // 收案年份用 cases.enrollment_year（研究編號裡的那個年份），**不是** created_at。
  // 舊資料回溯建檔的 created_at 是匯入當天（2026-07），跟真正的收案年份差好幾年，
  // 拿 created_at 篩「2026 年以後收的案」會把 2019 年的舊病人也全撈進來。
  const filterYearFrom = Number(sp.get("yearFrom")) || null;
  const filterYearTo = Number(sp.get("yearTo")) || null;
  const filterDoctor = sp.get("doctor") || null; // doctors.id
  const filterOperated = sp.get("operated") || null; // "yes" | "no"
  const filterSource = sp.get("source") || null; // "normal" | "legacy_import"
  const sort = sp.get("sort") || "created"; // created | research_id | surgery
  // 同意書：預設只匯出已簽署的（決策 2026-08-20 F-C2）。consent=all 才會把未簽的一起帶出來。
  const includeUnconsented = sp.get("consent") === "all";
  // 測試個案：預設排除（2026-08-25）。測試列混進部長的分析檔比缺幾列難發現得多——
  // 缺列看得出來，多列會被當成真的病人算進去。test=all 才會一起帶出來。
  const includeTestCases = sp.get("test") === "all";
  // 病歷號與姓名（2026-08-25）：預設不帶出來，要帶必須附上正確的匯出金鑰。
  // 金鑰錯或沒設定就一律當作沒勾——不要用錯誤訊息告訴對方「金鑰錯了但功能存在」。
  const identified = sp.get("identified") === "1" && (await verifyExportKey(sp.get("key") ?? ""));
  // 沒通過驗證就一律留空。集中成兩支小函式，四張主表共用同一個判斷，
  // 免得日後有人只改其中一張而讓姓名從另一張漏出去。
  const idName = (c: CaseRow) => (identified ? c.patient_name ?? "" : "");
  const idMrn = (c: CaseRow) => (identified ? c.mrn ?? "" : "");

  const [
    { data: casesRaw },
    { data: zonesRaw },
    { data: lesionsRaw },
    { data: diagnoses },
    { data: treatmentsRaw },
    { data: rtSessionsRaw },
    { data: photos },
    { data: responses },
    { data: answers },
    { data: intakeRecords },
    { data: optionLists },
    { data: biobankItems },
    { data: biobankLegacy },
    { data: labMarkers },
    { data: labResults },
    { data: doctors },
    { data: icdCodes },
    { data: treatmentTypeDefs },
    { data: rtDoctorList },
  ] = await Promise.all([
    supabase.from("cases").select("*, doctors(id, code, name, export_code)"),
    supabase.from("body_part_zones").select("id, zone_key, display_name, export_label, export_code, dose_category, view, active"),
    supabase
      .from("case_keloid_lesions")
      .select("id, case_id, site_no, body_site, is_primary, length_cm, width_cm, height_cm, note, body_part_zone_id, measured_at")
      .order("site_no", { nullsFirst: false }),
    supabase.from("case_diagnoses").select("case_id, is_primary, icd_codes(code, description_full, export_code)"),
    supabase
      .from("treatment_records")
      .select(
        "id, case_id, lesion_id, body_site, treatment_date, field_values, free_text, recurrence_observed, recurrence_description, blood_drawn, blood_drawn_note, symptom_change_option_id, treatment_types(name, field_schema)"
      )
      .order("treatment_date"),
    supabase.from("radiotherapy_sessions").select("case_id, lesion_id, dose_category, fraction_no, status, due_date, planned_dose_cgy, actual_dose_cgy, rt_doctor"),
    supabase.from("photos").select("case_id"),
    // completed_at is not null：把「存到一半」的草稿整份濾掉（2026-08-26）。
    // 病人版的 SF-36／PSQI 改成硬鎖＋逐頁存草稿之後，中途被打斷會留下半份問卷，
    // 而缺題是用官方的「已答題目平均」算的——一份只答了 19/36 題的 SF-36
    // 照樣會產生一個看起來完全正常的 0-100 分數，那不能進研究資料。
    supabase
      .from("questionnaire_responses")
      .select("id, case_id, submitted_at, submitted_via, questionnaire_templates(name, category)")
      .not("completed_at", "is", null),
    supabase.from("questionnaire_answers").select("response_id, answer_value, questionnaire_questions(order_no, question_text, options)"),
    supabase
      .from("case_intake_option_records")
      .select("case_id, category, case_intake_option_record_items(option_id)"),
    supabase.from("case_intake_option_lists").select("id, category, label, export_code, sort_order, active").order("sort_order"),
    supabase.from("biobank_checklist_items").select("*"),
    supabase.from("biobank_samples").select("*"),
    supabase.from("lab_marker_definitions").select("id, display_name, unit, sort_order").order("sort_order"),
    supabase.from("lab_results").select("case_id, marker_id, sample_date, value, value_text, note, recorded_by"),
    supabase.from("doctors").select("id, code, name, export_code").order("code"),
    supabase.from("icd_codes").select("code, description_full, export_code").order("code"),
    supabase.from("treatment_types").select("name, field_schema"),
    supabase.from("radiotherapy_doctors").select("name, export_code"),
  ]);

  // 問卷題目清單：橫向的「問卷逐題作答」要連沒作答的題目都留一欄，
  // 光靠作答紀錄推不出完整欄位（沒人答過的題目會整欄消失，不同批匯出的欄數就不一樣）。
  const [{ data: allTemplates }, { data: allQuestions }] = await Promise.all([
    supabase.from("questionnaire_templates").select("id, name"),
    supabase.from("questionnaire_questions").select("questionnaire_id, order_no").order("order_no"),
  ]);

  const zones = (zonesRaw ?? []) as Zone[];
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const lesions = (lesionsRaw ?? []) as Lesion[];
  const treatments = (treatmentsRaw ?? []) as TreatmentRow[];
  const rtSessions = (rtSessionsRaw ?? []) as RtSession[];
  const optionById = new Map((optionLists ?? []).map((o) => [o.id, o]));

  const byCase = <T extends { case_id: string }>(rows: T[] | null): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const arr = m.get(r.case_id) ?? [];
      arr.push(r);
      m.set(r.case_id, arr);
    }
    return m;
  };

  const lesionsByCase = byCase(lesions);
  const treatmentsByCase = byCase(treatments);
  const rtByCase = byCase(rtSessions);
  const diagnosesByCase = byCase((diagnoses ?? []) as { case_id: string; is_primary: boolean; icd_codes: unknown }[]);
  const biobankByCase = byCase((biobankItems ?? []) as { case_id: string; item_key: string; collected: boolean; collected_date: string | null }[]);
  const legacyBioByCase = byCase((biobankLegacy ?? []) as { case_id: string }[]);
  const intakeByCase = byCase((intakeRecords ?? []) as { case_id: string; category: string; case_intake_option_record_items: { option_id: string }[] }[]);
  const photoCount = new Map<string, number>();
  for (const p of photos ?? []) photoCount.set(p.case_id, (photoCount.get(p.case_id) ?? 0) + 1);

  // ---- 問卷分數 ----
  type AnswerRow = { order_no: number; value: unknown; text: string; options: { value?: string; label?: string }[] };
  const answersByResponse = new Map<string, AnswerRow[]>();
  for (const a of answers ?? []) {
    const q = first(a.questionnaire_questions) as
      | { order_no?: number; question_text?: string; options?: unknown }
      | undefined;
    const arr = answersByResponse.get(a.response_id) ?? [];
    arr.push({
      order_no: q?.order_no ?? 0,
      value: a.answer_value,
      text: q?.question_text ?? "",
      options: (q?.options ?? []) as { value?: string; label?: string }[],
    });
    answersByResponse.set(a.response_id, arr);
  }

  // 逐題分頁只輸出原始作答代碼；代碼對應的選項文字看「編碼對照表」分頁。
  const answerRaw = (row: AnswerRow): string =>
    Array.isArray(row.value) ? row.value.map((v) => String(v)).join(", ") : String(row.value ?? "");
  // 每一份回覆都留著，不再「一個個案只留一筆」（pending.md E2）。
  // 助理 2026-08-24 定案追蹤時間點＝術後滿 1／6／12 個月（±10 天），所以同一份問卷
  // 一個個案會有 Baseline ＋ 3 次共 4 筆；壓成一筆會把「術前 vs 術後一年」整個抹掉。
  type ScaleEntry = { date: string; submittedAt: string; byOrder: Record<number, unknown> };
  const entriesByCaseScale = new Map<string, ScaleEntry[]>();
  const scaleKey = (caseId: string, scale: string) => `${caseId}__${scale}`;
  for (const r of responses ?? []) {
    const q = first(r.questionnaire_templates) as { name?: string; category?: string } | undefined;
    if (!q?.name) continue;
    const ans = answersByResponse.get(r.id) ?? [];
    const byOrder: Record<number, unknown> = {};
    for (const a of ans) byOrder[a.order_no] = a.value;
    const key = scaleKey(r.case_id, q.name);
    const arr = entriesByCaseScale.get(key) ?? [];
    arr.push({ date: String(r.submitted_at).slice(0, 10), submittedAt: String(r.submitted_at), byOrder });
    entriesByCaseScale.set(key, arr);
  }
  for (const arr of entriesByCaseScale.values()) arr.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const entriesOf = (caseId: string, scale: string): ScaleEntry[] => entriesByCaseScale.get(scaleKey(caseId, scale)) ?? [];
  /** 主表（Basic Info.）＝收案當下那一份，所以取最早的一筆，不是隨機留下的一筆。 */
  const baselineOf = (caseId: string, scale: string): ScaleEntry | undefined => entriesOf(caseId, scale)[0];

  // ---- 每個個案的衍生資料 ----
  const typeNameOf = (t: TreatmentRow) => first(t.treatment_types)?.name ?? "";
  const surgeriesOf = (caseId: string) =>
    (treatmentsByCase.get(caseId) ?? []).filter((t) => typeNameOf(t) === "手術切除");
  const surgeryDateOf = (caseId: string) => surgeriesOf(caseId).map((t) => t.treatment_date).sort()[0] ?? null;

  // 「未能對應清單」逐筆累積（部位無法對到 22 碼、或籠統耳部無法分辨 helix/earlobe 的情形）
  const unmapped: (string | number)[][] = [];

  /** 個案層級某類選項的代碼字串（例「1, 3」）。多筆紀錄取聯集。 */
  const optionCodesFor = (caseId: string, category: string): string => {
    const codes = (intakeByCase.get(caseId) ?? [])
      .filter((r) => r.category === category)
      .flatMap((r) => (r.case_intake_option_record_items ?? []).map((it) => optionById.get(it.option_id)?.export_code))
      .filter((v): v is number => typeof v === "number");
    return codes.length ? [...new Set(codes)].sort((x, y) => x - y).join(", ") : "";
  };

  // 家族史／自身病史欄位存的是文字，但那串文字是「勾選常見疾病」時用選項 label 以頓號串起來的
  // （見 FamilyHistoryPicker），所以反推代碼是**確定的對照**、不是關鍵字猜測。
  // 舊資料匯入的自由文字對不到清單時會落到「其他」，這也是誠實的結果。
  const optionsOfCategory = (category: string) =>
    (optionLists ?? []).filter((o) => o.category === category && o.export_code !== null);

  const codesFromText = (text: string | null | undefined, category: string): string => {
    const raw = String(text ?? "").trim();
    if (!raw) return "";
    // 「無」＝問過了、一項也沒有（2026-08-26 助理要求加的選項；病人自填勾「以上都沒有」
    // 寫進來的也是這兩個字）。輸出 0 而不是留空白——空白在這張表裡代表「沒問／沒填」，
    // 兩者是不同的資料。部長原碼表只有 1–8，但他自己的 Keloid_family_history 就是用「無= 0」。
    if (raw === "無") return "0";
    const opts = optionsOfCategory(category);
    const other = opts.find((o) => o.label === "其他");
    const parts = raw.split(/[、,，;；]/).map((x) => x.trim()).filter(Boolean);
    const matched = new Set<number>();
    let unmatched = 0;
    for (const part of parts) {
      const hit = opts.find((o) => o.label !== "其他" && o.label === part);
      if (hit?.export_code != null) matched.add(hit.export_code);
      else unmatched++;
    }
    // **完全對不到任何選項就回空白，不要硬塞「其他」。**
    // 舊表的「Family」欄位語意其實是「哪些家人也有蟹足腫」（實際值是 NA／sister／mother, anut
    // ／3 young sister and elder brother 這類），不是家族疾病史。把它們一律當成「其他」，
    // 會讓下游的 Keloid_family_history 推出「無家族史」——而那些人恰恰是有的。
    if (matched.size === 0) return "";
    if (unmatched > 0 && other?.export_code != null) matched.add(other.export_code);
    return [...matched].sort((x, y) => x - y).join(", ");
  };

  /**
   * 放療紀錄與逐次待辦存的都是醫師姓名，匯出要的是碼——對照後台的放射科醫師清單翻回去
   * （2026-08-13 起這份名單是獨立資料表，不再放在 field_schema）。
   */
  const rtDoctorCodeByName = new Map(
    (rtDoctorList ?? [])
      .filter((d) => d.export_code !== null)
      .map((d) => [String(d.name).trim(), d.export_code as number])
  );

  /** 把某筆治療紀錄的某個 select 欄位值，對照 field_schema 翻成 export_code。 */
  const selectCode = (t: TreatmentRow | undefined, key: string): number | "" => {
    const raw = t?.field_values?.[key];
    if (!raw) return "";
    const schema = (first(t?.treatment_types)?.field_schema ?? []) as FieldDef[];
    // 不分大小寫比對：舊資料的術式有 Excision / excision / scar revision / Scar revision 混用，
    // 區分大小寫的話一半會對不到。但**不做模糊比對**——「Excision and multiple Z plasty」
    // 同時是兩種術式，硬選一個等於捏造，留空讓它進人工判讀。
    const norm = (v: string) => v.trim().toLowerCase();
    const opt = (schema.find((f) => f.key === key)?.options ?? []).find((o) => norm(String(o.value)) === norm(String(raw)));
    return opt?.export_code ?? "";
  };

  // KSI：該病灶的類固醇劑量碼（取最近一次病灶內注射的 steroid_dose，對照 field_schema 的 export_code）
  const steroidCodeOfLesion = (caseId: string, lesionId: string): number => {
    const rows = (treatmentsByCase.get(caseId) ?? [])
      .filter((t) => typeNameOf(t) === "病灶內注射" && t.lesion_id === lesionId)
      .sort((a, b) => b.treatment_date.localeCompare(a.treatment_date));
    for (const r of rows) {
      const raw = r.field_values?.steroid_dose;
      if (!raw) continue;
      const schema = (first(r.treatment_types)?.field_schema ?? []) as FieldDef[];
      const def = schema.find((f) => f.key === "steroid_dose");
      const opt = (def?.options ?? []).find((o) => o.value === raw);
      if (opt?.export_code !== undefined) return opt.export_code;
    }
    return 0; // 無=0（部長碼表）
  };

  // KOR：該病灶是否「手術＋放射線治療」都做過（有=1、無=0）。由實際紀錄推得，非推測。
  //
  // 放療有兩種來源，兩種都要算：
  //   ① radiotherapy_sessions（2026-07 之後的逐次排程）
  //   ② treatment_type='放射治療' 的 treatment_records（舊資料匯入時整體療程摘要的存放處，
  //      見 docs/legacy-alignment.md；目前 99 筆手術裡只有 1 個個案有 ① 的資料，
  //      只查 ① 會讓幾乎所有舊個案都誤判成「沒做過放療」）
  //
  // 舊資料有 12 筆手術紀錄沒有 lesion_id（匯入時文字對不上任何病灶）。這種紀錄只在
  // 「該個案僅有一個病灶」時才歸給那個病灶——多病灶時無法判斷是哪一處，寧可少算不要亂掛。
  const korOfLesion = (caseId: string, lesionId: string): number => {
    const lesionCount = (lesionsByCase.get(caseId) ?? []).length;
    const applies = (t: TreatmentRow) => t.lesion_id === lesionId || (t.lesion_id === null && lesionCount === 1);
    const rows = treatmentsByCase.get(caseId) ?? [];
    const hasOp = rows.some((t) => typeNameOf(t) === "手術切除" && applies(t));
    const hasRt =
      (rtByCase.get(caseId) ?? []).some((s) => s.lesion_id === lesionId || (s.lesion_id === null && lesionCount === 1)) ||
      rows.some((t) => typeNameOf(t) === "放射治療" && applies(t));
    return hasOp && hasRt ? 1 : 0;
  };

  // 純函式，沒有副作用——它在 Basic Info／手術部位／放療部位三處都會被呼叫，
  // 若在這裡累積「未能對應清單」，同一個病灶會被記三次。清單改由下方單獨跑一趟收集。
  const zoneCodeOfLesion = (l: Lesion): number | "" => {
    const z = l.body_part_zone_id ? zoneById.get(l.body_part_zone_id) : undefined;
    return z?.export_code ?? "";
  };

  /** 逐病灶檢查一次，累積「未能對應清單」（每個病灶最多一列）。 */
  const collectUnmapped = (l: Lesion, researchId: string) => {
    const label = `部位${l.site_no ?? ""}`;
    const z = l.body_part_zone_id ? zoneById.get(l.body_part_zone_id) : undefined;
    if (!z) {
      unmapped.push([researchId, label, l.body_site, "（未指定人形圖部位）", "", "無法對到部長 22 碼，需人工在個案頁指定部位"]);
      return;
    }
    if (z.export_code === null) {
      unmapped.push([researchId, label, l.body_site, z.display_name, "", "該熱區尚未設定 export_code，請至後台補"]);
      return;
    }
    // 舊的籠統「左耳/右耳」熱區分不出 helix 還是 earlobe，暫代 earlobe 並逐筆列出供校正
    if (z.zone_key === "front_ear_l" || z.zone_key === "front_ear_r") {
      unmapped.push([researchId, label, l.body_site, z.display_name, z.export_code, "籠統耳部，已暫代 earlobe，請確認實際為 helix(1/2) 或 earlobe(3/4)"]);
    }
  };

  // ---- 篩選 ----
  let cases = (casesRaw ?? []) as CaseRow[];
  if (filterYearFrom) cases = cases.filter((c) => Number(c.enrollment_year) >= filterYearFrom);
  if (filterYearTo) cases = cases.filter((c) => Number(c.enrollment_year) <= filterYearTo);
  if (filterDoctor) cases = cases.filter((c) => c.doctor_id === filterDoctor);
  if (filterSource) cases = cases.filter((c) => (c.data_source ?? "normal") === filterSource);
  if (filterOperated === "yes") cases = cases.filter((c) => surgeryDateOf(c.id) !== null);
  if (filterOperated === "no") cases = cases.filter((c) => surgeryDateOf(c.id) === null);
  if (!includeUnconsented) cases = cases.filter((c) => Boolean(c.consent_signed_at));
  if (!includeTestCases) cases = cases.filter((c) => !c.is_test);

  // ---- 排序（預設＝收案建檔順序，即部長說的「收案點選先後順序」）----
  if (sort === "research_id") {
    cases.sort((a, b) => String(a.research_id).localeCompare(String(b.research_id)));
  } else if (sort === "surgery") {
    cases.sort((a, b) => String(surgeryDateOf(a.id) ?? "9999").localeCompare(String(surgeryDateOf(b.id) ?? "9999")));
  } else {
    cases.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  // ---- 回診（追蹤）：同一天多筆治療紀錄合併成一次回診 ----
  /** 距手術第幾個月（1 起算）。日期在手術當月內算第 1 個月。 */
  const monthsSince = (from: string, to: string): number => {
    const a = new Date(from);
    const b = new Date(to);
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(1, m); // 術後一個月內的回診（換藥、拆線）一律歸到第 1 個月
  };

  const visitsOf = (caseId: string): Visit[] => {
    const opDate = surgeryDateOf(caseId);
    const byDate = new Map<string, TreatmentRow[]>();
    for (const t of treatmentsByCase.get(caseId) ?? []) {
      // 放療已經在 Operation 表的 Radiation date 欄，再算成一次追蹤會把真正的第一次回診
      // 擠到後面（實測 round-trip 時踩到：FW1 變成放療日、原本的 FW1 變 FW2）
      if (typeNameOf(t) === "放射治療") continue;
      byDate.set(t.treatment_date, [...(byDate.get(t.treatment_date) ?? []), t]);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      // 手術當天是基準點（已在 Operation date 欄），不算成回診
      .filter(([date]) => !opDate || date > opDate)
      .map(([date, rows]) => {
        const changeId = rows.map((r) => r.symptom_change_option_id).find(Boolean) ?? null;
        // 當次治療：手術或放療→KOR=1；類固醇劑量與藥膏品項各自對照 field_schema 的碼
        const hasOpOrRt = rows.some((r) => ["手術切除", "放射治療"].includes(typeNameOf(r)));
        const inj = rows.find((r) => typeNameOf(r) === "病灶內注射");
        // KOST：**同一天所有藥膏／貼片的品項碼都要進去**（助理 2026-08-28）。
        //
        // 原本是 rows.find(...) 只取第一筆。但「同時擦藥膏又貼矽膠片」正是助理要觀察的情況
        // （他明講這三欄的目的是「觀察術後有在使用藥膏或矽膠貼布」），只留一筆等於答不出這件事。
        // 實際資料就有兩天同時登了藥膏與貼片各一筆。
        //
        // 多碼寫法沿用 Medical_history_self／Fmaily_history 的「1, 5」格式，部長的檔案裡已經有這種欄位。
        // **只有一個碼時仍輸出數字**（不是 "8" 字串）——單碼是絕大多數情況，
        // 讓 Excel 照樣存成數值，部長既有的公式不會因為型別變成文字而失效。
        const ointCodes = [
          ...new Set(
            rows
              .filter((r) => ["藥膏", "貼片"].includes(typeNameOf(r)))
              .map((r) => selectCode(r, "product"))
              .filter((v): v is number => typeof v === "number")
          ),
        ].sort((a, b) => a - b);
        return {
          date,
          days: daysBetween(opDate, date),
          monthIndex: opDate ? monthsSince(opDate, date) : null,
          recurrence: rows.some((r) => r.recurrence_observed) ? 1 : 0,
          symptomChangeCode: changeId ? optionById.get(changeId)?.export_code ?? null : null,
          korCode: hasOpOrRt ? 1 : 0,
          ksiCode: inj ? Number(selectCode(inj, "steroid_dose") || 0) : 0,
          kostCode: ointCodes.length === 0 ? "" : ointCodes.length === 1 ? ointCodes[0] : ointCodes.join(", "),
        };
      });
  };

  /**
   * 把回診放進「第 N 個月」的固定格子（新格式語意）。
   * 同一個月有多次回診時保留第一次，其餘進「追蹤逐筆」附表——
   * 助理要求延後的回診不可直接填進原本月份而不註明，所以寧可留空也不擠。
   */
  const visitsByMonthSlot = (visits: Visit[], fromMonth: number, toMonth: number) => {
    const slots = new Map<number, Visit>();
    const extras: Visit[] = [];
    for (const v of visits) {
      const m = v.monthIndex;
      if (m === null || m < fromMonth || m > toMonth) continue;
      if (slots.has(m)) extras.push(v);
      else slots.set(m, v);
    }
    return { slots, extras };
  };

  const wb = new ExcelJS.Workbook();

  /** 建一張主表：第 1 列編碼說明、第 2 列欄名、第 3 列起資料。 */
  function addMainSheet({ name, headers, legends }: SheetDef) {
    const ws = wb.addWorksheet(name);
    ws.addRow(legends.map((l) => l ?? ""));
    ws.addRow(headers);
    ws.getRow(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    ws.getRow(1).alignment = { wrapText: false, vertical: "top" };
    ws.getRow(2).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 2 }];
    ws.columns.forEach((c) => (c.width = 15));
    return ws;
  }

  // ============ Sheet 1: Basic Info. ============
  const wsBasic = addMainSheet(BASIC_INFO_SHEET);
  const wsOp = addMainSheet(OPERATION_SHEET);
  const wsY1 = addMainSheet(YEAR1_SHEET);
  const wsY2 = addMainSheet(YEAR2_SHEET);

  // ---- 附表容器 ----
  const lesionMeasureRows: (string | number)[][] = [];
  const visitRows: (string | number)[][] = [];
  const scoreRows: (string | number)[][] = [];
  // 術前 vs 術後一年的配對比較（助理 2026-08-24 指定的主要分析）
  const compareRows: (string | number)[][] = [];
  // 部長 4 張主表沒有位置、但平台有收的選項類資料（此次就診原因、得知看診資訊）。
  // 主表不能加欄（欄位順序必須與他的檔一致），所以獨立成附表——否則這些資料匯出時會整個消失。
  const optionRows: (string | number)[][] = [];
  // 問卷逐題作答（docx 項次 9：「目前 JSS raw data 是給總分、SF-36 是給 8 項指標，附上 raw data 呈現結果」）。
  // 主表與「問卷分數」附表只有計分結果，這裡逐題列出病人實際點了什麼。
  const overflowNotes: string[] = [];

  // ============ 逐個案填資料 ============
  for (const c of cases) {
    const rid = c.research_id as string;
    const sexCode = c.sex ? SEX_CODE[c.sex] ?? "" : "";
    const doctor = first(c.doctors) as { export_code?: number } | undefined;
    const allLesions = (lesionsByCase.get(c.id) ?? []).sort((a, b) => (a.site_no ?? 99) - (b.site_no ?? 99));
    const opDate = surgeryDateOf(c.id);

    // ---- 病灶區塊（主表前 MAX_LESIONS 個，全部進「病灶測量」附表）----
    const lesionCells: (string | number)[] = [];
    // 助理回覆 D5：手術多半只做 1-2 處，其他疤痕治療方式各處大多一致——
    // 所以發生原因與藥膏/貼片記在個案層級即可，各病灶填同一個值。
    const caseKcCodes = optionCodesFor(c.id, "onset_cause");
    const caseKostCodes = optionCodesFor(c.id, "ointment_patch");
    for (let i = 0; i < MAX_LESIONS; i++) {
      const l = allLesions[i];
      if (!l) {
        lesionCells.push("", "", "", "", "", "", "", "", "");
        continue;
      }
      const L = l.length_cm, W = l.width_cm, H = l.height_cm;
      lesionCells.push(
        zoneCodeOfLesion(l),
        caseKcCodes,
        L ?? "",
        W ?? "",
        H ?? "",
        // 總面積＝長×寬（助理：「先計算面積就好」；示範資料 1.3×1.6=2.08 已驗證）
        L !== null && W !== null ? Number((L * W).toFixed(2)) : "",
        korOfLesion(c.id, l.id),
        steroidCodeOfLesion(c.id, l.id),
        caseKostCodes
      );
    }
    if (allLesions.length > MAX_LESIONS) {
      overflowNotes.push(`${rid}：${allLesions.length} 個病灶，主表只放前 ${MAX_LESIONS} 個，其餘見「病灶測量」附表`);
    }
    for (const l of allLesions) {
      collectUnmapped(l, rid);
      const z = l.body_part_zone_id ? zoneById.get(l.body_part_zone_id) : undefined;
      const L = l.length_cm, W = l.width_cm, H = l.height_cm;
      const dims = [L, W, H].filter((d): d is number => typeof d === "number");
      lesionMeasureRows.push([
        rid, l.site_no ?? "", l.is_primary ? 1 : 0, z?.export_code ?? "", z?.display_name ?? "", l.body_site,
        L ?? "", W ?? "", H ?? "",
        dims.length ? Math.max(...dims) : "",
        L !== null && W !== null ? Number((L * W).toFixed(2)) : "",
        L !== null && W !== null && H !== null ? Number((L * W * H).toFixed(2)) : "",
        l.measured_at ?? "",
        (l.site_no ?? 99) > MAX_LESIONS ? "超出主表上限" : "",
        l.note ?? "",
      ]);
    }

    // ---- Basic Info. 一列 ----
    const primaryIcd = (diagnosesByCase.get(c.id) ?? [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((d) => first(d.icd_codes) as { export_code?: number } | undefined)[0];
    // 主表只放 Baseline（收案當下）那一份；歷次施測在「問卷分數」與「術前術後比較」兩張附表。
    const sf36Base = baselineOf(c.id, SF36_NAME);
    const psqiBase = baselineOf(c.id, PSQI_NAME);
    const sf36 = sf36Base ? computeSF36(sf36Base.byOrder).scales : null;
    const psqi = psqiBase ? computePSQI(psqiBase.byOrder) : null;
    const bioMap = new Map((biobankByCase.get(c.id) ?? []).map((b) => [b.item_key, b]));
    const legacyBio = (legacyBioByCase.get(c.id) ?? [])[0] as Record<string, string | number | null> | undefined;
    const anyBiobank = [...bioMap.values()].some((b) => b.collected) || !!legacyBio?.tissue_bank_status;

    wsBasic.addRow([
      rid, idName(c), idMrn(c), sexCode, c.phone_number ?? "",
      c.birth_date ?? "", // birthday（2026-08-13 加入，見 project.md 安全性備忘）
      c.age_at_enrollment ?? "",
      // 身高體重沒填時用部長定義的「無紀錄」哨兵；BMI 由兩者算出，不另存欄位以免不同步
      c.height_cm ?? NO_RECORD,
      c.weight_kg ?? NO_RECORD,
      c.height_cm && c.weight_kg ? Number((c.weight_kg / (c.height_cm / 100) ** 2).toFixed(1)) : NO_RECORD,
      doctor?.export_code ?? "",
      primaryIcd?.export_code ?? "",
      codesFromText(c.disease_history, "self_disease"),
      codesFromText(c.family_history, "family_disease"),
      // 2026-08-13 新格式移除了 Keloid_family_history 欄——家族史第 7 項已含「蟹足腫或肥厚性疤痕」
      // 發生時間以月計（助理 D6：初診時問，記到年份即可，換算成月數）
      monthsBetween(c.keloid_onset_date, String(c.created_at).slice(0, 10)) ?? "",
      optionCodesFor(c.id, "visit_reason"),
      ...lesionCells,
      // VSS score：2026-08-24 起不再收 VSS（助理裁決只評 JSS），欄位保留留白以維持
      // 與部長 Excel 的欄位對齊，說明見「欄位缺口清單」附表。
      "",
      jswNumber(c.jsw_score),
      sf36 ? SF36_SCALES.map((s) => sf36.find((r) => r.key === s.key)?.score ?? "").join("/") : "",
      psqi?.global ?? "",
      photoCount.get(c.id) ? 1 : 0,
      optionCodesFor(c.id, "keloid_symptom"),
      anyBiobank ? 1 : 0,
      // Primary culture 改為 0/1 編碼（新格式 2026-08-13）
      legacyBio?.primary_culture || bioMap.get("tissue_keloid_fibroblast_culture")?.collected ? 1 : 0,
      legacyBio?.paraffin_block_no ?? "",
      legacyBio?.cryotube_location ?? "",
    ]);

    // ---- Operation 一列 ----
    const surgeries = surgeriesOf(c.id);
    const opCells: (string | number)[] = [];
    for (let i = 0; i < MAX_OP_SITES; i++) {
      const s = surgeries[i];
      const l = s?.lesion_id ? allLesions.find((x) => x.id === s.lesion_id) : undefined;
      opCells.push(l ? zoneCodeOfLesion(l) : "", selectCode(s, "method"));
    }
    if (surgeries.length > MAX_OP_SITES) {
      overflowNotes.push(`${rid}：${surgeries.length} 筆手術紀錄，Operation 表只放前 ${MAX_OP_SITES} 筆`);
    }

    // 放療：依病灶分組，每組是一個療程
    const sessions = (rtByCase.get(c.id) ?? []).sort((a, b) => a.fraction_no - b.fraction_no);
    const courses = new Map<string, RtSession[]>();
    for (const s of sessions) courses.set(s.lesion_id ?? "none", [...(courses.get(s.lesion_id ?? "none") ?? []), s]);
    let courseList = [...courses.entries()];

    // 後備路徑：舊資料（以及匯入進來的資料）的放療是記在 treatment_type='放射治療' 的
    // treatment_records 裡，沒有逐次的 radiotherapy_sessions——99 筆手術裡只有 1 個個案有 sessions。
    // 只看 sessions 的話，幾乎所有個案的 Keloid Lo_R / Total Dose 都會是空的。
    if (courseList.length === 0) {
      const rtRows = (treatmentsByCase.get(c.id) ?? []).filter((t) => typeNameOf(t) === "放射治療");
      courseList = rtRows.map((t) => {
        const lesion = t.lesion_id ? allLesions.find((x) => x.id === t.lesion_id) : undefined;
        const zone = lesion?.body_part_zone_id ? zoneById.get(lesion.body_part_zone_id) : undefined;
        return [
          t.lesion_id ?? "none",
          [{ dose_category: zone?.dose_category ?? "", lesion_id: t.lesion_id } as RtSession],
        ] as [string, RtSession[]];
      });
    }

    const rtCells: (string | number)[] = [];
    for (let i = 0; i < MAX_RT_SITES; i++) {
      const entry = courseList[i];
      if (!entry) {
        rtCells.push("", "");
        continue;
      }
      const [lesionId, rows] = entry;
      const l = lesionId !== "none" ? allLesions.find((x) => x.id === lesionId) : undefined;
      rtCells.push(l ? zoneCodeOfLesion(l) : "", DOSE_CODE[rows[0].dose_category] ?? "");
    }
    if (courseList.length > MAX_RT_SITES) {
      overflowNotes.push(`${rid}：${courseList.length} 組放療療程，Operation 表只放前 ${MAX_RT_SITES} 組`);
    }

    const rtRecord = (treatmentsByCase.get(c.id) ?? []).find((t) => typeNameOf(t) === "放射治療");
    const rtDate = sessions.map((s) => s.due_date).filter(Boolean).sort()[0] ?? rtRecord?.treatment_date ?? "";

    wsOp.addRow([
      rid, idName(c), idMrn(c), sexCode, opDate ?? "",
      ...opCells,
      rtDate,
      // 醫師有兩個來源：「放射治療」治療紀錄，以及手術後自動產生的逐次待辦。
      // 實際執行時走的是後者（每次做完在個案頁標記完成），所以治療紀錄沒填時要退回去找。
      rtDoctorCodeByName.get(String(rtRecord?.field_values?.rt_doctor ?? "").trim()) ??
        rtDoctorCodeByName.get(String(sessions.find((x) => x.rt_doctor)?.rt_doctor ?? "").trim()) ??
        "",
      sessions.length || rtRecord?.field_values?.fractions || "",
      rtRecord?.field_values?.bolus ?? "",
      rtRecord?.field_values?.electron_beam ?? "",
      ...rtCells,
      rtRecord?.field_values?.treatment_response ?? "",
      rtRecord?.field_values?.acute_reactions ?? "",
    ]);

    // ---- Year 1 / Year 2 ----
    // FW1~FW27 是「第 N 個月」的固定格子，不是實際回診的流水序（助理 2026-08-13）。
    // 沒回診的月份填 0（工作表上的說明就是「未回診請直接填 0」）。
    const visits = visitsOf(c.id);
    const { slots: y1Slots, extras: y1Extras } = visitsByMonthSlot(visits, 1, MAX_FW_YEAR1);
    const { slots: y2Slots, extras: y2Extras } = visitsByMonthSlot(visits, MAX_FW_YEAR1 + 1, MAX_FW_TOTAL);
    const beyond = visits.filter((v) => v.monthIndex !== null && v.monthIndex > MAX_FW_TOTAL);
    if (y1Extras.length || y2Extras.length || beyond.length) {
      overflowNotes.push(
        `${rid}：同月多次回診 ${y1Extras.length + y2Extras.length} 次、第 ${MAX_FW_TOTAL} 個月之後 ${beyond.length} 次，` +
          `主表每個月只放第一次，其餘見「追蹤逐筆」附表`
      );
    }
    // FW_k_symptom：助理指定在「第 1 個月的第一次回診」問一次，所以取第 1 格的答案
    const y1Symptom = y1Slots.get(1)?.symptomChangeCode ?? "";

    /** 一個月份格子的儲存格。第 1、2 個月多了當次治療的三欄。 */
    const fwCells = (slots: Map<number, Visit>, fromMonth: number, count: number) => {
      const cells: (string | number)[] = [];
      for (let i = 0; i < count; i++) {
        const m = fromMonth + i;
        const v = slots.get(m);
        // 2026-08-26：每一格都輸出當次治療的三個碼。原本只有 m<=2 有，那是照部長原檔抄的，
        // 他 08-26 說明那是來不及放。碼本來就每筆回診都算好了（見 Visit），不用補資料。
        if (!v) {
          // 未回診：時間欄填 0（依工作表說明），其餘留空
          cells.push(0, "", "", "", "", "");
          continue;
        }
        cells.push(v.date, v.days ?? "", v.korCode, v.ksiCode, v.kostCode, v.recurrence);
      }
      return cells;
    };
    wsY1.addRow([rid, idName(c), idMrn(c), sexCode, opDate ?? "", y1Symptom, ...fwCells(y1Slots, 1, MAX_FW_YEAR1)]);
    wsY2.addRow([rid, idName(c), idMrn(c), sexCode, opDate ?? "", ...fwCells(y2Slots, MAX_FW_YEAR1 + 1, MAX_FW_YEAR2)]);

    for (const [idx, v] of visits.entries()) {
      visitRows.push([
        rid, idx + 1, v.date, v.days ?? "", v.monthIndex ?? "", v.recurrence, v.symptomChangeCode ?? "",
        v.monthIndex === null || v.monthIndex <= MAX_FW_YEAR1
          ? "第一年"
          : v.monthIndex <= MAX_FW_TOTAL
            ? "第二年"
            : `第 ${MAX_FW_TOTAL} 個月之後`,
      ]);
    }

    // ---- 主表沒有欄位的選項類紀錄 ----
    for (const [category, label] of [
      ["visit_reason", "此次就診主要原因"],
      ["referral_source", "如何得知看診資訊"],
    ] as const) {
      for (const rec of (intakeByCase.get(c.id) ?? []).filter((r) => r.category === category)) {
        const items = (rec.case_intake_option_record_items ?? [])
          .map((it) => optionById.get(it.option_id))
          .filter(Boolean) as { label: string; export_code: number | null }[];
        if (!items.length) continue;
        optionRows.push([
          rid,
          label,
          items.map((o) => o.export_code ?? "").filter((v) => v !== "").join(", "),
          items.map((o) => o.label).join("、"),
        ]);
      }
    }

    // ---- 問卷分數附表：一列＝一個研究編號 × 一個時間點 ----
    //
    // 2026-08-24 改版（原本一個個案只有一列，多次施測互相覆蓋且不保證留下哪一筆，pending.md E2）。
    // 助理同日定案追蹤時間點：術前 Baseline ＋ 術後滿 1／6／12 個月（前後 10 天都算），
    // 三份量表（JSS／SF-36／PSQI）在每個時間點一起測。所以時間點是這張表的主鍵之一。
    //
    // 分組鍵是 timepointLabelFor()，跟回診動線判定「本次要不要測量表」用的是同一個函式——
    // 兩邊各寫一次「什麼叫滿一個月」，畫面說要測、匯出卻歸成窗期外，就沒有人說得清哪邊對。
    const opDateForScales = surgeryDateOf(c.id);
    const buckets = new Map<string, { jss?: ScaleEntry; sf36?: ScaleEntry; psqi?: ScaleEntry; order: string }>();
    for (const [scale, slot] of [
      [JSS_NAME, "jss"],
      [SF36_NAME, "sf36"],
      [PSQI_NAME, "psqi"],
    ] as const) {
      for (const e of entriesOf(c.id, scale)) {
        const label = timepointLabelFor(opDateForScales, e.date);
        const bucket = buckets.get(label) ?? { order: e.date };
        // 同一時間點內重複施測（實測有相隔幾秒送三次的資料）取最後一筆；每一筆的逐題原始碼
        // 都還在「◯◯ 逐題」分頁，這裡只是計分結果。
        bucket[slot] = e;
        if (e.date < bucket.order) bucket.order = e.date;
        buckets.set(label, bucket);
      }
    }
    for (const [label, b] of [...buckets].sort((x, y) => x[1].order.localeCompare(y[1].order))) {
      const jssTotal = b.jss ? computeJSSClassification(b.jss.byOrder)?.total ?? "" : "";
      const s = b.sf36 ? computeSF36(b.sf36.byOrder).scales : null;
      const p = b.psqi ? computePSQI(b.psqi.byOrder) : null;
      scoreRows.push([
        rid,
        label,
        opDateForScales ?? "",
        b.jss?.date ?? "", jssTotal,
        b.sf36?.date ?? "",
        ...SF36_SCALES.map((sc) => s?.find((r) => r.key === sc.key)?.score ?? ""),
        b.psqi?.date ?? "",
        ...(p ? p.components.map((x) => x.score ?? "") : Array(7).fill("")),
        p?.global ?? "",
        p === null || p?.global === null ? "" : p.poorSleep ? "睡眠品質不佳" : "睡眠品質尚可",
      ]);
    }

    // ---- 術前術後比較附表（助理 2026-08-24 指定的主要分析）----
    // Baseline 與術後 12 個月各一組分數＋差值，直接跑配對檢定不用先 pivot。
    const pick = (scale: string, want: string) =>
      entriesOf(c.id, scale).find((e) => timepointLabelFor(opDateForScales, e.date) === want);
    const baseLabel = opDateForScales ? "Baseline（術前）" : "Baseline（未手術）";
    const jssB = pick(JSS_NAME, baseLabel), jssY = pick(JSS_NAME, "術後 12 個月");
    const sfB = pick(SF36_NAME, baseLabel), sfY = pick(SF36_NAME, "術後 12 個月");
    const pqB = pick(PSQI_NAME, baseLabel), pqY = pick(PSQI_NAME, "術後 12 個月");
    if (jssB || jssY || sfB || sfY || pqB || pqY) {
      const jssBt = jssB ? computeJSSClassification(jssB.byOrder)?.total ?? null : null;
      const jssYt = jssY ? computeJSSClassification(jssY.byOrder)?.total ?? null : null;
      const sfBs = sfB ? computeSF36(sfB.byOrder).scales : null;
      const sfYs = sfY ? computeSF36(sfY.byOrder).scales : null;
      const pqBs = pqB ? computePSQI(pqB.byOrder) : null;
      const pqYs = pqY ? computePSQI(pqY.byOrder) : null;
      const diff = (a: number | null | undefined, b: number | null | undefined) =>
        typeof a === "number" && typeof b === "number" ? Number((b - a).toFixed(1)) : "";
      const sfScore = (list: typeof sfBs, key: string) => list?.find((r) => r.key === key)?.score ?? null;
      compareRows.push([
        rid,
        jssBt ?? "", jssYt ?? "", diff(jssBt, jssYt),
        pqBs?.global ?? "", pqYs?.global ?? "", diff(pqBs?.global, pqYs?.global),
        ...SF36_SCALES.flatMap((sc) => [
          sfScore(sfBs, sc.key) ?? "",
          sfScore(sfYs, sc.key) ?? "",
          diff(sfScore(sfBs, sc.key), sfScore(sfYs, sc.key)),
        ]),
      ]);
    }
  }

  // ============ 附表 ============
  function addSheet(name: string, headers: string[], rows: (string | number)[][], width = 16) {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach((c) => (c.width = width));
    return ws;
  }

  // 尺寸是**術前 baseline**（助理 2026-08-24：手術把病灶切掉了，術後不再量），
  // 所以「量測日」與「主病灶」兩欄是解讀這張表的必要條件：前者說明這組數字是哪一天量的，
  // 後者標出 JSS 疤痕診斷分類表評的是哪一顆。
  addSheet("病灶測量（術前 baseline）", [
    "Subject_ID", "病灶序", "主病灶(0/1)", "部位碼", "部位名稱", "原始部位文字",
    "長cm", "寬cm", "高cm", "最大徑cm", "面積cm²", "體積cm³", "量測日", "備註", "登記備註",
  ], lesionMeasureRows);

  addSheet("追蹤逐筆", ["Subject_ID", "第幾次回診", "回診日期", "距手術日天數", "第幾個月", "復發(0/1)", "症狀變化碼", "歸屬"], visitRows);

  addSheet("收案選項紀錄", ["Subject_ID", "類別", "代碼", "選項"], optionRows, 26);

  // 一列＝一個研究編號 × 一個時間點（Baseline／術後 1、6、12 個月／窗期外）。
  // 原本是一個個案一列、多次施測互相覆蓋（pending.md E2），追蹤時間點定案後改成長格式。
  addSheet("問卷分數", [
    "Subject_ID", "時間點", "手術日",
    "JSS填寫日", "JSS總分",
    "SF36填寫日", ...SF36_SCALES.map((s) => `SF36-${s.label}`),
    "PSQI填寫日",
    "PSQI-主觀睡眠品質", "PSQI-睡眠潛伏期", "PSQI-睡眠時數", "PSQI-睡眠效率", "PSQI-睡眠困擾",
    "PSQI-安眠藥物使用", "PSQI-日間功能障礙", "PSQI總分", "PSQI判定",
  ], scoreRows);

  // 主要分析用的寬表：一列一個人，Baseline 與術後 12 個月並排＋差值（術後 − 術前）。
  addSheet("術前術後比較", [
    "Subject_ID",
    "JSS-Baseline", "JSS-12個月", "JSS-差值",
    "PSQI-Baseline", "PSQI-12個月", "PSQI-差值",
    ...SF36_SCALES.flatMap((s) => [`SF36-${s.label}-Baseline`, `SF36-${s.label}-12個月`, `SF36-${s.label}-差值`]),
  ], compareRows, 18);

  const labMarkerById = new Map((labMarkers ?? []).map((m) => [m.id, m]));
  const researchIdById = new Map(cases.map((c) => [c.id, c.research_id as string]));

  // Lab 生物標記寬表（2026-09-02 使用者要求：檢驗值要跟研究編號在同一橫列）。
  //   一列 ＝ 一個研究編號 × 一次抽血（同一個採檢日期抽的所有標記併成一列，標記往右排）
  // 跟問卷逐題分頁同一套慣例（一列＝編號×次別），欄數不會隨抽血次數膨脹；
  // 沒抽過血的個案也留一列空白，這張分頁的個案數才跟主表一致，一眼看得出誰還沒抽。
  //   · 一格優先放 value（數字，Excel 才當數字算），沒有數字才退回 value_text（`<0.35` 這種檢驗報告寫法）
  //   · 備註與記錄者塞不進寬表（同一次抽血的各個標記各有各的備註），留在下面的逐筆分頁
  const markerCols = labMarkers ?? [];
  const labByCase = new Map<string, Map<string, Map<string, string | number>>>();
  for (const r of (labResults ?? []) as LabRow[]) {
    if (!researchIdById.has(r.case_id)) continue;
    const byDate = labByCase.get(r.case_id) ?? new Map<string, Map<string, string | number>>();
    const cells = byDate.get(r.sample_date ?? "") ?? new Map<string, string | number>();
    const n = r.value === null || r.value === undefined ? NaN : Number(r.value);
    cells.set(r.marker_id, Number.isFinite(n) ? n : r.value_text ?? "");
    byDate.set(r.sample_date ?? "", cells);
    labByCase.set(r.case_id, byDate);
  }

  const labWideRows: (string | number)[][] = [];
  for (const c of cases) {
    const byDate = labByCase.get(c.id);
    if (!byDate || byDate.size === 0) {
      labWideRows.push([c.research_id, "", "", ...markerCols.map(() => "")]);
      continue;
    }
    [...byDate.keys()].sort().forEach((date, i) => {
      const cells = byDate.get(date);
      labWideRows.push([c.research_id, i + 1, date, ...markerCols.map((m) => cells?.get(m.id) ?? "")]);
    });
  }

  addSheet(
    "Lab 生物標記",
    [
      "Subject_ID",
      "第幾次抽血",
      "採檢日期",
      ...markerCols.map((m) => (m.unit ? `${m.display_name}（${m.unit}）` : m.display_name)),
    ],
    labWideRows,
    14
  );

  // Lab 逐筆：寬表一格只放得下一個值，備註／記錄者／原始字串留在這裡（資料不流失）
  const labRows = ((labResults ?? []) as LabRow[])
    .filter((r) => researchIdById.has(r.case_id))
    .sort(
      (a, b) =>
        String(researchIdById.get(a.case_id)).localeCompare(String(researchIdById.get(b.case_id))) ||
        String(a.sample_date).localeCompare(String(b.sample_date))
    )
    .map((r) => [
      researchIdById.get(r.case_id) ?? "", labMarkerById.get(r.marker_id)?.display_name ?? "",
      labMarkerById.get(r.marker_id)?.unit ?? "", r.sample_date ?? "",
      r.value ?? "", r.value_text ?? "", r.note ?? "", r.recorded_by ?? "",
    ]);
  addSheet("Lab 生物標記逐筆", ["Subject_ID", "標記", "單位", "採檢日期", "數值", "原始字串", "備註", "記錄者"], labRows);

  // ---- 對照組不在這個檔裡 ----
  // 助理 2026-08-24：對照組與實驗組**分成兩個檔**（原本是本檔的一張分頁）。
  // 對照組走 /api/export/control-subjects，篩選條件（同意書）兩支共用同一組查詢字串。

  // ---- 問卷逐題作答：一份問卷一張分頁（docx 項次 9）----
  // 「目前 JSS raw data 是給總分、SF-36 是給各項 8 項指標的各項總分，附上 raw data 呈現結果」
  // ＝ 主表與「問卷分數」附表只有計分結果，這裡列出病人實際點了哪個選項的**原始代碼**。
  //
  // 2026-08-20 改版（原本是長格式，一題一列，一個個案光 SF-36 就佔 36 列，跑統計要先 pivot）：
  //   · 橫向攤開：一列 ＝ 一個研究編號 × 一個施測次別，題號往右排
  //   · **一份問卷一張分頁**，不合併成一張大表。合併的話欄數會到 76 欄以上，
  //     而且四份問卷的施測次數不一樣，同一列常常只有一份有值、其他三份整片空白——
  //     那些空白是排版產物不是資料，會被誤讀成「沒填」
  //   · 沒作答的題目留空白，欄位保留；沒填過這份問卷的個案也留一列空白，
  //     這樣每張分頁的個案數都跟主表一致，一眼看得出誰還沒填
  const QUESTIONNAIRE_SHEET: Record<string, { sheet: string; order: number }> = {
    "SF-36 健康調查簡表": { sheet: "SF-36 逐題", order: 1 },
    "匹茲堡睡眠品質量表（PSQI）": { sheet: "PSQI 逐題", order: 2 },
    "JSS 疤痕診斷分類表": { sheet: "JSS 逐題", order: 3 },
  };

  const questionOrderNosByTemplate = new Map<string, number[]>();
  for (const q of allQuestions ?? []) {
    const arr = questionOrderNosByTemplate.get(q.questionnaire_id) ?? [];
    if (!arr.includes(q.order_no)) arr.push(q.order_no);
    questionOrderNosByTemplate.set(q.questionnaire_id, arr);
  }

  const questionnaireSheets = (allTemplates ?? [])
    .map((t) => {
      const meta = QUESTIONNAIRE_SHEET[t.name as string];
      return {
        name: t.name as string,
        // 沒登記在上表的自訂問卷也照樣出一張，用問卷名當分頁名（Excel 分頁上限 31 字）
        sheet: meta?.sheet ?? `${String(t.name ?? "問卷").slice(0, 24)} 逐題`,
        order: meta?.order ?? 99,
        orderNos: (questionOrderNosByTemplate.get(t.id) ?? []).slice().sort((a, b) => a - b),
      };
    })
    .filter((t) => t.orderNos.length > 0)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  // 每個個案的每份問卷，依送出時間排出第 1、2、3… 次
  const responsesByCaseTemplate = new Map<string, { id: string; submitted_at: string; via: string }[]>();
  for (const r of [...(responses ?? [])].sort((a, x) =>
    String(a.submitted_at).localeCompare(String(x.submitted_at))
  )) {
    const tmplName = (first(r.questionnaire_templates) as { name?: string } | undefined)?.name ?? "";
    const key = `${r.case_id}__${tmplName}`;
    const arr = responsesByCaseTemplate.get(key) ?? [];
    arr.push({
      id: r.id,
      submitted_at: String(r.submitted_at),
      via: (r as { submitted_via?: string }).submitted_via === "patient" ? "病人自填" : "診間人員",
    });
    responsesByCaseTemplate.set(key, arr);
  }

  const answerCodeByResponse = new Map<string, Map<number, string>>();
  for (const [responseId, rows] of answersByResponse) {
    answerCodeByResponse.set(responseId, new Map(rows.map((row) => [row.order_no, answerRaw(row)])));
  }

  for (const t of questionnaireSheets) {
    const rows: (string | number)[][] = [];
    for (const c of cases) {
      const responseList = responsesByCaseTemplate.get(`${c.id}__${t.name}`) ?? [];
      if (responseList.length === 0) {
        // 沒填過：留一列空白，這張分頁的個案數才跟主表一致
        rows.push([c.research_id, "", "", "", "", ...t.orderNos.map(() => "")]);
        continue;
      }
      // 時間點與「問卷分數」分頁用同一個判定（Baseline／術後 1、6、12 個月／窗期外），
      // 這樣逐題原始碼要跟計分結果對起來時，兩張表的分組是一致的。
      const surgeryForCase = surgeryDateOf(c.id);
      responseList.forEach((resp, i) => {
        const codes = answerCodeByResponse.get(resp.id);
        rows.push([
          c.research_id,
          i + 1,
          timepointLabelFor(surgeryForCase, resp.submitted_at.slice(0, 10)),
          // 帶到分鐘：實測有同一份問卷相隔幾秒送出三次的資料，只到「日」分不開
          resp.submitted_at.replace("T", " ").slice(0, 16),
          resp.via,
          ...t.orderNos.map((n) => codes?.get(n) ?? ""),
        ]);
      });
    }
    addSheet(
      t.sheet,
      ["Subject_ID", "第幾次填寫", "時間點", "填寫時間", "填寫人", ...t.orderNos.map((n) => String(n))],
      rows,
      12
    );
  }

  // ---- 編碼對照表（全部由資料庫產生，後台改選項這裡就跟著變）----
  addSheet(
    "編碼對照表",
    CODEBOOK_HEADERS,
    buildCodebookRows({
      zones: zones,
      options: optionLists ?? [],
      doctors: doctors ?? [],
      icdCodes: icdCodes ?? [],
      sf36Scales: SF36_SCALES,
    }),
    22
  );

  // ---- 同意書時序檢查（決策 2026-08-20 F-C3）----
  // 實務上病人先在平板填完問卷、之後才補簽同意書，所以「問卷填寫時間早於同意書簽署日」
  // 在這裡是常態而非例外。系統不擋、不跳警告，但要讓它有紀錄、可查、可統計。
  const consentTimeline: (string | number)[][] = [];
  for (const c of cases) {
    const caseResponses = (responses ?? []).filter((r) => r.case_id === c.id && r.submitted_at);
    if (caseResponses.length === 0) continue;
    const earliest = caseResponses.map((r) => String(r.submitted_at).slice(0, 10)).sort()[0];
    if (!c.consent_signed_at) {
      consentTimeline.push([c.research_id, earliest, "（未簽署）", caseResponses.length, "同意書日期空白——這些問卷資料在研究上尚不可用"]);
    } else if (earliest < String(c.consent_signed_at).slice(0, 10)) {
      consentTimeline.push([c.research_id, earliest, c.consent_signed_at, caseResponses.length, "最早的問卷填寫日早於同意書簽署日"]);
    }
  }
  addSheet(
    "同意書時序檢查",
    ["Subject_ID", "最早問卷填寫日", "同意書簽署日", "問卷份數", "說明"],
    consentTimeline,
    22
  );

  // ---- 未能對應清單 ----
  addSheet("未能對應清單", ["Subject_ID", "病灶序", "原始部位文字", "系統部位", "暫代代碼", "原因 / 需要的處理"], unmapped, 22);

  // ---- 欄位缺口清單 ----
  const gaps: string[][] = [
    [
      "Basic Info.",
      "VSS score",
      "永遠留空：2026-08-24 起不再收 VSS（助理裁決疤痕評分只留 JSS）",
      "不需要補。欄位保留只是為了與部長 Excel 的欄位順序對齊；疤痕評分看「問卷分數」分頁的 JSS 總分",
    ],
    [
      "Basic Info.",
      "SF-36 / PSQI",
      "只放 Baseline（收案當下）那一份",
      `歷次施測看「問卷分數」分頁（Baseline ＋ 術後 ${FOLLOWUP_TIMEPOINT_MONTHS.join("／")} 個月，窗期 ±${TIMEPOINT_TOLERANCE_DAYS} 天）`,
    ],
    [
      "病灶測量（術前 baseline）",
      "長 / 寬 / 高",
      "只有術前 baseline 一組，術後不再量測（助理 2026-08-24：手術已切除病灶）",
      "不需要補。術後的病灶外觀變化看照片與 JSS 總分",
    ],
    ["Basic Info.", "height / weight / BMI", "已可填寫（個案頁「病人基本資料」）；未填時輸出 9999", "舊資料沒有這兩項，需人員回頭補"],
    ["Basic Info.", "Medical_history_self / Fmaily_history", "已可編碼：勾選常見疾病後自動對到 1-8", "舊資料的自由文字對不到清單的片段會落到「其他」(8)"],
    [
      "Basic Info.",
      `KC_1..${MAX_LESIONS}（發生原因）／KOST_1..${MAX_LESIONS}（藥膏、貼片）`,
      "已填值：記在個案層級，各病灶填同一個值",
      "助理 2026-08-13 回覆：手術多半只做 1-2 處，其他疤痕治療各處大多一致，因此不做病灶層級輸入（pending.md D5）",
    ],
    identified
      ? ["全部主表", "Name / Chart No.", "已帶出（本次匯出有輸入金鑰）", "含可識別資料，請依 IRB 規範保管"]
      : ["全部主表", "Name / Chart No.", "留空", "要帶出病歷號與姓名，請在匯出頁勾選並輸入金鑰"],
  ];
  const gapRows = gaps.map((g) => [...g]);
  for (const n of overflowNotes) gapRows.push(["超出格式上限", "", n, "完整資料在對應的 long-format 附表"]);
  addSheet("欄位缺口清單", ["工作表", "欄位", "目前狀態", "要補齊需要做什麼"], gapRows, 34);

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="keloid-data-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
