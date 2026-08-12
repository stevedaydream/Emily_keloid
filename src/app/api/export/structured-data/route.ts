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
  MAX_FW_PER_YEAR,
  YEAR1_DAYS,
  YEAR2_DAYS,
  BASIC_INFO_SHEET,
  OPERATION_SHEET,
  YEAR1_SHEET,
  YEAR2_SHEET,
  type SheetDef,
  buildCodebookRows,
  CODEBOOK_HEADERS,
  daysBetween,
  monthsBetween,
  sizeText,
  jswNumber,
} from "@/lib/exportCodebook";

// 匯出格式＝部長 2026-08 版 Excel 編碼簿（docs/Keloid Operation treat.xlsx）。
//
// 主體是與他那份「欄位順序、欄位數量完全一致」的 4 張表，儲存格**只放數字碼**，可直接貼進統計軟體：
//   Basic Info.(56) / Operation(26) / Year 1 follow-up(42) / Year 2 follow-up(41)
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
};

/** cases 一列（只列出匯出實際用到的欄位；select("*") 仍會帶回全部） */
type CaseRow = {
  id: string;
  research_id: string;
  created_at: string;
  enrollment_year: number | null;
  doctor_id: string | null;
  data_source: string | null;
  sex: string | null;
  phone_number: string | null;
  age_at_enrollment: number | null;
  keloid_onset_date: string | null;
  jsw_score: string | null;
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

/** 一次回診（同一天的多筆治療紀錄合併成一次） */
type Visit = { date: string; days: number | null; recurrence: number; symptomChangeCode: number | null };

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
    supabase.from("radiotherapy_sessions").select("case_id, lesion_id, dose_category, fraction_no, status, due_date, planned_dose_cgy, actual_dose_cgy"),
    supabase.from("photos").select("case_id"),
    supabase.from("questionnaire_responses").select("id, case_id, submitted_at, questionnaire_templates(name, category)"),
    supabase.from("questionnaire_answers").select("response_id, answer_value, questionnaire_questions(order_no)"),
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
  const answersByResponse = new Map<string, { order_no: number; value: unknown }[]>();
  for (const a of answers ?? []) {
    const q = first(a.questionnaire_questions) as { order_no?: number } | undefined;
    const arr = answersByResponse.get(a.response_id) ?? [];
    arr.push({ order_no: q?.order_no ?? 0, value: a.answer_value });
    answersByResponse.set(a.response_id, arr);
  }
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

  // ---- 排序（預設＝收案建檔順序，即部長說的「收案點選先後順序」）----
  if (sort === "research_id") {
    cases.sort((a, b) => String(a.research_id).localeCompare(String(b.research_id)));
  } else if (sort === "surgery") {
    cases.sort((a, b) => String(surgeryDateOf(a.id) ?? "9999").localeCompare(String(surgeryDateOf(b.id) ?? "9999")));
  } else {
    cases.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  // ---- 回診（追蹤）：同一天多筆治療紀錄合併成一次回診 ----
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
      // 手術當天是基準點（已在 Operation date 欄），不算成第 1 次回診，
      // 否則每個個案的 FW1 都會是「手術日、第 0 天」，把真正的第一次追蹤擠到 FW2。
      .filter(([date]) => !opDate || date > opDate)
      .map(([date, rows]) => {
        const changeId = rows.map((r) => r.symptom_change_option_id).find(Boolean) ?? null;
        return {
          date,
          days: daysBetween(opDate, date),
          recurrence: rows.some((r) => r.recurrence_observed) ? 1 : 0,
          symptomChangeCode: changeId ? optionById.get(changeId)?.export_code ?? null : null,
        };
      });
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
  const overflowNotes: string[] = [];

  // ============ 逐個案填資料 ============
  for (const c of cases) {
    const rid = c.research_id as string;
    const sexCode = c.sex ? SEX_CODE[c.sex] ?? "" : "";
    const doctor = first(c.doctors) as { export_code?: number } | undefined;
    const allLesions = (lesionsByCase.get(c.id) ?? []).sort((a, b) => (a.site_no ?? 99) - (b.site_no ?? 99));
    const opDate = surgeryDateOf(c.id);

    // ---- 病灶區塊（主表前 5 個，全部進「病灶測量」附表）----
    const lesionCells: (string | number)[] = [];
    for (let i = 0; i < MAX_LESIONS; i++) {
      const l = allLesions[i];
      if (!l) {
        lesionCells.push("", "", "", "", "", "");
        continue;
      }
      lesionCells.push(
        zoneCodeOfLesion(l),
        sizeText(l),
        "", // KC：發生原因目前只有個案層級，拆不到病灶（見「欄位缺口清單」）
        korOfLesion(c.id, l.id),
        steroidCodeOfLesion(c.id, l.id),
        "" // KOST：藥膏/貼片清單尚未建置（見「欄位缺口清單」）
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
    const symptomCodes = (intakeByCase.get(c.id) ?? [])
      .filter((r) => r.category === "keloid_symptom")
      .flatMap((r) => (r.case_intake_option_record_items ?? []).map((it) => optionById.get(it.option_id)?.export_code))
      .filter((v): v is number => typeof v === "number");
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
      "", // birthday：系統尚無此欄位
      c.age_at_enrollment ?? "",
      NO_RECORD, NO_RECORD, NO_RECORD, // height / weight / BMI：系統尚無此欄位，用部長定義的「無紀錄」哨兵
      doctor?.export_code ?? "",
      primaryIcd?.export_code ?? "",
      "", // Medical_history_self：目前是自由文字，無法可靠編碼
      "", // Fmaily_history：同上
      NO_RECORD, // Keloid_family_history：自由文字推不出有/無，用部長定義的「不清楚」
      monthsBetween(c.keloid_onset_date, String(c.created_at).slice(0, 10)) ?? "",
      ...lesionCells,
      vssTotal,
      jswNumber(c.jsw_score),
      sf36 ? SF36_SCALES.map((s) => sf36.find((r) => r.key === s.key)?.score ?? "").join("/") : "",
      psqi?.global ?? "",
      photoCount.get(c.id) ? 1 : 0,
      symptomCodes.length ? [...new Set(symptomCodes)].sort((a, b) => a - b).join(", ") : "",
      anyBiobank ? 1 : 0,
      legacyBio?.primary_culture ?? (bioMap.get("tissue_keloid_fibroblast_culture")?.collected ? "Y" : ""),
      legacyBio?.paraffin_block_no ?? "",
      legacyBio?.cryotube_location ?? "",
    ]);

    // ---- Operation 一列 ----
    const surgeries = surgeriesOf(c.id);
    const opCells: (string | number)[] = [];
    for (let i = 0; i < MAX_OP_SITES; i++) {
      const s = surgeries[i];
      const l = s?.lesion_id ? allLesions.find((x) => x.id === s.lesion_id) : undefined;
      opCells.push(l ? zoneCodeOfLesion(l) : "", ""); // 術式編碼：系統尚無此欄位
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
      rtDate, "", // RT_Doctor：系統尚無放射科醫師清單
      sessions.length || rtRecord?.field_values?.fractions || "",
      rtRecord?.field_values?.bolus ?? "",
      rtRecord?.field_values?.electron_beam ?? "",
      ...rtCells,
      rtRecord?.field_values?.treatment_response ?? "",
      rtRecord?.field_values?.acute_reactions ?? "",
    ]);

    // ---- Year 1 / Year 2 ----
    const visits = visitsOf(c.id);
    const y1 = visits.filter((v) => v.days === null || v.days <= YEAR1_DAYS);
    const y2 = visits.filter((v) => v.days !== null && v.days > YEAR1_DAYS && v.days <= YEAR2_DAYS);
    const beyond = visits.filter((v) => v.days !== null && v.days > YEAR2_DAYS);
    if (y1.length > MAX_FW_PER_YEAR || y2.length > MAX_FW_PER_YEAR || beyond.length) {
      overflowNotes.push(
        `${rid}：第一年 ${y1.length} 次／第二年 ${y2.length} 次／兩年後 ${beyond.length} 次回診，超出每年 ${MAX_FW_PER_YEAR} 格的部分見「追蹤逐筆」附表`
      );
    }
    // FW_k_symptom：術後一年內最後一筆有填的症狀變化
    const y1Symptom = [...y1].reverse().find((v) => v.symptomChangeCode !== null)?.symptomChangeCode ?? "";

    const fwCells = (list: Visit[]) => {
      const cells: (string | number)[] = [];
      for (let i = 0; i < MAX_FW_PER_YEAR; i++) {
        const v = list[i];
        cells.push(v?.date ?? "", v?.days ?? "", v ? v.recurrence : "");
      }
      return cells;
    };
    wsY1.addRow([rid, "", "", sexCode, opDate ?? "", y1Symptom, ...fwCells(y1)]);
    wsY2.addRow([rid, "", "", sexCode, opDate ?? "", ...fwCells(y2)]);

    for (const [idx, v] of visits.entries()) {
      visitRows.push([
        rid, idx + 1, v.date, v.days ?? "", v.recurrence, v.symptomChangeCode ?? "",
        v.days === null || v.days <= YEAR1_DAYS ? "第一年" : v.days <= YEAR2_DAYS ? "第二年" : "兩年後",
      ]);
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

  addSheet("追蹤逐筆", ["Subject_ID", "第幾次回診", "回診日期", "距手術日天數", "復發(0/1)", "症狀變化碼", "歸屬"], visitRows);

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

  // ---- 未能對應清單 ----
  addSheet("未能對應清單", ["Subject_ID", "病灶序", "原始部位文字", "系統部位", "暫代代碼", "原因 / 需要的處理"], unmapped, 22);

  // ---- 欄位缺口清單 ----
  const gaps: string[][] = [
    ["Basic Info.", "birthday", "系統尚無此欄位", "cases 需新增出生日期欄位與收案表單輸入"],
    ["Basic Info.", "height / weight / BMI", "系統尚無此欄位（目前輸出 9999＝無紀錄）", "cases 需新增身高/體重欄位，BMI 可自動計算"],
    ["Basic Info.", "Medical_history_self", "目前是自由文字（disease_history），無法可靠編碼", "改為 1-8 勾選存檔（比照發生原因的可維護清單）"],
    ["Basic Info.", "Fmaily_history", "目前是自由文字（family_history），無法可靠編碼", "同上"],
    ["Basic Info.", "Keloid_family_history", "自由文字推不出有/無（目前輸出 9999＝不清楚）", "隨上一項一併改為勾選後即可自動推出"],
    ["Basic Info.", "KC_1..5（發生原因）", "系統只有個案層級的發生原因，拆不到每個病灶", "待助理確認舊病歷能否拆到病灶層級（pending.md D5）"],
    ["Basic Info.", "KOST_1..5（藥膏/貼片）", "系統尚無藥膏/貼片的 1-12 清單", "新增可維護清單並在治療紀錄可複選"],
    ["Operation", "surgical procedure_1..4（術式）", "系統尚無術式 1-4 編碼欄位", "手術切除的 field_schema 加 select（比照本次類固醇劑量做法）"],
    ["Operation", "RT_Doctor", "系統只有整形外科醫師清單，沒有放射科", "另建放射科醫師可維護清單（pending.md D9）"],
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
