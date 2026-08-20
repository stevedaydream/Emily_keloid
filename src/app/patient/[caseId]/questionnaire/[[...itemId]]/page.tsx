import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import { PSQI_QUESTIONNAIRE_NAME, PSQI_CLOCK_ORDERS } from "@/lib/scoring";
import { submitQuestionnaireAction } from "./actions";

export default async function ClinicQuestionnairePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string; itemId?: string[] }>;
  searchParams: Promise<{ questionnaire_id?: string }>;
}) {
  const { caseId, itemId: itemIdParam } = await params;
  const { questionnaire_id: questionnaireIdParam } = await searchParams;
  const itemId = itemIdParam?.[0] ?? "";
  const supabase = supabaseServer();

  let questionnaireId: string | null = null;
  let label = "";

  if (itemId) {
    const { data: item } = await supabase
      .from("case_schedule_items")
      .select("id, label, questionnaire_id")
      .eq("id", itemId)
      .single();
    if (!item || !item.questionnaire_id) return notFound();
    questionnaireId = item.questionnaire_id;
    label = item.label;
  } else if (questionnaireIdParam) {
    questionnaireId = questionnaireIdParam;
    label = "臨時填寫（非追蹤時程項目）";
  }

  const { data: caseRow } = await supabase.from("cases").select("research_id").eq("id", caseId).single();
  if (!caseRow) return notFound();

  // 尚未選定問卷：顯示選單
  if (!questionnaireId) {
    const { data: templates } = await supabase
      .from("questionnaire_templates")
      .select("id, name, description")
      .eq("active", true)
      .order("created_at");

    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">選擇要填寫的問卷</h1>
          <p className="mt-1 text-sm text-slate-500">{caseRow.research_id}</p>
        </div>
        <ul className="space-y-2">
          {(templates ?? []).map((t) => (
            <li key={t.id}>
              <Link
                href={`/patient/${caseId}/questionnaire?questionnaire_id=${t.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
              >
                <p className="text-sm font-medium text-slate-800">{t.name}</p>
                {t.description && <p className="mt-1 text-xs text-slate-500">{t.description}</p>}
              </Link>
            </li>
          ))}
          {(!templates || templates.length === 0) && <li className="text-sm text-slate-400">尚無可用問卷，請至後台建立</li>}
        </ul>
      </div>
    );
  }

  const [{ data: template }, { data: questions }] = await Promise.all([
    supabase.from("questionnaire_templates").select("name, description").eq("id", questionnaireId).single(),
    supabase.from("questionnaire_questions").select("*").eq("questionnaire_id", questionnaireId).order("order_no"),
  ]);

  const isPsqiClockQuestion = (orderNo: number) =>
    template?.name === PSQI_QUESTIONNAIRE_NAME && PSQI_CLOCK_ORDERS.includes(orderNo);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{template?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {caseRow.research_id} ・ {label}
        </p>
        {template?.description && <p className="mt-1 text-xs text-slate-400">{template.description}</p>}
      </div>

      <form action={submitQuestionnaireAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="item_id" value={itemId} />
        <input type="hidden" name="questionnaire_id" value={questionnaireId} />

        {(questions ?? []).map((q) => (
          <div key={q.id}>
            <label className="block text-sm font-medium text-slate-800">
              {q.order_no}. {q.question_text}
              {q.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            {q.question_type === "single" && (
              <div className="mt-1 space-y-1">
                {(q.options ?? []).map((o: { value: string; label: string }) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <input type="radio" name={`q_${q.id}`} value={o.value} required={q.required} />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
            {q.question_type === "multi" && (
              <div className="mt-1 space-y-1">
                {(q.options ?? []).map((o: { value: string; label: string }) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`q_${q.id}`} value={o.value} />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
            {/* 量表評分：選項的 value 即分數，橫排成一列刻度（分數在上、說明在下）。
                後台沒設定選項時退回數字輸入，避免題目變成不能作答的空白。 */}
            {q.question_type === "scale" &&
              ((q.options ?? []).length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {(q.options ?? []).map((o: { value: string; label: string }) => (
                    <label
                      key={o.value}
                      className="flex min-w-16 flex-1 cursor-pointer flex-col items-center gap-1 rounded-md border border-slate-200 px-2 py-2 text-center hover:border-brand-400 has-checked:border-brand-500 has-checked:bg-brand-50"
                    >
                      <input type="radio" name={`q_${q.id}`} value={o.value} required={q.required} />
                      <span className="font-data text-sm font-medium text-slate-700">{o.value}</span>
                      {o.label !== o.value && <span className="text-xs leading-tight text-slate-500">{o.label}</span>}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-1">
                  <input
                    type="number"
                    name={`q_${q.id}`}
                    required={q.required}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <p className="mt-1 text-xs text-amber-600">
                    此量表題尚未於後台設定分數選項，暫以數字輸入代替。
                  </p>
                </div>
              ))}
            {q.question_type === "number" && (
              <input
                type="number"
                name={`q_${q.id}`}
                required={q.required}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            )}
            {/* PSQI 的上床／起床時間雖然是 text 型態，但格式必須是 HH:MM 才算得出睡眠效率。
                放任 textarea 自由打字曾經產生 `23::40`，整筆 PSQI 總分就變成「資料不足」。 */}
            {q.question_type === "text" &&
              (isPsqiClockQuestion(q.order_no) ? (
                <input
                  type="time"
                  name={`q_${q.id}`}
                  required={q.required}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              ) : (
                <textarea
                  name={`q_${q.id}`}
                  required={q.required}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              ))}
          </div>
        ))}

        {/* 用 SubmitButton 而非裸 <button>：送出中會自動停用，擋掉連點兩下送出兩筆一模一樣的回覆
            （2026-08-20 PU-2026-001 的 PSQI 就是這樣多出一筆，相隔 4 秒、答案完全相同）。 */}
        <SubmitButton className="w-full" pendingText="送出中…">
          送出
        </SubmitButton>
      </form>
    </div>
  );
}
