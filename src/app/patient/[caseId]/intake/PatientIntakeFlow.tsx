"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BigChoice, BigMultiChoice, type BigChoiceOption } from "@/components/senior/BigChoice";
import { TimeWheel, HoursWheel, YearWheel, HeightWheel, WeightWheel } from "@/components/senior/WheelPicker";
import BigNumpad from "@/components/senior/BigNumpad";
import BigDateField from "@/components/senior/BigDateField";
import Spinner from "@/components/ui/Spinner";
import LineBindPrompt from "./LineBindPrompt";
import {
  PATIENT_INTAKE_SEGMENTS,
  paginateQuestions,
  type PageableQuestion,
  type PatientIntakeSegmentKey,
} from "@/lib/patientIntake";
import {
  savePatientBasicAction,
  savePatientHistoryAction,
  savePatientIntakeOptionsAction,
  savePatientQuestionnaireAction,
} from "./actions";

type Option = { id: string; label: string };
type Questionnaire = { id: string; name: string; questions: PageableQuestion[] };
type Prior = "yes" | "no" | "unknown";

const YES_NO_UNKNOWN: BigChoiceOption[] = [
  { value: "no", label: "沒有做過" },
  { value: "yes", label: "有做過" },
  { value: "unknown", label: "不記得／不知道" },
];

// 「都沒有」「不知道」在複選題裡是互斥的特殊選項：選了就清掉其他勾選。
const NONE = "__none__";
const UNKNOWN = "__unknown__";

/** 以前治療的醫師不在本院清單裡時的選項。存進 cases.prior_treatment_physician 的就是這串文字。 */
const OTHER_CLINIC = "其他醫院／診所";

/** 目前不適症狀裡與其他選項互斥的那一個（docx 2026-08-12 明訂，個案頁與後端也都擋）。 */
const NO_SYMPTOM_LABEL = "無明顯不適";

/** 勾了「無明顯不適」就清掉其他症狀，反之亦然。跟 toggleExclusive 同一套邏輯，只是互斥的是某個選項 id。 */
function toggleNoSymptom(next: string[], prev: string[], noSymptomId: string | undefined): string[] {
  if (!noSymptomId) return next;
  const added = next.find((v) => !prev.includes(v));
  if (added === noSymptomId) return [noSymptomId];
  return next.filter((v) => v !== noSymptomId);
}

// PSQI 前四題不是選項題。這裡指定各自的元件，並且**寫回跟原本一模一樣的字串格式**
// （HH:MM／分鐘數／小時數），src/lib/scoring.ts 的 computePSQI 完全不用改。
const PSQI_SLEEP_LATENCY: BigChoiceOption[] = [
  { value: "10", label: "15 分鐘以內" },
  { value: "25", label: "16 到 30 分鐘" },
  { value: "45", label: "31 到 60 分鐘" },
  { value: "90", label: "超過 60 分鐘" },
];
/**
 * 5j 說明、11e 說明是自由文字補充、且不列入 PSQI 計分，病人版直接略過
 * （5j 的 0-3 頻率題在 order_no 15，那題有計分，要留著）。
 */
const PSQI_SKIP_ORDERS = [14, 25];
/** 第10題（睡伴／室友）答「沒有睡伴或室友」時，第11題（睡伴觀察到的情形）整組跳過。 */
const PSQI_BED_PARTNER_ORDER = 20;
const PSQI_PARTNER_ONLY_ORDERS = [21, 22, 23, 24, 25];

/** 出生日期的下界。上界是「今天」，但今天要等掛載後才算得出來（見 birthDateMax）。 */
const BIRTH_DATE_MIN = "1900-01-01";

type Screen = {
  segment: PatientIntakeSegmentKey;
  title: string;
  hint?: string;
  body: React.ReactNode;
  /** 單選類的畫面選完自動前進，長輩不用再找「下一步」 */
  autoAdvance?: boolean;
  /**
   * 這一頁上的題目 id（只有 SF-36／PSQI 的畫面有）。用途有二：
   *   ① 硬鎖：這些題目全部答了才放行（2026-08-26 助理要求「有點選才能跳下一步」）
   *   ② 逐頁存檔：翻頁就存一次草稿，卡住時損失上限是一頁
   */
  questionIds?: string[];
};

/**
 * 兩份自評量表要「攔一下」的段落。
 *
 * 2026-08-26 一度做成硬鎖（沒選就按不動、沒有退路）。**2026-08-28 助理與診間討論後改為軟鎖**：
 * 沒選還是能過，但要多按一次確認。理由是硬鎖在門診一定會撞到不肯答的病人，
 * 而那時唯一的出口是右上角那顆小按鈕，等於讓人員在病人面前手忙腳亂。
 *
 * 軟鎖擋得住的是「一路按下一步滑過去」，擋不住存心跳的人——這是刻意的取捨。
 * 跳過的題目會進待補清單（一份問卷一筆，標題帶未答題數），人員事後看得到。
 */
const LOCKED_SEGMENTS: PatientIntakeSegmentKey[] = ["sf36", "psqi"];

