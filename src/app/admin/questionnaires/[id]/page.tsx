import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import { isSystemQuestionnaire } from "@/lib/questionnaireSystem";
import { addQuestionAction, updateQuestionnaireAction, updateQuestionAction, deleteQuestionAction } from "../actions";

const TYPE_LABEL: Record<string, string> = {
  single: "單選",
  multi: "複選",
  number: "數字",
  text: "文字",
  scale: "量表評分",
};

type Option = { value: string; label: string };

const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

function TypeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="question_type" defaultValue={defaultValue} className={inputCls}>
      <option value="single">單選</option>
      <option value="multi">複選</option>
      <option value="scale">量表評分</option>
      <option value="number">數字</option>
      <option value="text">文字</option>
    </select>
  );
}

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

  const system = isSystemQuestionnaire(template.name);
  // 每題有沒有人作答：逐題 head count（一次撈 question_id 會被 1000 筆上限截掉）
  const answerCounts = await Promise.all(
    (questions ?? []).map((q) =>
      supabase.from("questionnaire_answers").select("id", { count: "exact", head: true }).eq("question_id", q.id)
    )
  );
  const answeredIds = new Set((questions ?? []).filter((_, i) => (answerCounts[i].count ?? 0) > 0).map((q) => q.id));

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/questionnaires" className="text-sm text-slate-400 hover:underline">
        ← 回問卷列表
      </Link>
      <h1 className="text-xl font-semibold">{template.name}</h1>

      <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer text-slate-500">編輯問卷名稱與說明</summary>
        <form action={updateQuestionnaireAction} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={id} />
          <input name="name" defaultValue={template.name} required disabled={system} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`} />
          {system && <p className="text-xs text-slate-400">這份問卷被病人自填／門診流程用名稱抓取，名稱不能改。</p>}
          <select name="category" defaultValue={template.category} className={inputCls}>
            <option value="scale">疤痕量表</option>
            <option value="lifestyle">飲食運動習慣</option>
            <option value="other">其他</option>
          </select>
          <textarea name="description" rows={2} defaultValue={template.description ?? ""} placeholder="說明（選填）" className={inputCls} />
          <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
        </form>
      </details>

      {system && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          系統流程問卷：題目不能刪除，題型與選項的值不能改（計分與既有答案靠它們對應），可以改題目文字、選項顯示文字與必填。
        </p>
      )}

      <ul className="space-y-2">
        {(questions ?? []).map((q) => {
          const options = (q.options ?? []) as Option[];
          const answered = answeredIds.has(q.id);
          const locked = answered || system;
          return (
            <li key={q.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{TYPE_LABEL[q.question_type]}</span>
              {q.order_no}. {q.question_text}
              {q.required && <span className="ml-1 text-xs text-red-500">*必填</span>}
              {answered && <span className="ml-2 text-xs text-slate-400">（已有人作答）</span>}
              {options.length > 0 && (
                <ul className="ml-4 mt-1 list-disc text-xs text-slate-500">
                  {options.map((o, idx) => (
                    <li key={idx}>{o.label}</li>
                  ))}
                </ul>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500 underline">編輯</summary>
                <form action={updateQuestionAction} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={q.id} />
                  <input name="question_text" defaultValue={q.question_text} required className={inputCls} />
                  {locked ? (
                    <>
                      <p className="text-xs text-slate-400">
                        {answered ? "已有人作答" : "系統流程問卷"}，題型與選項的值鎖住，只能改顯示文字。
                      </p>
                      {options.map((o, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input type="hidden" name="opt_value" value={o.value} />
                          <span className="w-16 shrink-0 truncate font-mono text-xs text-slate-400" title={o.value}>
                            {o.value}
                          </span>
                          <input name="opt_label" defaultValue={o.label} className={inputCls} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <TypeSelect defaultValue={q.question_type} />
                      <textarea
                        name="options"
                        rows={Math.max(3, options.length)}
                        defaultValue={options.map((o) => `${o.value}|${o.label}`).join("\n")}
                        placeholder={"單選/複選/量表評分題請每行輸入一個選項，格式：值|顯示文字"}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
                      />
                    </>
                  )}
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" name="required" defaultChecked={q.required} /> 必填
                  </label>
                  <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
                </form>
                {!locked && (
                  <form action={deleteQuestionAction} className="mt-2">
                    <input type="hidden" name="id" value={q.id} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      className="!px-0 !py-0 text-xs text-red-500 underline hover:!bg-transparent"
                      pendingText="刪除中…"
                    >
                      刪除這題
                    </SubmitButton>
                  </form>
                )}
              </details>
            </li>
          );
        })}
        {(!questions || questions.length === 0) && <li className="text-sm text-slate-400">尚無題目</li>}
      </ul>

      <form action={addQuestionAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="questionnaire_id" value={id} />
        <input name="question_text" placeholder="題目文字" required className={inputCls} />
        <TypeSelect />
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
