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
  searchParams: Promise<{ questionnaire_id?: string; next?: string; response_id?: string }>;
}) {
  const { caseId, itemId: itemIdParam } = await params;
  const { questionnaire_id: questionnaireIdParam, next: nextParam, response_id: responseIdParam } = await searchParams;
  // 送出後要回哪裡。只收站內相對路徑——`//evil.com` 也是以 / 開頭，會被瀏覽器當成外站。
  const nextPath = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
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

  // ── 接續修改（2026-08-25 使用者要求）──────────────────────────
  //
  // 護理師填到一半跳過幾題，之後再點進來時原本會拿到一份全新的空白表，已填的要重打一次，
  // 資料庫也會多出一筆重疊的回覆。現在：
  //   · 帶 ?response_id= → 直接把那一筆的答案帶進表單，送出時就地更新（逐題記修改時間）
  //   · 沒帶但這個個案這份問卷已經有回覆 → 上方顯示提示，一鍵接續最後那一筆
  const { data: editing } = responseIdParam
    ? await supabase
        .from("questionnaire_responses")
        .select("id, submitted_at, questionnaire_answers(question_id, answer_value)")
        .eq("id", responseIdParam)
        .eq("case_id", caseId)
        .eq("questionnaire_id", questionnaireId)
        .maybeSingle()
    : { data: null };

  const { data: lastResponse } = !responseIdParam
    ? await supabase
        .from("questionnaire_responses")
        .select("id, submitted_at")
        .eq("case_id", caseId)
        .eq("questionnaire_id", questionnaireId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // question_id → 已填的值。單選/量表存字串或數字、複選存陣列，畫面一律轉成字串比對。
  const prefill = new Map<string, string[]>();
  for (const a of (editing?.questionnaire_answers ?? []) as { question_id: string; answer_value: unknown }[]) {
    const v = a.answer_value;
    prefill.set(a.question_id, Array.isArray(v) ? v.map(String) : v === null || v === undefined ? [] : [String(v)]);
  }
  const valueOf = (questionId: string) => prefill.get(questionId)?.[0] ?? "";
  const isChecked = (questionId: string, optionValue: string) =>
    (prefill.get(questionId) ?? []).includes(optionValue);
  const answeredCount = prefill.size;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{template?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {caseRow.research_id} ・ {label}
        </p>
        {template?.description && <p className="mt-1 text-xs text-slate-400">{template.description}</p>}
      </div>

      {/* 接續修改中：講清楚這次不會新增一筆，而且哪幾題改了會被記下來 */}
      {editing && (
        <div className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3 text-sm">
          <p className="font-medium text-brand-900">
            正在修改 {new Date(editing.submitted_at).toLocaleString("zh-TW")} 那一筆（已帶入 {answeredCount} 題）
          </p>
          <p className="mt-1 text-xs text-ink/60">
            送出後<b>不會新增一筆回覆</b>，而是就地更新這一筆；有更動的題目會各自記下修改時間，
            個案頁的逐題明細看得到。沒填的題目補上去就好，其餘保持原樣即可。
          </p>
        </div>
      )}

      {/* 沒帶 response_id，但這份問卷已經填過：提供一鍵接續，避免又開一份空白的 */}
      {!editing && lastResponse && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="text-amber-900">
            這位病人的這份問卷<b>已經填過</b>（{new Date(lastResponse.submitted_at).toLocaleString("zh-TW")}）。
          </p>
          <p className="mt-1 text-xs text-ink/60">
            要補填漏掉的題目或修正答案，請按下面接續那一筆；直接往下填則會<b>另外新增一筆</b>
            （不同追蹤時間點各留一筆才是對的）。
          </p>
          <Link
            href={`/patient/${caseId}/questionnaire${itemId ? `/${itemId}` : ""}?questionnaire_id=${questionnaireId}&response_id=${lastResponse.id}${
              nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""
            }`}
            className="mt-2 inline-block rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
          >
            接續上次那一筆修改 →
          </Link>
        </div>
      )}

      <form action={submitQuestionnaireAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="item_id" value={itemId} />
        <input type="hidden" name="questionnaire_id" value={questionnaireId} />
        <input type="hidden" name="next" value={nextPath} />
        {/* 有值＝就地修改那一筆，沒有＝開新的一筆（見 actions.ts） */}
        <input type="hidden" name="response_id" value={editing?.id ?? ""} />

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
                    <input
                      type="radio"
                      name={`q_${q.id}`}
                      value={o.value}
                      required={q.required}
                      defaultChecked={isChecked(q.id, o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
            {q.question_type === "multi" && (
              <div className="mt-1 space-y-1">
                {(q.options ?? []).map((o: { value: string; label: string }) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`q_${q.id}`}
                      value={o.value}
                      defaultChecked={isChecked(q.id, o.value)}
                    />
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
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={o.value}
                        required={q.required}
                        defaultChecked={isChecked(q.id, o.value)}
                      />
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
                    defaultValue={valueOf(q.id)}
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
                defaultValue={valueOf(q.id)}
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
                  defaultValue={valueOf(q.id)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              ) : (
                <textarea
                  name={`q_${q.id}`}
                  required={q.required}
                  rows={2}
                  defaultValue={valueOf(q.id)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              ))}
          </div>
        ))}

        {/* 用 SubmitButton 而非裸 <button>：送出中會自動停用，擋掉連點兩下送出兩筆一模一樣的回覆
            （2026-08-20 PU-2026-001 的 PSQI 就是這樣多出一筆，相隔 4 秒、答案完全相同）。 */}
        <SubmitButton className="w-full" pendingText={editing ? "儲存中…" : "送出中…"}>
          {editing ? "儲存修改" : "送出"}
        </SubmitButton>
      </form>
    </div>
  );
}
