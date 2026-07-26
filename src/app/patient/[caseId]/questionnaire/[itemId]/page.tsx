import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { submitQuestionnaireAction } from "./actions";

export default async function ClinicQuestionnairePage({
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
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{template?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {caseInfo?.research_id} ・ {item.label}
        </p>
        {template?.description && <p className="mt-1 text-xs text-slate-400">{template.description}</p>}
      </div>

      <form action={submitQuestionnaireAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
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
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          送出
        </button>
      </form>
    </div>
  );
}
