import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { submitQuestionnaireAction } from "./actions";

export default async function PatientQuestionnairePage({
  params,
}: {
  params: Promise<{ caseId: string; itemId: string }>;
}) {
  const { caseId, itemId } = await params;
  const supabase = supabaseServer();

  const { data: item } = await supabase
    .from("case_schedule_items")
    .select("id, label, questionnaire_id, cases(research_id)")
    .eq("id", itemId)
    .single();

  if (!item || !item.questionnaire_id) return notFound();

  const caseInfo = Array.isArray(item.cases) ? item.cases[0] : item.cases;

  const [{ data: template }, { data: questions }] = await Promise.all([
    supabase.from("questionnaire_templates").select("name, description").eq("id", item.questionnaire_id).single(),
    supabase.from("questionnaire_questions").select("*").eq("questionnaire_id", item.questionnaire_id).order("order_no"),
  ]);

  return (
    <div className="mx-auto max-w-sm">
      <div className="overflow-hidden rounded-2xl border border-slate-300 shadow-sm">
        <div className="flex items-center gap-2 bg-[#06C755] px-4 py-3 text-white">
          <div className="h-8 w-8 rounded-full bg-white/30" />
          <div>
            <p className="text-sm font-semibold">蟹足腫研究小幫手（模擬 LINE 畫面）</p>
            <p className="text-xs opacity-80">{caseInfo?.research_id} ・ {item.label}</p>
          </div>
        </div>
        <div className="space-y-3 bg-[#8CABD8] p-4">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-3 text-sm shadow">
            您好，該填寫「{template?.name}」囉！請點選下方表單完成填寫。
          </div>

          <form
            action={submitQuestionnaireAction}
            className="space-y-3 rounded-2xl rounded-tl-sm bg-white p-4 text-sm shadow"
          >
            <input type="hidden" name="case_id" value={caseId} />
            <input type="hidden" name="item_id" value={itemId} />
            <input type="hidden" name="questionnaire_id" value={item.questionnaire_id} />

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
                {q.question_type === "number" && (
                  <input
                    type="number"
                    name={`q_${q.id}`}
                    required={q.required}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                )}
                {q.question_type === "text" && (
                  <textarea
                    name={`q_${q.id}`}
                    required={q.required}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              className="w-full rounded-full bg-[#06C755] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              送出問卷
            </button>
          </form>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">
        （Demo 模擬畫面，正式版將透過 LINE LIFF 呈現）
      </p>
    </div>
  );
}
