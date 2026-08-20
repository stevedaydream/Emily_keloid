import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";
import { computeSF36, computePSQI, SF36_SCALES, computeJSSClassification } from "@/lib/scoring";
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
// 去識別化：Name / Chart No. 兩欄伺服器**永遠留空**，下載後由 /export 頁的
// IdentifiedExport 在瀏覽器端從本機對照表或零知識保管庫補上（決策 #1 的紅線）。

export const dynamic = "force-dynamic";

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
  /** 當次治療（新格式的 KOR_FW / KSI_FW / KOST_FW，只有 FW1、FW2 有這三欄） */
  korCode: number;
  ksiCode: number;
  kostCode: number | "";
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
      .select("id, case_id, site_no, body_site, length_cm, width_cm, height_cm, note, body_part_zone_id")
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
    supabase.from("questionnaire_responses").select("id, case_id, submitted_at, submitted_via, questionnaire_templates(name, category)"),
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

  // 對照組是獨立的表（見下方「對照組」分頁），與 cases 完全不相干，所以單獨撈。
  const [{ data: controlSubjects }, { data: controlLabResults }] = await Promise.all([
    supabase.from("control_subjects").select("*").eq("active", true).order("subject_code"),
    supabase.from("lab_results").select("control_subject_id, marker_id, value, value_text").not("control_subject_id", "is", null),
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

  /** 選項題存的是 value（例如 "3"），逐題附表要顯示人看得懂的 label。 */
  const answerLabel = (row: AnswerRow): string => {
    const toLabel = (v: unknown) => row.options.find((o) => String(o.value) === String(v))?.label ?? String(v ?? "");
    return Array.isArray(row.value) ? row.value.map(toLabel).join("、") : toLabel(row.value);
  };
  const answerRaw = (row: AnswerRow): string =>
    Array.isArray(row.value) ? row.value.map((v) => String(v)).join(", ") : String(row.value ?? "");
  const vssByCase = new Map<string, Record<number, number>>();
  const sf36ByCase = new Map<string, Record<number, unknown>>();
  const psqiByCase = new Map<string, Record<number, unknown>>();
  const jssEntriesByCase = new Map<string, { submitted_at: string; total: number }[]>();
  for (const r of responses ?? []) {
    const q = first(r.questionnaire_templates) as { name?: string; category?: string } | undefined;
    const ans = answersByResponse.get(r.id) ?? [];
    const byOrder: Record<number, unknown> = {};
    for (const a of ans) byOrder[a.order_no] = a.value;
    if (q?.category === "scale") {
      const numOrder: Record<number, number> = {};
      for (const a of ans) numOrder[a.order_no] = Number(a.value);
      vssByCase.set(r.case_id, numOrder);
    } else if (q?.name === "SF-36 健康調查簡表") {
      sf36ByCase.set(r.case_id, byOrder);
    } else if (q?.name === "匹茲堡睡眠品質量表（PSQI）") {
      psqiByCase.set(r.case_id, byOrder);
      // （逐題 raw data 在下方統一累積，不分問卷種類）
    } else if (q?.name === "JSS 疤痕診斷分類表") {
      const total = computeJSSClassification(byOrder)?.total;
      if (total !== undefined) {
        const arr = jssEntriesByCase.get(r.case_id) ?? [];
        arr.push({ submitted_at: r.submitted_at, total });
        jssEntriesByCase.set(r.case_id, arr);
      }
    }
  }
  const jssByCase = new Map<string, { baseline: number; latest: number; delta: number }>();
  for (const [caseId, entries] of jssEntriesByCase) {
    const sorted = [...entries].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    jssByCase.set(caseId, {
      baseline: sorted[0].total,
      latest: sorted[sorted.length - 1].total,
      delta: sorted[0].total - sorted[sorted.length - 1].total,
    });
  }

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
        const oint = rows.find((r) => ["藥膏", "貼片"].includes(typeNameOf(r)));
        return {
          date,
          days: daysBetween(opDate, date),
          monthIndex: opDate ? monthsSince(opDate, date) : null,
          recurrence: rows.some((r) => r.recurrence_observed) ? 1 : 0,
          symptomChangeCode: changeId ? optionById.get(changeId)?.export_code ?? null : null,
          korCode: hasOpOrRt ? 1 : 0,
          ksiCode: inj ? Number(selectCode(inj, "steroid_dose") || 0) : 0,
          kostCode: oint ? selectCode(oint, "product") : "",
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
  // 部長 4 張主表沒有位置、但平台有收的選項類資料（此次就診原因、得知看診資訊）。
  // 主表不能加欄（欄位順序必須與他的檔一致），所以獨立成附表——否則這些資料匯出時會整個消失。
  const optionRows: (string | number)[][] = [];
  // 問卷逐題作答（docx 項次 9：「目前 JSS raw data 是給總分、SF-36 是給 8 項指標，附上 raw data 呈現結果」）。
  // 主表與「問卷分數」附表只有計分結果，這裡逐題列出病人實際點了什麼。
  const answerDetailRows: (string | number)[][] = [];
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
        rid, l.site_no ?? "", z?.export_code ?? "", z?.display_name ?? "", l.body_site,
        L ?? "", W ?? "", H ?? "",
        dims.length ? Math.max(...dims) : "",
        L !== null && W !== null ? Number((L * W).toFixed(2)) : "",
        L !== null && W !== null && H !== null ? Number((L * W * H).toFixed(2)) : "",
        (l.site_no ?? 99) > MAX_LESIONS ? "超出主表上限" : "",
        l.note ?? "",
      ]);
    }

    // ---- Basic Info. 一列 ----
    const primaryIcd = (diagnosesByCase.get(c.id) ?? [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((d) => first(d.icd_codes) as { export_code?: number } | undefined)[0];
    const vss = vssByCase.get(c.id);
    const vssTotal = vss ? Object.values(vss).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : "";
    const sf36 = sf36ByCase.get(c.id) ? computeSF36(sf36ByCase.get(c.id)!).scales : null;
    const psqi = psqiByCase.get(c.id) ? computePSQI(psqiByCase.get(c.id)!) : null;
    const jss = jssByCase.get(c.id);
    const bioMap = new Map((biobankByCase.get(c.id) ?? []).map((b) => [b.item_key, b]));
    const legacyBio = (legacyBioByCase.get(c.id) ?? [])[0] as Record<string, string | number | null> | undefined;
    const anyBiobank = [...bioMap.values()].some((b) => b.collected) || !!legacyBio?.tissue_bank_status;

    wsBasic.addRow([
      rid, "", "", sexCode, c.phone_number ?? "",
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
      vssTotal,
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
      rid, "", "", sexCode, opDate ?? "",
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
        const withTreatment = m <= 2;
        if (!v) {
          // 未回診：時間欄填 0（依工作表說明），其餘留空
          cells.push(0, "", ...(withTreatment ? ["", "", ""] : []), "");
          continue;
        }
        cells.push(v.date, v.days ?? "");
        if (withTreatment) cells.push(v.korCode, v.ksiCode, v.kostCode);
        cells.push(v.recurrence);
      }
      return cells;
    };
    wsY1.addRow([rid, "", "", sexCode, opDate ?? "", y1Symptom, ...fwCells(y1Slots, 1, MAX_FW_YEAR1)]);
    wsY2.addRow([rid, "", "", sexCode, opDate ?? "", ...fwCells(y2Slots, MAX_FW_YEAR1 + 1, MAX_FW_YEAR2)]);

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

    // ---- 問卷分數附表 ----
    if (vss || sf36 || psqi || jss) {
      scoreRows.push([
        rid,
        vssTotal, vss?.[1] ?? "", vss?.[2] ?? "", vss?.[3] ?? "", vss?.[4] ?? "",
        ...SF36_SCALES.map((s) => sf36?.find((r) => r.key === s.key)?.score ?? ""),
        ...(psqi ? psqi.components.map((x) => x.score ?? "") : Array(7).fill("")),
        psqi?.global ?? "",
        psqi?.global === null || psqi === null ? "" : psqi.poorSleep ? "睡眠品質不佳" : "睡眠品質尚可",
        jss?.baseline ?? "", jss?.latest ?? "", jss?.delta ?? "",
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

  addSheet("病灶測量", [
    "Subject_ID", "病灶序", "部位碼", "部位名稱", "原始部位文字",
    "長cm", "寬cm", "高cm", "最大徑cm", "面積cm²", "體積cm³", "備註", "登記備註",
  ], lesionMeasureRows);

  addSheet("追蹤逐筆", ["Subject_ID", "第幾次回診", "回診日期", "距手術日天數", "第幾個月", "復發(0/1)", "症狀變化碼", "歸屬"], visitRows);

  addSheet("收案選項紀錄", ["Subject_ID", "類別", "代碼", "選項"], optionRows, 26);

  addSheet("問卷分數", [
    "Subject_ID", "VSS總分", "VSS-血管分布", "VSS-色素沉澱", "VSS-柔軟度", "VSS-高度",
    ...SF36_SCALES.map((s) => `SF36-${s.label}`),
    "PSQI-主觀睡眠品質", "PSQI-睡眠潛伏期", "PSQI-睡眠時數", "PSQI-睡眠效率", "PSQI-睡眠困擾",
    "PSQI-安眠藥物使用", "PSQI-日間功能障礙", "PSQI總分", "PSQI判定",
    "JSS-初次總分", "JSS-最近總分", "JSS-Delta Score",
  ], scoreRows);

  // Lab 逐筆（沿用既有做法：同一個案多標記×多次採檢，wide table 攤不平）
  const labMarkerById = new Map((labMarkers ?? []).map((m) => [m.id, m]));
  const researchIdById = new Map(cases.map((c) => [c.id, c.research_id as string]));
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

  // ---- 對照組（健康受試者）----
  // 獨立一張分頁（決策 2026-08-20 F-F3）：他們不在 cases 裡，也不該進 Basic Info.——
  // 一個人一次抽血，其餘兩百多欄對他們永遠是空的。Lab 數值與實驗組共用同一張表，
  // 所以下面把該受試者的生物標記一併攤平在同一列後面，跑組間比較不用再合併兩個來源。
  const controlMarkers = labMarkers ?? [];
  const controlLabBySubject = new Map<string, Map<string, string | number>>();
  for (const r of controlLabResults ?? []) {
    if (!r.control_subject_id) continue;
    const row = controlLabBySubject.get(r.control_subject_id) ?? new Map();
    row.set(r.marker_id, r.value ?? r.value_text ?? "");
    controlLabBySubject.set(r.control_subject_id, row);
  }
  const controlRows = (controlSubjects ?? [])
    .filter((cs) => includeUnconsented || Boolean(cs.consent_signed_at))
    .map((cs) => {
      const markers = controlLabBySubject.get(cs.id);
      return [
        cs.subject_code ?? "",
        cs.sex === "male" ? 1 : cs.sex === "female" ? 2 : "",
        cs.age_at_enrollment ?? "",
        cs.consent_signed_at ?? "",
        cs.blood_draw_date ?? "",
        cs.notes ?? "",
        ...controlMarkers.map((m) => markers?.get(m.id) ?? ""),
      ];
    });
  addSheet(
    "對照組",
    ["Subject_ID", "gender", "Age", "同意書簽署日", "抽血日期", "備註", ...controlMarkers.map((m) => m.display_name)],
    controlRows,
    18
  );

  // ---- 問卷逐題作答（docx 項次 9）----
  // 「目前 JSS raw data 是給總分、SF-36 是給各項 8 項指標的各項總分，附上 raw data 呈現結果」
  // ＝ 主表與「問卷分數」附表只有計分結果，這裡逐題列出病人實際點了哪個選項。
  // 一列＝一個案的一份問卷的一題。同時給「作答代碼」（原始值，供統計）與「作答文字」（選項 label，供人看）。
  // 「第幾次填寫」：同一個案的同一份問卷可能填過很多次（重複施測，或像實測資料那樣相隔幾秒送了三次）。
  // 只給時間戳分不開（到分鐘還是一樣），給序號才能在分析時把不同次的作答分開比較。
  const seqCounter = new Map<string, number>();
  const responseSeq = new Map<string, number>();
  for (const r of [...(responses ?? [])].sort((a, x) => String(a.submitted_at).localeCompare(String(x.submitted_at)))) {
    const tmplName = (first(r.questionnaire_templates) as { name?: string } | undefined)?.name ?? "";
    const key = `${r.case_id}__${tmplName}`;
    const n = (seqCounter.get(key) ?? 0) + 1;
    seqCounter.set(key, n);
    responseSeq.set(r.id, n);
  }

  for (const r of responses ?? []) {
    const rid = researchIdById.get(r.case_id);
    if (!rid) continue; // 被篩選條件排除的個案不出現
    const tmpl = first(r.questionnaire_templates) as { name?: string } | undefined;
    const rows = [...(answersByResponse.get(r.id) ?? [])].sort((a, x) => a.order_no - x.order_no);
    for (const row of rows) {
      answerDetailRows.push([
        rid,
        tmpl?.name ?? "",
        responseSeq.get(r.id) ?? 1,
        // 只到「日」會分不出同一天送出的多筆回覆（實測有同一份問卷相隔幾秒送出三次的資料），
        // 所以帶到分鐘——分析時才能把不同次的作答分開。
        String(r.submitted_at).replace("T", " ").slice(0, 16),
        (r as { submitted_via?: string }).submitted_via === "patient" ? "病人自填" : "診間人員",
        row.order_no,
        row.text,
        answerRaw(row),
        answerLabel(row),
      ]);
    }
  }
  answerDetailRows.sort(
    (a, x) =>
      String(a[0]).localeCompare(String(x[0])) ||
      String(a[1]).localeCompare(String(x[1])) ||
      Number(a[2]) - Number(x[2]) ||
      Number(a[5]) - Number(x[5])
  );
  addSheet(
    "問卷逐題作答",
    ["Subject_ID", "問卷", "第幾次填寫", "填寫時間", "填寫人", "題號", "題目", "作答代碼", "作答文字"],
    answerDetailRows,
    18
  );

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
    ["Basic Info.", "height / weight / BMI", "已可填寫（個案頁「病人基本資料」）；未填時輸出 9999", "舊資料沒有這兩項，需人員回頭補"],
    ["Basic Info.", "Medical_history_self / Fmaily_history", "已可編碼：勾選常見疾病後自動對到 1-8", "舊資料的自由文字對不到清單的片段會落到「其他」(8)"],
    ["Basic Info.", "KC_1..5（發生原因）", "系統只有個案層級的發生原因，拆不到每個病灶", "待助理確認舊病歷能否拆到病灶層級（pending.md D5）"],
    ["Basic Info.", "KOST_1..5（藥膏/貼片）", "系統尚無藥膏/貼片的 1-12 清單", "新增可維護清單並在治療紀錄可複選"],
    ["全部主表", "Name / Chart No.", "去識別化：伺服器永遠留空", "於 /export 頁用「含姓名的匯出」按鈕在瀏覽器端回填"],
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