/** 建檔時診間已填過的欄位，用來當作病人流程的初始值 */
export type IntakePrefill = {
  sex: string;
  /** ISO `YYYY-MM-DD`。2026-08-20 起收精確出生日期，不再只收年份 */
  birthDate: string;
  height: string;
  weight: string;
  phone: string;
  onsetYear: string;
  // ── 以下是「這位已經答過的」（2026-08-25）。填完之後回頭檢視時要原樣帶回畫面：
  //    空白畫面往前走一次，每跨一段就把空的答案存回去，等於把上次的資料洗掉。
  familyOptionIds: string[];
  /** family_history 存的是「無」＝當初勾了「以上都沒有」，跟「跳過沒答」不同 */
  familyNone: boolean;
  familyUnknown: boolean;
  visitReasonIds: string[];
  visitReasonUnknown: boolean;
  onsetCauseIds: string[];
  onsetCauseUnknown: boolean;
  referralIds: string[];
  referralUnknown: boolean;
  symptomIds: string[];
  priorTreated: Prior | "";
  priorDoctor: string;
  priors: Record<string, Prior>;
  /** 兩份量表的最新一筆回覆：逐題答案帶回畫面，responseId 供重存時取代（不要多長一筆 Baseline） */
  sf36: { responseId: string | null; answers: Record<string, string | string[]> };
  psqi: { responseId: string | null; answers: Record<string, string | string[]> };
};

/** 某一段還沒答的項目（來源是存檔當下寫進去的待補清單） */
export type PendingItem = { segment: PatientIntakeSegmentKey; label: string; reason: string };

