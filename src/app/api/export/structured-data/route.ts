import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase";
import { DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import { computeSF36, computePSQI, SF36_SCALES, computeJSSClassification, computeJSSEvaluation } from "@/lib/scoring";

// 匯出格式比照院內既有的「raw data」寬表（見 c:\...\20230912_keloid病人治療table(1)-2.xlsm），
// 一人一列，欄位順序與命名沿用舊表，2026 平台新增的結構化欄位接在最後一組（決策 2026-07-27）。

const first = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return Math.round(d);
}

export async function GET() {
  const supabase = supabaseServer();

  const [
    { data: cases },
    { data: diagnoses },
    { data: termRecords },
    { data: treatmentRecords },
    { data: radiotherapySessions },
    { data: scheduleItems },
    { data: biobankItems },
    { data: biobankSamplesLegacy },
    { data: photos },
    { data: responses },
    { data: answers },
    { data: intakeRecords },
  ] = await Promise.all([
    supabase.from("cases").select("*, doctors(name), body_part_zones(display_name, dose_category)"),
    supabase.from("case_diagnoses").select("case_id, is_primary, icd_codes(code, description_full)"),
    supabase
      .from("case_term_records")
      .select("case_id, stage, case_term_record_items(term_library(term))"),
    supabase.from("treatment_records").select("*, treatment_types(name)"),
    supabase.from("radiotherapy_sessions").select("*"),
    supabase.from("case_schedule_items").select("*").order("due_date"),
    supabase.from("biobank_checklist_items").select("*"),
    supabase.from("biobank_samples").select("*"),
    supabase.from("photos").select("case_id"),
    supabase.from("questionnaire_responses").select("id, case_id, submitted_at, questionnaire_templates(name, category)"),
    supabase.from("questionnaire_answers").select("response_id, answer_value, questionnaire_questions(order_no)"),
    supabase
      .from("case_intake_option_records")
      .select("case_id, category, case_intake_option_record_items(case_intake_option_lists(label))"),
  ]);

  const byCase = (rows: unknown[] | null): Map<string, any[]> => {
    const m = new Map<string, any[]>();
    for (const r of (rows ?? []) as any[]) {
      const arr = m.get(r.case_id) ?? [];
      arr.push(r);
      m.set(r.case_id, arr);
    }
    return m;
  };

  const diagnosesByCase = byCase(diagnoses as any);
  const termsByCase = byCase(termRecords as any);
  const treatmentsByCase = byCase(treatmentRecords as any);
  const rtByCase = byCase(radiotherapySessions as any);
  const scheduleByCase = byCase(scheduleItems as any);
  const biobankByCase = byCase(biobankItems as any);
  const legacyBiobankByCase = byCase(biobankSamplesLegacy as any);
  const photoCountByCase = new Map<string, number>();
  for (const p of photos ?? []) photoCountByCase.set(p.case_id, (photoCountByCase.get(p.case_id) ?? 0) + 1);

  const intakeByCase = byCase(intakeRecords as any);
  const intakeLabelsFor = (caseId: string, category: string) =>
    (intakeByCase.get(caseId) ?? [])
      .filter((r: any) => r.category === category)
      .flatMap((r: any) =>
        (r.case_intake_option_record_items ?? []).map((it: any) => first(it.case_intake_option_lists)?.label)
      )
      .filter(Boolean)
      .join("、");

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
  const jssClassByCase = new Map<string, Record<number, unknown>>();
  const jssEvalEntriesByCase = new Map<string, { submitted_at: string; total: number }[]>();
  for (const r of responses ?? []) {
    const q = first(r.questionnaire_templates) as { name?: string; category?: string } | undefined;
    const ans = answersByResponse.get(r.id) ?? [];
    const byOrder: Record<number, unknown> = {};
    for (const a of ans) byOrder[a.order_no] = a.value;
    // 同一個案若有多筆同份問卷回覆，取查詢順序中最後一筆覆蓋（與既有 VSS 邏輯一致）
    if (q?.category === "scale") {
      const numOrder: Record<number, number> = {};
      for (const a of ans) numOrder[a.order_no] = Number(a.value);
      vssByCase.set(r.case_id, numOrder);
    } else if (q?.name === "SF-36 健康調查簡表") {
      sf36ByCase.set(r.case_id, byOrder);
    } else if (q?.name === "匹茲堡睡眠品質量表（PSQI）") {
      psqiByCase.set(r.case_id, byOrder);
    } else if (q?.name === "JSS 疤痕診斷分類表") {
      jssClassByCase.set(r.case_id, byOrder);
    } else if (q?.name === "JSS 症狀與治療追蹤評估表") {
      const total = computeJSSEvaluation(byOrder);
      if (total !== null) {
        const arr = jssEvalEntriesByCase.get(r.case_id) ?? [];
        arr.push({ submitted_at: r.submitted_at, total });
        jssEvalEntriesByCase.set(r.case_id, arr);
      }
    }
  }
  const jssEvalByCase = new Map<string, { baseline: number; latest: number; delta: number }>();
  for (const [caseId, entries] of jssEvalEntriesByCase) {
    const sorted = [...entries].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    const baseline = sorted[0].total;
    const latest = sorted[sorted.length - 1].total;
    jssEvalByCase.set(caseId, { baseline, latest, delta: baseline - latest });
  }

  const maxFollowUps = Math.min(30, Math.max(5, ...[...scheduleByCase.values()].map((v) => v.length), 0));

  const BIOBANK_LABELS: Record<string, string> = {
    tissue_paraffin_block: "生資-蠟塊",
    tissue_keloid_fibroblast_culture: "生資-Keloid培養",
    tissue_periskin_fibroblast_culture: "生資-Periskin培養",
    blood_pre_op: "生資-血液術前",
    blood_post_op_day1: "生資-血液術後第一天",
  };
  const BIOBANK_KEYS = Object.keys(BIOBANK_LABELS);

  const BASIC_HEADERS = [
    "編號", "蠟塊編號", "病歷號", "受試者", "性別", "年齡", "手機", "主治醫師", "部位",
    "受試者同意書", "組織庫", "Primary culture", "細胞凍管位置", "追蹤照片", "JSW score", "Family",
    "keloid history", "keloid 大小",
  ];
  const OP_HEADERS = ["開刀日", "Operation 1", "Operation 2", "部位1", "部位2", "部位3", "部位4"];
  const RT_HEADERS = [
    "Radiation date", "DIGNOSIS", "Total Dose(cGy)", "Fractions", "bolus", "electron beam",
    "執行部位2", "Treatment Response", "Acute Reactions",
  ];
  const OUTCOME_HEADERS = ["RT VS", "是否復發", "復發日期", "治療後復發天數", "統計截止日", "距離治療後超過1年"];
  const FOLLOWUP_HEADERS = ["追蹤時間", "頻率(days)", "紀錄"];
  const NEW_HEADERS = [
    "部位分類", "ICD診斷", "術前術語", "術中術語", "術後術語",
    "VSS總分", "VSS-血管分布", "VSS-色素沉澱", "VSS-柔軟度", "VSS-高度",
    ...BIOBANK_KEYS.map((k) => BIOBANK_LABELS[k] + "(狀態)"),
    ...BIOBANK_KEYS.map((k) => BIOBANK_LABELS[k] + "(日期)"),
    "生資-細胞量", "生資-儲存盤數",
    "放療進度", "LINE綁定", "資料來源",
    "蟹足腫初次發生時間", "疾病史", "之前治療醫師", "之前類固醇注射史", "之前中醫治療史", "之前小川令貼布史", "之前放射線治療史",
    "發生原因", "得知看診資訊", "飲食衛教紀錄", "運動禁忌衛教紀錄",
    "全部治療方式彙總", "復發觀察次數", "復發情形彙總", "抽血次數（含非常規）", "非常規抽血備註彙總",
    ...SF36_SCALES.map((s) => `SF36-${s.label}`),
    "PSQI-主觀睡眠品質", "PSQI-睡眠潛伏期", "PSQI-睡眠時數", "PSQI-睡眠效率", "PSQI-睡眠困擾", "PSQI-安眠藥物使用", "PSQI-日間功能障礙", "PSQI總分", "PSQI睡眠品質判定",
    "JSS分類總分", "JSS評估-初次總分", "JSS評估-最近總分", "JSS評估-Delta Score",
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("raw data");

  // 群組標題列（比照舊表第一列的合併儲存格分組）
  const groupRow: (string | null)[] = [];
  const pushGroup = (label: string, span: number) => {
    groupRow.push(label);
    for (let i = 1; i < span; i++) groupRow.push(null);
  };
  pushGroup("基本資料", BASIC_HEADERS.length);
  pushGroup("OP", OP_HEADERS.length);
  pushGroup("RT", RT_HEADERS.length);
  pushGroup("治療後追蹤", OUTCOME_HEADERS.length);
  for (let i = 0; i < maxFollowUps; i++) pushGroup(String(i + 1), FOLLOWUP_HEADERS.length);
  pushGroup("備註", 1);
  pushGroup("2026平台新增欄位", NEW_HEADERS.length);
  ws.addRow(groupRow);

  const headerRow = [
    ...BASIC_HEADERS,
    ...OP_HEADERS,
    ...RT_HEADERS,
    ...OUTCOME_HEADERS,
    ...Array(maxFollowUps).fill(FOLLOWUP_HEADERS).flat(),
    "備註",
    ...NEW_HEADERS,
  ];
  ws.addRow(headerRow);

  // 合併群組標題儲存格
  let col = 1;
  const merges = [
    BASIC_HEADERS.length, OP_HEADERS.length, RT_HEADERS.length, OUTCOME_HEADERS.length,
    ...Array(maxFollowUps).fill(FOLLOWUP_HEADERS.length), 1, NEW_HEADERS.length,
  ];
  for (const span of merges) {
    if (span > 1) ws.mergeCells(1, col, 1, col + span - 1);
    col += span;
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 2 }];

  for (const c of cases ?? []) {
    const doctor = first(c.doctors) as { name?: string } | undefined;
    const zone = first(c.body_part_zones) as { display_name?: string; dose_category?: string } | undefined;

    const surgeries = (treatmentsByCase.get(c.id) ?? []).filter(
      (t: any) => first(t.treatment_types)?.name === "手術切除"
    );
    const surgeryDate = surgeries.map((t: any) => t.treatment_date).sort()[0] ?? null;
    const surgery = surgeries[0];

    const rtRecords = (treatmentsByCase.get(c.id) ?? []).filter(
      (t: any) => first(t.treatment_types)?.name === "放射治療"
    );
    const rtRecord = rtRecords[0];

    const sessions = (rtByCase.get(c.id) ?? []).sort((a: any, b: any) => a.fraction_no - b.fraction_no);
    const rtDate = sessions[0]?.due_date ?? rtRecord?.treatment_date ?? null;
    const totalDoseCgy = sessions.length
      ? sessions.reduce((s: number, x: any) => s + (x.actual_dose_cgy ?? x.planned_dose_cgy ?? 0), 0)
      : rtRecord?.field_values?.total_dose_cgy ?? null;
    const fractions = sessions.length ? sessions[0].total_fractions : rtRecord?.field_values?.fractions ?? null;
    const doneSessions = sessions.filter((s: any) => s.status === "done").length;

    const diagList = (diagnosesByCase.get(c.id) ?? [])
      .map((d: any) => {
        const icd = first(d.icd_codes) as { code?: string; description_full?: string } | undefined;
        return icd ? `${icd.code} ${icd.description_full}` : null;
      })
      .filter(Boolean)
      .join("; ");

    const termsByStage: Record<string, string[]> = { pre: [], intra: [], post: [] };
    for (const r of termsByCase.get(c.id) ?? []) {
      const terms = ((r as any).case_term_record_items ?? [])
        .map((it: any) => first(it.term_library)?.term)
        .filter(Boolean);
      termsByStage[(r as any).stage]?.push(...terms);
    }

    const followUps = (scheduleByCase.get(c.id) ?? []).slice(0, maxFollowUps);
    const followUpCells: (string | number | null)[] = [];
    for (let i = 0; i < maxFollowUps; i++) {
      const item: any = followUps[i];
      if (!item) {
        followUpCells.push(null, null, null);
      } else {
        followUpCells.push(item.due_date, daysBetween(surgeryDate, item.due_date), item.note ?? "");
      }
    }

    const biobankNew = biobankByCase.get(c.id) ?? [];
    const biobankMap = new Map(biobankNew.map((b: any) => [b.item_key, b]));
    const vss = vssByCase.get(c.id);
    const vssTotal = vss ? Object.values(vss).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : null;

    const legacyBio = first(legacyBiobankByCase.get(c.id) as any[]) as any;

    const allTreatments = treatmentsByCase.get(c.id) ?? [];
    const treatmentMethodsSummary = [...new Set(allTreatments.map((t: any) => first(t.treatment_types)?.name).filter(Boolean))].join("、");
    const recurrenceRecords = allTreatments.filter((t: any) => t.recurrence_observed);
    const bloodDrawnRecords = allTreatments.filter((t: any) => t.blood_drawn);

    const sf36Answers = sf36ByCase.get(c.id);
    const sf36Scales = sf36Answers ? computeSF36(sf36Answers).scales : null;
    const psqiAnswers = psqiByCase.get(c.id);
    const psqi = psqiAnswers ? computePSQI(psqiAnswers) : null;
    const jssClassAnswers = jssClassByCase.get(c.id);
    const jssClass = jssClassAnswers ? computeJSSClassification(jssClassAnswers) : null;
    const jssEval = jssEvalByCase.get(c.id);

    const row = [
      // 基本資料
      c.research_id,
      legacyBio?.paraffin_block_no ?? "",
      "", // 病歷號：不存
      "", // 受試者：不存
      c.sex ?? "",
      c.age_at_enrollment ?? "",
      c.phone_number ?? "",
      doctor?.name ?? "",
      c.body_site ?? "",
      c.consent_signed_at ?? "",
      legacyBio?.tissue_bank_status ?? (biobankMap.get("tissue_paraffin_block") ? "Y" : ""),
      legacyBio?.primary_culture ?? "",
      legacyBio?.cryotube_location ?? "",
      photoCountByCase.get(c.id) ? "Y" : "",
      c.jsw_score ?? "",
      c.family_history ?? "",
      c.keloid_history ?? "",
      c.keloid_size ?? "",
      // OP
      surgeryDate ?? "",
      surgery?.field_values?.method ?? "",
      surgery?.field_values?.adjuvant ?? "",
      zone?.display_name ?? c.body_site ?? "",
      "", "", "",
      // RT
      rtDate ?? "",
      diagList.split("; ")[0] ?? "",
      totalDoseCgy ?? "",
      fractions ?? "",
      rtRecord?.field_values?.bolus ?? "",
      rtRecord?.field_values?.electron_beam ?? "",
      "",
      rtRecord?.field_values?.treatment_response ?? "",
      rtRecord?.field_values?.acute_reactions ?? "",
      // 治療後追蹤
      "",
      c.recurrence_status ?? "",
      c.recurrence_date ?? "",
      c.days_to_recurrence ?? "",
      c.followup_cutoff_date ?? "",
      c.over_one_year_flag === true ? "Y" : c.over_one_year_flag === false ? "N" : "",
      // 追蹤時程（repeating）
      ...followUpCells,
      // 備註
      c.notes ?? "",
      // 2026 新增欄位
      zone?.dose_category ? DOSE_CATEGORY_LABEL[zone.dose_category] : "",
      diagList,
      termsByStage.pre.join("、"),
      termsByStage.intra.join("、"),
      termsByStage.post.join("、"),
      vssTotal ?? "",
      vss?.[1] ?? "",
      vss?.[2] ?? "",
      vss?.[3] ?? "",
      vss?.[4] ?? "",
      ...BIOBANK_KEYS.map((k) => (biobankMap.get(k)?.collected ? "已收" : "待收")),
      ...BIOBANK_KEYS.map((k) => biobankMap.get(k)?.collected_date ?? ""),
      legacyBio?.cell_quantity ?? "",
      legacyBio?.storage_plate_count ?? "",
      sessions.length ? `${doneSessions}/${sessions.length}` : "",
      c.line_bound ? "Y" : "N",
      c.data_source === "legacy_import" ? "舊資料回溯建檔" : "正常收案",
      c.keloid_onset_date ?? "",
      c.disease_history ?? "",
      c.prior_treatment_physician ?? "",
      c.prior_steroid_treatment ?? "",
      c.prior_tcm_treatment ?? "",
      c.prior_ogawa_patch ?? "",
      c.prior_radiation_treatment ?? "",
      intakeLabelsFor(c.id, "onset_cause"),
      intakeLabelsFor(c.id, "referral_source"),
      intakeLabelsFor(c.id, "diet_education"),
      intakeLabelsFor(c.id, "exercise_restriction"),
      treatmentMethodsSummary,
      recurrenceRecords.length,
      recurrenceRecords.map((t: any) => t.recurrence_description).filter(Boolean).join("; "),
      bloodDrawnRecords.length,
      bloodDrawnRecords.map((t: any) => t.blood_drawn_note).filter(Boolean).join("; "),
      ...SF36_SCALES.map((s) => sf36Scales?.find((r) => r.key === s.key)?.score ?? ""),
      ...(psqi ? psqi.components.map((c) => c.score ?? "") : Array(7).fill("")),
      psqi?.global ?? "",
      psqi?.global === null || psqi === null ? "" : psqi.poorSleep ? "睡眠品質不佳" : "睡眠品質尚可",
      jssClass?.total ?? "",
      jssEval?.baseline ?? "",
      jssEval?.latest ?? "",
      jssEval?.delta ?? "",
    ];

    ws.addRow(row);
  }

  ws.columns.forEach((column) => {
    column.width = 14;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="keloid-data-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
