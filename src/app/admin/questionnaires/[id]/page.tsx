import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { addQuestionAction } from "../actions";

const TYPE_LABEL: Record<string, string> = {
  single: "單選",
  multi: "複選",
  number: "數字",
  text: "文字",
  scale: "量表評分",
};

export default async function QuestionnaireEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = supabaseServer();
  const [{ data: template }, { data: questions }] = await Promise.all([
    supabase.from("questionnaire_templates").select("*").eq("id", id).single(),
    supabase.from("questionnaire_questions").select("*").eq("questionnaire_id", id).order("order_no"),
  ]);

  if (!template) return <p className="text-sm text-red-600">找不到此問卷</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/questionnaires" className="text-sm text-slate-400 hover:underline">
        ← 回問卷列表
      </Link>
      <h1 className="text-xl font-semibold">{template.name}</h1>

      <ul className="space-y-2">
        {(questions ?? []).map((q) => (
          <li key={q.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{TYPE_LABEL[q.question_type]}</span>
            {q.order_no}. {q.question_text}
            {q.required && <span className="ml-1 text-xs text-red-500">*必填</span>}
            {(q.options ?? []).length > 0 && (
              <ul className="ml-4 mt-1 list-disc text-xs text-slate-500">
                {q.options.map((o: { value: string; label: string }, idx: number) => (
                  <li key={idx}>{o.label}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {(!questions || questions.length === 0) && <li className="text-sm text-slate-400">尚無題目</li>}
      </ul>

      <form action={addQuestionAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="questionnaire_id" value={id} />
        <input name="question_text" placeholder="題目文字" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <select name="question_type" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="single">單選</option>
          <option value="multi">複選</option>
          <option value="scale">量表評分</option>
          <option value="number">數字</option>
          <option value="text">文字</option>
        </select>
        <textarea
          name="options"
          rows={3}
          placeholder={"單選/複選/量表評分題請每行輸入一個選項，格式：值|顯示文字\n例：\nyes|是\nno|否"}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
        />
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" name="required" /> 必填
        </label>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增題目
        </button>
      </form>
    </div>
  );
}
