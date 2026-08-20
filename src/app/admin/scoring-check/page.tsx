import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { PSQI_QUESTIONNAIRE_NAME } from "@/lib/scoring";
import ScoringCheckPanel, { type CheckQuestion } from "./ScoringCheckPanel";

export const SF36_QUESTIONNAIRE_NAME = "SF-36 健康調查簡表";

type RawQuestion = {
  order_no: number;
  question_text: string;
  question_type: string;
  options: unknown;
};

function toCheckQuestions(rows: RawQuestion[] | null): CheckQuestion[] {
  return (rows ?? []).map((q) => ({
    orderNo: q.order_no,
    text: q.question_text,
    type: q.question_type,
    options: Array.isArray(q.options) ? (q.options as { value: string; label: string }[]) : [],
  }));
}

export default async function ScoringCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ response_id?: string }>;
}) {
  const { response_id: responseId } = await searchParams;
  const supabase = supabaseServer();

  const { data: templates } = await supabase
    .from("questionnaire_templates")
    .select("id, name")
    .in("name", [SF36_QUESTIONNAIRE_NAME, PSQI_QUESTIONNAIRE_NAME]);

  const psqiTemplate = (templates ?? []).find((t) => t.name === PSQI_QUESTIONNAIRE_NAME);
  const sf36Template = (templates ?? []).find((t) => t.name === SF36_QUESTIONNAIRE_NAME);

  const [{ data: psqiRows }, { data: sf36Rows }, { data: responses }] = await Promise.all([
    psqiTemplate
      ? supabase
          .from("questionnaire_questions")
          .select("order_no, question_text, question_type, options")
          .eq("questionnaire_id", psqiTemplate.id)
          .order("order_no")
      : Promise.resolve({ data: null }),
    sf36Template
      ? supabase
          .from("questionnaire_questions")
          .select("order_no, question_text, question_type, options")
          .eq("questionnaire_id", sf36Template.id)
          .order("order_no")
      : Promise.resolve({ data: null }),
    supabase
      .from("questionnaire_responses")
      .select("id, submitted_at, submitted_via, questionnaire_id, cases(research_id)")
      .in("questionnaire_id", [psqiTemplate?.id, sf36Template?.id].filter(Boolean) as string[])
      .order("submitted_at", { ascending: false })
      .limit(30),
  ]);

  // 選了某一筆回覆時，把它的答案讀出來當作驗算的初始值（依 order_no 對應，跟計分程式同一套鍵）
  let prefill: { kind: "psqi" | "sf36"; answers: Record<number, string>; label: string } | null = null;
  if (responseId) {
    const { data: picked } = await supabase
      .from("questionnaire_responses")
      .select(
        "id, submitted_at, questionnaire_id, cases(research_id), questionnaire_answers(answer_value, questionnaire_questions(order_no))"
      )
      .eq("id", responseId)
      .single();
    if (picked) {
      const answers: Record<number, string> = {};
      for (const a of picked.questionnaire_answers ?? []) {
        const q = Array.isArray(a.questionnaire_questions) ? a.questionnaire_questions[0] : a.questionnaire_questions;
        const orderNo = (q as { order_no?: number } | null)?.order_no;
        if (orderNo === undefined) continue;
        const v = a.answer_value;
        answers[orderNo] = Array.isArray(v) ? v.join(",") : v === null || v === undefined ? "" : String(v);
      }
      const caseRow = Array.isArray(picked.cases) ? picked.cases[0] : picked.cases;
      prefill = {
        kind: picked.questionnaire_id === psqiTemplate?.id ? "psqi" : "sf36",
        answers,
        label: `${(caseRow as { research_id?: string } | null)?.research_id ?? "（無研究編號）"}・${String(
          picked.submitted_at
        ).slice(0, 16)}`,
      };
    }
  }

  const responseList = (responses ?? []).map((r) => {
    const caseRow = Array.isArray(r.cases) ? r.cases[0] : r.cases;
    return {
      id: r.id as string,
      kind: (r.questionnaire_id === psqiTemplate?.id ? "psqi" : "sf36") as "psqi" | "sf36",
      researchId: (caseRow as { research_id?: string } | null)?.research_id ?? "（無研究編號）",
      submittedAt: String(r.submitted_at).slice(0, 16),
      via: r.submitted_via === "patient" ? "病人自填" : "診間人員",
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">量表計分驗算</h1>
        <p className="mt-1 text-sm text-ink/50">
          把每一步的中間值攤開來，讓你能拿紙筆或 Excel 對答案。這裡跑的是
          <code className="mx-1 rounded bg-brand-50 px-1 text-brand-700">src/lib/scoring.ts</code>
          裡真正在用的同一份函式——不是另外寫一份示範，所以這裡算出什麼，個案頁面與匯出就是什麼。
        </p>
        <p className="mt-1 text-xs text-ink/40">
          計分依據：<code className="rounded bg-brand-50 px-1 text-brand-700">docs/生活品質量表及睡眠量表計分.docx</code>
        </p>
      </div>

      <details className="rounded-lg border border-brand-100 bg-paper-raised p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink/80">
          載入既有回覆來驗算（最近 30 筆）
        </summary>
        <ul className="mt-3 divide-y divide-brand-50 text-sm">
          {responseList.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-1.5">
              <span className="text-ink/70">
                <span className="font-data">{r.researchId}</span>
                <span className="mx-2 text-ink/30">|</span>
                {r.kind === "psqi" ? "PSQI" : "SF-36"}
                <span className="mx-2 text-ink/30">|</span>
                {r.submittedAt}
                <span className="mx-2 text-ink/30">|</span>
                {r.via}
              </span>
              <Link
                href={`/admin/scoring-check?response_id=${r.id}`}
                className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
              >
                載入
              </Link>
            </li>
          ))}
          {responseList.length === 0 && <li className="py-2 text-ink/40">目前沒有 SF-36／PSQI 的回覆紀錄</li>}
        </ul>
      </details>

      {prefill && (
        <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-2 text-sm text-brand-900">
          <span>
            已載入 {prefill.kind === "psqi" ? "PSQI" : "SF-36"} 回覆：{prefill.label}
          </span>
          <Link href="/admin/scoring-check" className="text-xs underline">
            清空重填
          </Link>
        </div>
      )}

      <ScoringCheckPanel
        psqiQuestions={toCheckQuestions(psqiRows as RawQuestion[] | null)}
        sf36Questions={toCheckQuestions(sf36Rows as RawQuestion[] | null)}
        prefill={prefill ? { kind: prefill.kind, answers: prefill.answers } : null}
      />
    </div>
  );
}
