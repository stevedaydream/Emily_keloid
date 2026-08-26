"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { getCurrentOperator } from "@/lib/operator";
import { logAudit } from "@/lib/audit";
import {
  computeJSSClassification,
  normalizeClockInput,
  PSQI_CLOCK_ORDERS,
  PSQI_QUESTIONNAIRE_NAME,
} from "@/lib/scoring";

export async function submitQuestionnaireAction(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const itemId = formData.get("item_id") as string;
  const questionnaireId = formData.get("questionnaire_id") as string;
  // 帶了 response_id ＝ 接續修改既有的那一筆（2026-08-25 使用者要求）。
  // 沒帶就照舊開一筆新的——同一份問卷在不同追蹤時間點本來就會有多筆回覆，那是資料不是重複。
  const editingResponseId = ((formData.get("response_id") as string) ?? "").trim();
  const operator = (await getCurrentOperator()) ?? "未知操作者";

  const supabase = supabaseServer();

  let responseId: string;
  if (editingResponseId) {
    // 確認這筆回覆真的屬於這個個案與這份問卷，才准改（server action 可以被直接 POST）
    const { data: existing } = await supabase
      .from("questionnaire_responses")
      .select("id")
      .eq("id", editingResponseId)
      .eq("case_id", caseId)
      .eq("questionnaire_id", questionnaireId)
      .maybeSingle();
    if (!existing) throw new Error("找不到要修改的問卷回覆");
    responseId = existing.id;
  } else {
    const { data: response, error } = await supabase
      .from("questionnaire_responses")
      // completed_at：這條路徑是整份一次送出（不像病人版逐頁存草稿），送出即完成。
      // 沒寫的話計分與匯出會把它當成半份問卷整份濾掉（2026-08-26）。
      .insert({
        case_id: caseId,
        questionnaire_id: questionnaireId,
        schedule_item_id: itemId || null,
        submitted_via: "staff",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !response) throw error ?? new Error("送出問卷失敗");
    responseId = response.id;
  }

  const [{ data: template }, { data: questions }] = await Promise.all([
    supabase.from("questionnaire_templates").select("name").eq("id", questionnaireId).single(),
    supabase.from("questionnaire_questions").select("id, order_no, question_type").eq("questionnaire_id", questionnaireId),
  ]);

  // 修改模式要跟舊值比對，才知道哪幾題「真的被改了」——只是重新送出同樣的內容不該被標成修改。
  const { data: previousAnswers } = editingResponseId
    ? await supabase.from("questionnaire_answers").select("id, question_id, answer_value").eq("response_id", responseId)
    : { data: [] as { id: string; question_id: string; answer_value: unknown }[] };
  const prevByQuestion = new Map(
    (previousAnswers ?? []).map((a) => [a.question_id as string, a as { id: string; answer_value: unknown }])
  );
  const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const now = new Date().toISOString();

  // 型別要寫出來：answer_value 可能是字串、數字或字串陣列，讓 TS 從第一筆去推會把後面的擋掉。
  const answerRows: { response_id: string; question_id: string; answer_value: unknown }[] = [];
  const answersByOrder: Record<number, unknown> = {};
  for (const q of questions ?? []) {
    if (q.question_type === "multi") {
      const values = formData.getAll(`q_${q.id}`) as string[];
      if (values.length > 0) answerRows.push({ response_id: responseId, question_id: q.id, answer_value: values });
    } else {
      const raw = formData.get(`q_${q.id}`);
      if (raw !== null && raw !== "") {
        // 量表評分題的選項 value 就是分數，跟 number 一樣存成數字（計分/匯出都當數值用）。
        const isNumeric = q.question_type === "number" || (q.question_type === "scale" && !Number.isNaN(Number(raw)));
        // PSQI 上床／起床時間表單已改用 <input type="time">，這裡再擋一層：
        // 舊瀏覽器或直接 POST 進來的 `23::40` 之類格式先正規化成 HH:MM，
        // 免得 scoring.ts 解析不出來、整筆總分變成 null。
        const needsClockNormalize =
          template?.name === PSQI_QUESTIONNAIRE_NAME &&
          PSQI_CLOCK_ORDERS.includes(q.order_no) &&
          typeof raw === "string";
        const value = isNumeric ? Number(raw) : needsClockNormalize ? normalizeClockInput(raw as string) : raw;
        answerRows.push({ response_id: responseId, question_id: q.id, answer_value: value });
        answersByOrder[q.order_no] = value;
      }
    }
  }
  if (editingResponseId) {
    // 逐題比對：值變了才更新並蓋上修改時間。本來沒答、這次答了就新增
    // （那是「補答」不是「修改」，updated_at 留 null）。
    for (const row of answerRows) {
      const prev = prevByQuestion.get(row.question_id);
      if (!prev) {
        await supabase.from("questionnaire_answers").insert(row);
        continue;
      }
      if (!sameValue(prev.answer_value, row.answer_value)) {
        await supabase
          .from("questionnaire_answers")
          .update({ answer_value: row.answer_value, updated_at: now, updated_by: operator })
          .eq("id", prev.id);
      }
    }
    // 這次沒作答、但上次有答案的題目＝被清空，整列刪掉（不留一個空字串的假答案）
    const answeredIds = new Set(answerRows.map((r) => r.question_id));
    const cleared = (previousAnswers ?? []).filter((a) => !answeredIds.has(a.question_id as string));
    if (cleared.length > 0) {
      await supabase
        .from("questionnaire_answers")
        .delete()
        .in(
          "id",
          cleared.map((a) => a.id)
        );
    }
  } else if (answerRows.length > 0) {
    await supabase.from("questionnaire_answers").insert(answerRows);
  }

  // JSS 疤痕診斷分類表送出後，直接把算出來的分數＋判定寫回個案基本資料的 JSW score 欄位，
  // 這樣「病人基本資料」區塊就不用再手動謄一次分數。
  if (template?.name === "JSS 疤痕診斷分類表") {
    const result = computeJSSClassification(answersByOrder);
    if (result) {
      await supabase.from("cases").update({ jsw_score: `${result.total} / 25` }).eq("id", caseId);
    }
  }

  await logAudit({
    caseId,
    operatorName: operator,
    action: editingResponseId ? "edit_questionnaire" : "submit_questionnaire",
    entity: "questionnaire_responses",
    entityId: responseId,
  });

  // 從診間收案動線進來時回動線頁（那裡會顯示「本次收案完成」），否則照舊回個案頁。
  // next 在頁面端已經擋過非站內路徑，這裡再擋一次——server action 是可以被直接 POST 的。
  const next = (formData.get("next") as string) ?? "";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  redirect(safeNext || `/cases/${caseId}?submitted=questionnaire`);
}