export default function PatientIntakeFlow({
  caseId,
  researchId,
  completedSegments,
  prefill,
  pendingBySegment,
  birthDateMax,
  familyDiseaseOptions,
  visitReasonOptions,
  onsetCauseOptions,
  referralOptions,
  symptomOptions,
  priorDoctorOptions,
  hasLesions,
  sf36,
  psqi,
}: {
  caseId: string;
  researchId: string;
  completedSegments: string[];
  prefill: IntakePrefill;
  /** 每一段還有哪幾題沒答。回頭檢視的入口畫面要標出來，人員才知道要補哪裡 */
  pendingBySegment: PendingItem[];
  /** 台北時區的今天（`YYYY-MM-DD`），出生日期的上界。由伺服器算好傳進來——
      伺服器跑 UTC、平板是 UTC+8，各自算會差一天而讓 hydration 對不起來。 */
  birthDateMax: string;
  familyDiseaseOptions: Option[];
  visitReasonOptions: Option[];
  onsetCauseOptions: Option[];
  referralOptions: Option[];
  /** 目前不適症狀（keloid_symptom）。「無明顯不適」與其他選項互斥，後端也會再擋一次。 */
  symptomOptions: Option[];
  /** 以前治療過的話，是哪位醫師。本院醫師清單，另外補「其他醫院／診所」「不記得」。 */
  priorDoctorOptions: Option[];
  /** 這位已經登記過病灶部位了嗎——完成畫面要據此提醒人員別讓病人就這樣走掉 */
  hasLesions: boolean;
  sf36: Questionnaire | null;
  psqi: Questionnaire | null;
}) {
  // ── 各段的作答狀態 ────────────────────────────────────────────
  // 初始值＝建檔時診間已填的資料（2026-08-12）。病人看到的是已經選好/填好的畫面，
  // 確認無誤直接按下一步即可；要改也照樣能改，送出時以病人這次的答案為準。
  const [sex, setSex] = useState(prefill.sex);
  const [birthDate, setBirthDate] = useState(prefill.birthDate);
  const [height, setHeight] = useState(prefill.height);
  const [weight, setWeight] = useState(prefill.weight);
  const [phone, setPhone] = useState(prefill.phone);

  // 複選題的初始值：已勾的選項；當初答「以上都沒有」／「我不知道」時要還原成那顆哨兵鍵，
  // 否則畫面會顯示成「什麼都沒選」，往前走一次就把有效答案洗成跳過。
  const seedMulti = (ids: string[], none: boolean, unknown: boolean) =>
    ids.length > 0 ? ids : none ? [NONE] : unknown ? [UNKNOWN] : [];

  const [family, setFamily] = useState<string[]>(
    seedMulti(prefill.familyOptionIds, prefill.familyNone, prefill.familyUnknown)
  );
  const [visitReason, setVisitReason] = useState<string[]>(
    seedMulti(prefill.visitReasonIds, false, prefill.visitReasonUnknown)
  );
  const [onsetYear, setOnsetYear] = useState(prefill.onsetYear);
  const [priors, setPriors] = useState<Record<string, Prior>>(prefill.priors);

  const [onsetCause, setOnsetCause] = useState<string[]>(
    seedMulti(prefill.onsetCauseIds, false, prefill.onsetCauseUnknown)
  );
  const [referral, setReferral] = useState<string[]>(seedMulti(prefill.referralIds, false, prefill.referralUnknown));
  const [symptoms, setSymptoms] = useState<string[]>(prefill.symptomIds);

  // 治療史的總開關（2026-08-20）。答「沒有治療過」就不再逐題問類固醇／中醫／貼布／放射線，
  // 那四題由伺服器一律帶「無」；答「不記得」則一律帶「不知道」。
  const [priorTreated, setPriorTreated] = useState<Prior | "">(prefill.priorTreated);
  const [priorDoctor, setPriorDoctor] = useState(prefill.priorDoctor);

  // 兩份量表的答案共用同一個 map（key 是題目 id，不會撞）
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({
    ...prefill.sf36.answers,
    ...prefill.psqi.answers,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  // 軟鎖的確認框（2026-08-28）：值＝這一頁還沒選的題數；null＝沒有在問
  const [skipAsk, setSkipAsk] = useState<number | null>(null);
  // 本次填寫已經建立的資料列 id。病人按「上一步」回頭改答案、再往前走一次時，
  // 會再次跨越同一個段落邊界並重存——記住上次建的 id，重存時取代掉，
  // 否則同一次收案會留下兩份同一份問卷的回覆／兩筆互相矛盾的選項紀錄。
  const [savedIds, setSavedIds] = useState<{
    history: string | null;
    intakeOptions: (string | null)[];
    sf36: string | null;
    psqi: string | null;
  }>({
    history: null,
    intakeOptions: [],
    // 量表用既有那筆當起點：回頭重填時取代它，而不是多長一筆同時間點的回覆。
    // 選單類刻意不帶（留 null）——那幾類是 append-only 的歷史，重存一筆是正常的，
    // 帶進來反而會把上次那筆（可能是人員在個案頁補的）刪掉。
    sf36: prefill.sf36.responseId,
    psqi: prefill.psqi.responseId,
  });

  const setAnswer = (qid: string, value: string | string[]) => setAnswers((a) => ({ ...a, [qid]: value }));

  /**
   * 這一頁的題目全都作答了嗎（2026-08-26 硬鎖用）。
   *
   * 沒有 questionIds 的畫面（前三段）一律回 true——那三段維持可跳過。
   * PSQI 前四題不是選項題，但 WheelPicker 本來就記得住「有沒有被滑過」：沒滑過時 value 是空字串，
   * 滑過才會寫回 `HH:MM`／分鐘數／時數，所以這裡的空值判定對輪盤題同樣成立。
   */
  function unansweredCount(s: Screen): number {
    if (!s.questionIds || !LOCKED_SEGMENTS.includes(s.segment)) return 0;
    return s.questionIds.filter((qid) => {
      const v = answers[qid];
      if (Array.isArray(v)) return v.length === 0;
      return typeof v !== "string" || v.trim() === "";
    }).length;
  }

  // 複選題的互斥處理：選「都沒有」或「不知道」就把其他清掉，反之亦然。
  function toggleExclusive(next: string[], prev: string[]): string[] {
    const added = next.find((v) => !prev.includes(v));
    if (added === NONE || added === UNKNOWN) return [added];
    return next.filter((v) => v !== NONE && v !== UNKNOWN);
  }

  // 「無明顯不適」與其他症狀互斥。這裡先擋一次是為了畫面即時反應，
  // 真正的把關在 saveIntakeOptionRecordAction（server action 可以被直接 POST）。
  const noSymptomId = symptomOptions.find((o) => o.label === NO_SYMPTOM_LABEL)?.id;

  const multiOptions = (opts: Option[], extras: BigChoiceOption[]): BigChoiceOption[] => [
    ...opts.map((o) => ({ value: o.id, label: o.label })),
    ...extras,
  ];

  /**
   * 這次流程實際會問到的題目（2026-08-24）。畫面切頁與「漏答幾題」的判定要吃同一份清單——
   * 各算各的遲早會把刻意不問的題（PSQI 的 5j／11e 文字說明、沒有睡伴時的第 11 題）
   * 算成病人漏答，那筆待補就永遠消不掉。
   */
  const usableQuestions = useMemo(() => {
    const pick = (segment: "sf36" | "psqi", q: Questionnaire | null): PageableQuestion[] => {
      if (!q) return [];
      const noBedPartner =
        segment === "psqi" &&
        String(answers[q.questions.find((x) => x.order_no === PSQI_BED_PARTNER_ORDER)?.id ?? ""] ?? "") === "0";
      return q.questions.filter((x) => {
        if (segment !== "psqi") return true;
        if (PSQI_SKIP_ORDERS.includes(x.order_no)) return false;
        if (noBedPartner && PSQI_PARTNER_ONLY_ORDERS.includes(x.order_no)) return false;
        return true;
      });
    };
    return { sf36: pick("sf36", sf36), psqi: pick("psqi", psqi) };
  }, [sf36, psqi, answers]);

  // ── 把整個流程攤平成一連串畫面 ──────────────────────────────
  const screens = useMemo<Screen[]>(() => {
    const list: Screen[] = [];

    // 有帶入值的畫面加一句提示，讓病人知道那是診間先填的、可以直接確認或修改。
    // （沒帶入值的畫面不要出現這句，否則空白畫面配「已由診間填寫」會很奇怪。）
    const prefilledHint = (filled: boolean, base?: string) =>
      filled ? ["已由診間填寫，確認無誤請按「下一步」；不對可以直接改", base].filter(Boolean).join("。") : base;

    list.push({
      segment: "basic",
      title: "您的性別是？",
      hint: prefilledHint(!!prefill.sex),
      autoAdvance: !prefill.sex,
      body: (
        <BigChoice
          value={sex}
          onChange={setSex}
          options={[
            { value: "F", label: "女" },
            { value: "M", label: "男" },
            { value: "other", label: "其他" },
          ]}
        />
      ),
    });
    list.push({
      segment: "basic",
      title: "您的出生日期？",
      hint: prefilledHint(!!prefill.birthDate, "點一下欄位，從日曆選出生年月日"),
      body: <BigDateField value={birthDate} onChange={setBirthDate} min={BIRTH_DATE_MIN} max={birthDateMax} />,
    });
    // 身高體重（2026-08-20，pending.md E3 選 (A)）：匯出檔 Basic Info 的 height/weight/BMI
    // 三欄原本沒有任何來源，一律是缺值哨兵。改由病人自報——診間量最準但多一道工，
    // 而這兩格病人自己答得出來，符合病人版「只放病人自己知道的事」的範圍原則。
    list.push({
      segment: "basic",
      title: "您的身高大約幾公分？",
      hint: prefilledHint(!!prefill.height, "上下滑動選擇。不確定可以直接按「下一步」跳過"),
      body: <HeightWheel value={height} onChange={setHeight} />,
    });
    list.push({
      segment: "basic",
      title: "您的體重大約幾公斤？",
      hint: prefilledHint(!!prefill.weight, "上下滑動選擇。不確定可以直接按「下一步」跳過"),
      body: <WeightWheel value={weight} onChange={setWeight} />,
    });
    list.push({
      segment: "basic",
      title: "您的手機號碼？",
      hint: prefilledHint(!!prefill.phone, "用於回診提醒。沒有手機可以直接按「下一步」跳過"),
      body: <BigNumpad value={phone} onChange={setPhone} />,
    });

    list.push({
      segment: "history",
      title: "您的家人有沒有下列疾病？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={family}
          onChange={(v) => setFamily(toggleExclusive(v, family))}
          options={multiOptions(familyDiseaseOptions, [
            { value: NONE, label: "以上都沒有" },
            { value: UNKNOWN, label: "我不知道" },
          ])}
        />
      ),
    });
    list.push({
      segment: "history",
      // docx 項次 2（2026-08-12）：原本問「您的蟹足腫是怎麼來的？」（keloid_history_type），
      // 整組換成此題。發生原因（onset_cause，部長 Excel 的 KC 碼來源）是另一題，不受影響。
      title: "您此次至本院就診的主要原因為何？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={visitReason}
          onChange={(v) => setVisitReason(toggleExclusive(v, visitReason))}
          options={multiOptions(visitReasonOptions, [{ value: UNKNOWN, label: "我不知道" }])}
        />
      ),
    });
    list.push({
      segment: "history",
      title: "第一次發現蟹足腫是哪一年？",
      hint: "不記得的話直接按「下一步」，我們會請護理師再跟您確認",
      body: <YearWheel value={onsetYear} onChange={setOnsetYear} />,
    });
    // 治療史的總開關（2026-08-20 使用者要求）。原本一上來就逐題問類固醇／中醫／貼布／放射線，
    // 對「從來沒治療過」的病人是四題無效問答。先問有沒有治療過：
    //   有   → 接著問是哪位醫師，再逐題問四個細項
    //   沒有 → 四題整組跳過，伺服器一律帶「無」
    //   不記得 → 同樣跳過，伺服器一律帶「不知道」（跟「無」是不同的資料，不能混）
    list.push({
      segment: "history",
      title: "以前有沒有為蟹足腫接受過治療？",
      hint: "包含打針、擦藥、貼布、電療、中醫等任何處理",
      autoAdvance: true,
      body: (
        <BigChoice
          value={priorTreated}
          onChange={(v) => setPriorTreated(v as Prior)}
          options={[
            { value: "no", label: "沒有治療過" },
            { value: "yes", label: "有治療過" },
            { value: "unknown", label: "不記得" },
          ]}
        />
      ),
    });

    if (priorTreated === "yes") {
      list.push({
        segment: "history",
        title: "是哪一位醫師幫您治療的？",
        hint: "想不起來也沒關係，選「不記得」我們再查",
        autoAdvance: true,
        body: (
          <BigChoice
            value={priorDoctor}
            onChange={setPriorDoctor}
            options={[
              ...priorDoctorOptions.map((d) => ({ value: d.label, label: d.label })),
              { value: OTHER_CLINIC, label: OTHER_CLINIC },
              { value: "", label: "不記得" },
            ]}
          />
        ),
      });

      for (const [key, label] of [
        ["prior_steroid_treatment", "以前有沒有打過類固醇針？"],
        ["prior_tcm_treatment", "以前有沒有看過中醫治療？"],
        ["prior_ogawa_patch", "以前有沒有貼過疤痕貼布？"],
        ["prior_radiation_treatment", "以前有沒有做過放射線（電療）？"],
      ] as const) {
        list.push({
          segment: "history",
          title: label,
          autoAdvance: true,
          body: (
            <BigChoice
              value={priors[key] ?? ""}
              onChange={(v) => setPriors((p) => ({ ...p, [key]: v as Prior }))}
              options={YES_NO_UNKNOWN}
            />
          ),
        });
      }
    }

    list.push({
      segment: "intake_options",
      // 2026-08-26：原本問「您覺得……是什麼原因造成的？」是在問病人的歸因（他自己怎麼想），
      // 但這一題的選項（外傷／燒傷／手術切口／疫苗接種／耳洞穿刺／痤瘡／自發）描述的是
      // 病灶出現時的「情境」，而且它就是部長 Excel 的 KC 碼來源。改成問情境，
      // 選項、export_code 與個案頁的「發生原因」欄位一律不動。
      title: "您的蟹足腫最初是在哪一種情況下出現的？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={onsetCause}
          onChange={(v) => setOnsetCause(toggleExclusive(v, onsetCause))}
          options={multiOptions(onsetCauseOptions, [{ value: UNKNOWN, label: "我不知道" }])}
        />
      ),
    });
    // 目前不適症狀（2026-08-20）：搔癢／疼痛／灼熱／緊繃／影響睡眠這些是純主觀症狀，
    // 只有病人答得準。原本只在個案頁由人員代填，等於讓人員替病人猜。
    list.push({
      segment: "intake_options",
      title: "蟹足腫目前讓您有哪些不舒服？",
      hint: "可以複選。都不會不舒服就選「無明顯不適」",
      body: (
        <BigMultiChoice
          values={symptoms}
          onChange={(v) => setSymptoms(toggleNoSymptom(v, symptoms, noSymptomId))}
          options={symptomOptions.map((o) => ({ value: o.id, label: o.label }))}
        />
      ),
    });
    list.push({
      segment: "intake_options",
      title: "您是怎麼知道要來看這個門診的？",
      hint: "可以複選",
      body: (
        <BigMultiChoice
          values={referral}
          onChange={(v) => setReferral(toggleExclusive(v, referral))}
          options={multiOptions(referralOptions, [{ value: UNKNOWN, label: "想不起來" }])}
        />
      ),
    });

    // 問卷：依「選項數 × 題數」自動切頁，每頁按鈕不超過 10
    for (const [segment, q] of [
      ["sf36", sf36],
      ["psqi", psqi],
    ] as const) {
      if (!q) continue;
      for (const page of paginateQuestions(usableQuestions[segment])) {
        list.push({
          segment,
          title: page.length === 1 ? page[0].question_text : q.name,
          hint: page.length === 1 ? undefined : "請依序回答下列問題",
          questionIds: page.map((question) => question.id),
          body: (
            <div className="space-y-6">
              {page.map((question) => (
                <div key={question.id}>
                  {page.length > 1 && (
                    <p className="mb-2.5 text-lg font-medium leading-snug text-ink">{question.question_text}</p>
                  )}
                  {renderQuestion(segment, question, answers[question.id], (v) => setAnswer(question.id, v))}
                </div>
              ))}
            </div>
          ),
          autoAdvance: page.length === 1 && page[0].question_type === "single",
        });
      }
    }

    return list;
  }, [
    sex, birthDate, height, weight, phone, family, visitReason, onsetYear, priors,
    priorTreated, priorDoctor, onsetCause, referral, symptoms, noSymptomId, answers,
    prefill.sex, prefill.birthDate, prefill.height, prefill.weight, prefill.phone, birthDateMax,
    familyDiseaseOptions, visitReasonOptions, onsetCauseOptions, referralOptions,
    symptomOptions, priorDoctorOptions, sf36, psqi, usableQuestions,
  ]);

  // 續填：從第一個「還沒完成的段落」的第一個畫面開始
  const firstUnfinished = useMemo(() => {
    const idx = screens.findIndex((s) => !completedSegments.includes(s.segment));
    return idx < 0 ? screens.length : idx;
  }, [screens, completedSegments]);

  const [index, setIndex] = useState<number | null>(null); // null = 還在歡迎畫面
  const allDone = completedSegments.length >= PATIENT_INTAKE_SEGMENTS.length;

  // screens 的長度會隨作答改變：第10題答「沒有睡伴或室友」時，第11題那四小題整組消失，
  // 總題數當場從 51 掉到 49。autoAdvance 的 setTimeout 抓的是「點下去那一刻」的 screens，
  // 220ms 後執行時那份已經過期，於是 setIndex 會指到一個不存在的畫面而整頁崩掉。
  // goNext 一律改讀這個 ref 上最新的一份。
  const screensRef = useRef(screens);
  useEffect(() => {
    screensRef.current = screens;
  }, [screens]);

  /**
   * @param completed 走到這一段的最後一頁了嗎。只有兩份量表在意這個旗標：
   *   false ＝ 翻頁順手存的草稿（不寫 completed_at、不標段落完成、不動待補清單）
   *   true  ＝ 這一段跑完了
   * 前三段只會在跨段時被呼叫一次，傳進來的一律是 true。
   */
  async function saveSegment(segment: PatientIntakeSegmentKey, completed: boolean) {
    if (segment === "basic") {
      await savePatientBasicAction(caseId, {
        sex,
        birthDate: birthDate || null,
        height: height || null,
        weight: weight || null,
        phone,
      });
    } else if (segment === "history") {
      const { recordId } = await savePatientHistoryAction(caseId, {
        familyHistory: familyDiseaseOptions.filter((o) => family.includes(o.id)).map((o) => o.label),
        familyHistoryUnknown: family.includes(UNKNOWN),
        familyHistoryNone: family.includes(NONE),
        visitReasonOptionIds: visitReason.filter((v) => v !== NONE && v !== UNKNOWN),
        visitReasonUnknown: visitReason.includes(UNKNOWN),
        onsetYear: onsetYear || null,
        priorTreated,
        priorTreatmentPhysician: priorTreated === "yes" ? priorDoctor || null : null,
        priors,
        replaceRecordId: savedIds.history,
      });
      setSavedIds((s) => ({ ...s, history: recordId }));
    } else if (segment === "intake_options") {
      const { recordIds } = await savePatientIntakeOptionsAction(caseId, {
        onsetCauseIds: onsetCause.filter((v) => v !== NONE && v !== UNKNOWN),
        referralIds: referral.filter((v) => v !== NONE && v !== UNKNOWN),
        symptomIds: symptoms,
        onsetCauseUnknown: onsetCause.includes(UNKNOWN),
        referralUnknown: referral.includes(UNKNOWN),
        replaceRecordIds: savedIds.intakeOptions,
      });
      setSavedIds((s) => ({ ...s, intakeOptions: recordIds }));
    } else if (segment === "sf36" && sf36) {
      const { responseId } = await savePatientQuestionnaireAction(caseId, "sf36", {
        questionnaireId: sf36.id,
        answers,
        presentedQuestionIds: usableQuestions.sf36.map((q) => q.id),
        replaceResponseId: savedIds.sf36,
        completed,
      });
      setSavedIds((s) => ({ ...s, sf36: responseId }));
    } else if (segment === "psqi" && psqi) {
      const { responseId } = await savePatientQuestionnaireAction(caseId, "psqi", {
        questionnaireId: psqi.id,
        answers,
        presentedQuestionIds: usableQuestions.psqi.map((q) => q.id),
        replaceResponseId: savedIds.psqi,
        completed,
      });
      setSavedIds((s) => ({ ...s, psqi: responseId }));
    }
  }

  /**
   * @param skipConfirmed 使用者已經在確認框按過「確定跳過」。
   *   軟鎖（2026-08-28）：量表這一頁還有題目沒選時不直接放行，先跳一次確認；
   *   確認過才會帶著 true 再呼叫一次走完流程。
   */
  async function goNext(from: number, skipConfirmed = false) {
    const list = screensRef.current;
    const current = list[from];
    if (!current) return;
    const next = list[from + 1];
    // 軟鎖：量表這一頁還沒答完就先問一次「確定跳過？」。
    // autoAdvance 的計時器也會走到這裡，但那條路徑必定是「剛選完一個單選題」，不會中。
    const missing = unansweredCountRef.current(current);
    if (missing > 0 && !skipConfirmed) {
      setSkipAsk(missing);
      return;
    }
    setSkipAsk(null);

    const crossing = !next || next.segment !== current.segment;
    // 跨段（或走完最後一段）時把這一段存起來——被打斷也只會丟掉當下這一段。
    // 兩份量表另外**每翻一頁就存一次草稿**：門診很容易被打斷，
    // 逐頁存讓「人員把平板收回去」時的損失上限降到一頁，而不是整整一段。
    if (crossing || LOCKED_SEGMENTS.includes(current.segment)) {
      setSaving(true);
      setError(null);
      try {
        // ⚠️ 一定要走 ref 取最新的一份（2026-08-25）。autoAdvance 是
        // `setTimeout(() => goNext(pos), 220)`，那個箭頭函式抓的是**點下去那一刻**的閉包，
        // 裡面的 saveSegment 讀到的作答狀態還是點擊前的舊值。
        // 病灶：第 9 題「以前有沒有為蟹足腫接受過治療？」答「沒有治療過」或「不記得」時，
        // 那一題就是 history 段的最後一畫面（答「有」才會長出四個細項），於是點下去
        // 220ms 後直接跨段存檔——存進去的 priorTreated 是空字串，四個欄位不寫、
        // 還各留一筆「未填」。答「有治療過」反而不會中，因為後面還有四題、存檔被延後。
        // 同樣的洞也吃得到任何一段最後一題是單選題的情況（SF-36／PSQI 的最後一頁）。
        await saveSegmentRef.current(current.segment, crossing);
      } catch (e) {
        setError(e instanceof Error ? e.message : "儲存失敗，請告訴診間人員");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    if (!next) setFinished(true);
    else setIndex(from + 1);
  }

  // saveSegment 每次 render 都是新的一份（它讀的是那一輪的作答狀態）。
  // 存進 ref，讓 autoAdvance 的計時器在 220ms 後拿到的是最新那一份，而不是點擊當下那份。
  // 沒有 dep array＝每次 render 後都更新。
  const saveSegmentRef = useRef(saveSegment);
  useEffect(() => {
    saveSegmentRef.current = saveSegment;
  });

  // unansweredCount 讀的也是那一輪的 answers，同樣要走 ref——
  // autoAdvance 的 220ms 計時器執行時，閉包裡那份 answers 還是點下去之前的，
  // 會把「剛剛才選好的那一題」判成沒答，然後跳出一個莫名其妙的「確定跳過？」。
  const unansweredCountRef = useRef(unansweredCount);
  useEffect(() => {
    unansweredCountRef.current = unansweredCount;
  });

  // ── 歡迎 / 完成畫面 ──────────────────────────────────────────
  //
  // ⚠️ 這裡原本是 `finished || (index === null && allDone)`：五段都填完之後，
  // 這條路徑就再也回不去題目了——個案頁與收案動線的「重新填寫」按鈕指到這個網址，
  // 點下去只會看到「已經填完了」，沒有任何入口。2026-08-25 使用者回報。
  // 現在只有「這一輪剛走到底」（finished）才是完成畫面；已填完的個案回到入口畫面，
  // 由那裡提供逐段檢視與從頭重看兩條路。
  if (finished) {
    return (
      <Shell caseId={caseId}>
        <div className="text-center">
          <p className="text-6xl">✓</p>
          <h1 className="mt-4 text-3xl font-semibold text-ink">已經填完了</h1>
          <p className="mt-3 text-xl leading-relaxed text-ink/70">
            謝謝您的配合。
            <br />
            請把平板交還給診間人員。
          </p>
          {/* 綁 LINE 放在這裡而不是流程中間：病人手機就在手上、人也還在，
              回家後才想加好友通常就不會做了。不強制，跳過也能完成填寫。 */}
          <div className="mx-auto mt-2 max-w-md text-left">
            <LineBindPrompt caseId={caseId} />
          </div>

          {/* 交還平板之後的下一步（決策 2026-08-20）。這裡是整個門診裡唯一還來得及量病灶的時機——
              病人一走，長寬高就再也補不回來（照片裡的尺沒有被程式讀出來過，見決策 #3）。
              放在 QR code 之後：病人先掃完碼，人員才接手。
              ⚠️ 這顆按鈕會直接進到完整系統，跟 StaffExit「出口不要太顯眼」的取捨相反——
              使用者要求要有明顯的轉跳鈕，取捨記在 project.md。 */}
          <div className="mx-auto mt-8 max-w-md text-left">
            {!hasLesions && (
              <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg text-amber-900">
                ⚠️ 這位還沒量測病灶尺寸，<b>請不要讓病人先離開</b>。
              </p>
            )}
            <Link
              href={`/cases/${caseId}/clinic-flow`}
              className="mt-3 flex min-h-16 items-center justify-center rounded-2xl bg-brand-700 px-6 text-xl font-medium text-white"
            >
              診間人員：接續量測病灶 →
            </Link>
            <p className="mt-2 text-center text-sm text-ink/35">接著量長寬高、拍照，最後由醫師填 JSS 分類表。</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (index === null) {
    const resuming = completedSegments.length > 0;
    // 該段的第一個畫面在第幾格——按段落跳進去用（找不到就從頭）
    const segmentStart = (key: PatientIntakeSegmentKey) => Math.max(0, screens.findIndex((s) => s.segment === key));
    return (
      <Shell caseId={caseId}>
        <div>
          <h1 className="text-3xl font-semibold leading-snug text-ink">
            {allDone ? "已經全部填完" : resuming ? "接著填寫" : "請您填寫幾個問題"}
          </h1>
          {allDone ? (
            <p className="mt-4 text-xl leading-relaxed text-ink/70">
              要修改或補答的話，點下面任何一段就從那一段的第一題開始，
              <br />
              先前答過的都會帶在畫面上。
            </p>
          ) : (
            <p className="mt-4 text-xl leading-relaxed text-ink/70">
              這些問題只有您自己知道答案，會幫助醫師了解您的狀況。
              <br />
              一頁一個問題，選好會自動跳下一頁。
              <br />
              不確定的可以跳過，護理師之後會再問您。
            </p>
          )}
          <ol className="mt-6 space-y-2">
            {PATIENT_INTAKE_SEGMENTS.map((s) => {
              const done = completedSegments.includes(s.key);
              const pending = pendingBySegment.filter((p) => p.segment === s.key);
              const row = (
                <>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${
                      done ? "bg-emerald-500 text-white" : "border-2 border-brand-200 text-ink/40"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* 填完的段落原本畫刪除線，但現在點得進去重看，刪除線會讓人以為不能動了 */}
                    <span className={done && !allDone ? "text-ink/40 line-through" : ""}>{s.label}</span>
                    {pending.length > 0 && (
                      <span className="mt-0.5 block text-base text-amber-700">
                        {pending.length} 項未填：{pending.map((p) => p.label).join("、")}
                      </span>
                    )}
                  </span>
                  {allDone && <span className="shrink-0 text-base text-brand-700">重看 →</span>}
                </>
              );
              // 全部填完之後每一段都點得進去；還在填的時候維持單純的進度清單，
              // 免得病人在流程中途自己跳段而漏掉題目。
              return allDone ? (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => setIndex(segmentStart(s.key))}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-brand-100 px-3 py-3 text-left text-lg text-ink/80 hover:border-brand-300"
                  >
                    {row}
                  </button>
                </li>
              ) : (
                <li key={s.key} className="flex items-center gap-3 px-3 text-lg text-ink/80">
                  {row}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => setIndex(firstUnfinished >= screens.length ? 0 : firstUnfinished)}
            className="mt-8 min-h-16 w-full rounded-xl bg-brand-700 px-6 text-2xl font-medium text-white hover:bg-brand-800"
          >
            {allDone ? "從第一題重新檢視" : resuming ? "繼續" : "開始"}
          </button>
          {allDone && (
            // 完成畫面有綁 LINE 的 QR code 與「接續量測病灶」，不重看題目時直接過去
            <button
              type="button"
              onClick={() => setFinished(true)}
              className="mt-3 min-h-14 w-full rounded-xl border-2 border-brand-200 px-6 text-lg text-ink/70"
            >
              不用改，到完成畫面（綁 LINE／接續量測）
            </button>
          )}
        </div>
      </Shell>
    );
  }

  // 保險：index 落在範圍外時夾回最後一頁，而不是讓 screens[index] 是 undefined 把整頁炸掉。
  // 病人手上的平板沒有任何錯誤畫面可退，崩一次就得整份重填。
  const pos = Math.min(index, screens.length - 1);
  const screen = screens[pos];
  const segmentMeta = PATIENT_INTAKE_SEGMENTS.find((s) => s.key === screen.segment);
  // 量表這一頁還有幾題沒選（軟鎖用）。按下一步時會先跳一次確認，不是擋死。
  const missing = unansweredCount(screen);

  return (
    <Shell caseId={caseId}>
      <div className="flex min-h-[100dvh] flex-col">
        {/* pr-24：右上角固定著「診間人員」出口，進度文字要讓開 */}
        <div className="pt-2 pr-24">
          <div className="flex items-baseline justify-between text-base text-ink/50">
            <span>{segmentMeta?.label}</span>
            <span className="tabular-nums">
              第 {pos + 1} / {screens.length} 題
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${((pos + 1) / screens.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex-1 pt-8">
          <h1 className="text-2xl font-semibold leading-snug text-ink">{screen.title}</h1>
          {screen.hint && <p className="mt-2 text-lg leading-relaxed text-ink/60">{screen.hint}</p>}
          <div
            className="mt-6"
            // 單選畫面：選完短暫停頓讓病人看到打勾，再自動翻頁
            onClickCapture={() => {
              if (!screen.autoAdvance) return;
              setTimeout(() => goNext(pos), 220);
            }}
          >
            {screen.body}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-lg text-red-700">{error}</p>
        )}

        {/* 還沒選時先提醒一句。按鈕仍然按得下去（軟鎖），按了才跳確認。 */}
        {missing > 0 && skipAsk === null && (
          <p className="mt-4 text-center text-lg text-ink/50">
            {(screen.questionIds?.length ?? 0) > 1 ? `上面還有 ${missing} 題沒選` : "還沒選答案"}
          </p>
        )}

        {/* 軟鎖的確認（2026-08-28 助理與診間討論後定案）。
            用整塊面板而不是原生 confirm()：平板上原生對話框的按鈕又小又容易誤按，
            而且長輩看不清楚。「回去選」放在前面且做得更大——預設行為應該是回去補，不是跳過。 */}
        {skipAsk !== null && (
          <div className="mt-4 rounded-xl border-2 border-accent-300 bg-accent-50 p-4">
            <p className="text-lg leading-relaxed text-ink">
              這一頁還有 <b>{skipAsk}</b> 題沒有選，跳過就不會有這幾題的答案。確定要跳過嗎？
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setSkipAsk(null)}
                className="min-h-14 flex-[2] rounded-xl bg-brand-700 px-4 text-lg font-medium text-white hover:bg-brand-800"
              >
                回去選
              </button>
              <button
                type="button"
                onClick={() => goNext(pos, true)}
                disabled={saving}
                className="min-h-14 flex-1 rounded-xl border-2 border-brand-200 px-4 text-lg text-ink/60 disabled:opacity-60"
              >
                確定跳過
              </button>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 flex gap-3 bg-paper-raised py-4">
          <button
            type="button"
            onClick={() => {
              setSkipAsk(null);
              setIndex(Math.max(0, pos - 1));
            }}
            disabled={pos === 0 || saving}
            className="min-h-16 flex-1 rounded-xl border-2 border-brand-200 text-xl text-ink/70 disabled:opacity-40"
          >
            上一步
          </button>
          <button
            type="button"
            onClick={() => goNext(pos)}
            disabled={saving}
            className="flex min-h-16 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-700 text-xl font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Spinner className="h-5 w-5" />
                儲存中…
              </>
            ) : pos === screens.length - 1 ? (
              "完成"
            ) : (
              "下一步"
            )}
          </button>
        </div>
      </div>
      <p className="pb-3 text-center text-sm text-ink/30">{researchId}</p>
    </Shell>
  );
}

function Shell({ caseId, children }: { caseId: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-paper-raised">
      <StaffExit caseId={caseId} />
      <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-5">{children}</div>
    </div>
  );
}

/**
 * 診間人員的出口（2026-07-29）。這條路由刻意不渲染導覽列，所以人員拿回平板後
 * 需要一個回主畫面的路徑；但出口不能太顯眼——病人的手指就在螢幕上，而我們在
 * Phase 0 決定不做裝置隔離（見 pending.md C1b），一按就會進到完整系統。
 *
 * 折衷：固定在右上角的小按鈕（病人填題時視線在題目與選項上，不會跑到這裡），
 * 且要兩步——先點按鈕、再從選單挑目的地，避免誤觸就跳出。
 */
function StaffExit({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-2 top-2 z-40 rounded-md border border-brand-200 bg-white/90 px-2.5 py-1.5 text-xs text-ink/45 backdrop-blur hover:text-ink/70"
      >
        診間人員
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-paper-raised p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink">離開填寫畫面</h2>
            <p className="mt-1 text-sm text-ink/50">
              病人已填的部分都存好了，之後可以從這裡接續。
            </p>
            <div className="mt-4 space-y-2">
              <Link
                href={`/cases/${caseId}`}
                className="block rounded-xl bg-brand-700 px-4 py-3 text-center text-base font-medium text-white hover:bg-brand-800"
              >
                回到這位的個案頁
              </Link>
              <Link
                href="/intake"
                className="block rounded-xl border-2 border-brand-200 px-4 py-3 text-center text-base text-ink/80 hover:bg-brand-50"
              >
                回到收案頁
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-xl px-4 py-3 text-center text-base text-ink/50 hover:bg-ink/5"
              >
                取消，繼續填寫
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 依題型挑元件：選項 ≤ 6 用大按鈕，範圍大的才用履帶（決策 2026-07-29）。
function renderQuestion(
  segment: PatientIntakeSegmentKey,
  q: PageableQuestion,
  value: string | string[] | undefined,
  onChange: (v: string | string[]) => void
) {
  if (segment === "psqi") {
    if (q.order_no === 1 || q.order_no === 3) {
      return <TimeWheel value={typeof value === "string" ? value : ""} onChange={onChange} />;
    }
    if (q.order_no === 2) {
      return <BigChoice value={typeof value === "string" ? value : ""} onChange={onChange} options={PSQI_SLEEP_LATENCY} />;
    }
    if (q.order_no === 4) {
      return <HoursWheel value={typeof value === "string" ? value : ""} onChange={onChange} />;
    }
  }

  if (q.question_type === "multi") {
    return (
      <BigMultiChoice
        values={Array.isArray(value) ? value : []}
        onChange={onChange}
        options={q.options.map((o) => ({ value: o.value, label: o.label }))}
      />
    );
  }

  if (q.options.length > 0) {
    return (
      <BigChoice
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        options={q.options.map((o) => ({ value: o.value, label: o.label }))}
      />
    );
  }

  // 後台新增的數字題沒有選項時的保底：仍給大按鈕以外的輸入，但維持大字級
  return (
    <input
      type="number"
      inputMode="numeric"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-16 w-full rounded-xl border-2 border-brand-200 px-4 text-2xl"
    />
  );
}
