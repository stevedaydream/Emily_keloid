"use client";

import SubmitButton from "@/components/ui/SubmitButton";
import CollapsedList from "@/components/ui/CollapsedList";
import { updateTreatmentRecordAction, deleteTreatmentRecordAction } from "./actions";

type FieldOption = { value: string; export_code?: number };
type FieldSchema = { key: string; label: string; type: string; options?: FieldOption[] };
type SymptomChangeOption = { id: string; label: string };

export type TreatmentRecordRow = {
  id: string;
  treatment_type_id: string;
  typeName: string | null;
  treatment_date: string;
  body_site: string | null;
  lesion_id: string | null;
  field_values: Record<string, string> | null;
  free_text: string | null;
  recorded_by: string;
  recurrence_observed: boolean | null;
  recurrence_description: string | null;
  blood_drawn: boolean | null;
  blood_drawn_note: string | null;
  symptom_change_option_id: string | null;
};

// 治療紀錄先前只能新增、無法回頭修正（日期打錯、欄位漏填、當下沒勾到復發/抽血都得重建一筆）。
// 這裡讓每筆紀錄可就地展開編輯或刪除；治療類型與所屬部位不開放改，
// 因為「手術切除 × 部位分類」已自動產生對應的放療排程，改掉會跟排程對不起來（要改請刪除後重建）。
export default function TreatmentRecordList({
  caseId,
  records,
  fieldSchemas,
  symptomChangeOptions,
}: {
  caseId: string;
  records: TreatmentRecordRow[];
  /** key = treatment_type_id，用來畫出該類型自己的結構化欄位 */
  fieldSchemas: Record<string, FieldSchema[]>;
  /** 症狀變化選項（case_intake_option_lists，category='symptom_change'），供顯示與編輯 */
  symptomChangeOptions: SymptomChangeOption[];
}) {
  if (records.length === 0) {
    return <p className="text-sm text-ink/40">尚無治療紀錄</p>;
  }

  return (
    <ul className="space-y-1.5">
      <CollapsedList listClassName="space-y-1.5" label="治療紀錄">
      {records.map((r) => {
        const schema = fieldSchemas[r.treatment_type_id] ?? [];
        const values = r.field_values ?? {};
        return (
          <li key={r.id} className="rounded-md border border-brand-50 px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-sm text-ink/70">
              <span className="font-medium">{r.treatment_date}</span>
              <span>・ {r.typeName}</span>
              {r.body_site && (
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800">部位：{r.body_site}</span>
              )}
              <span className="min-w-0 flex-1">
                {r.free_text || Object.entries(values).map(([k, v]) => `${k}: ${v}`).join(", ")}
              </span>
              <span className="text-xs text-ink/40">記錄人：{r.recorded_by}</span>
              {r.recurrence_observed && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                  復發：{r.recurrence_description || "（未填情形）"}
                </span>
              )}
              {r.blood_drawn && (
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">
                  抽血{r.blood_drawn_note ? `：${r.blood_drawn_note}` : ""}
                </span>
              )}
              {r.symptom_change_option_id && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                  症狀變化：
                  {symptomChangeOptions.find((o) => o.id === r.symptom_change_option_id)?.label ?? "（選項已移除）"}
                </span>
              )}
            </div>

            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-ink/40 hover:text-ink/60">修改這筆紀錄</summary>
              <form action={updateTreatmentRecordAction} className="mt-2 space-y-2">
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="record_id" value={r.id} />

                <div className="flex flex-wrap gap-2">
                  <div>
                    <label className="block text-[11px] text-ink/50">治療/追蹤日期</label>
                    <input
                      type="date"
                      name="treatment_date"
                      required
                      defaultValue={r.treatment_date}
                      className="mt-0.5 rounded border border-brand-200 px-1.5 py-1 text-xs"
                    />
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <label className="block text-[11px] text-ink/50">
                      部位文字{r.lesion_id && <span className="ml-1 text-ink/30">（已掛在病灶清單，改文字不會換部位）</span>}
                    </label>
                    <input
                      name="body_site"
                      defaultValue={r.body_site ?? ""}
                      className="mt-0.5 w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                    />
                  </div>
                </div>

                {schema.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {schema.map((f) => (
                      <div key={f.key}>
                        <label className="block text-[11px] text-ink/50">{f.label}</label>
                        {f.type === "select" ? (
                          <select
                            name={`field__${f.key}`}
                            defaultValue={values[f.key] ?? ""}
                            className="mt-0.5 w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                          >
                            <option value="">（未選）</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                            name={`field__${f.key}`}
                            defaultValue={values[f.key] ?? ""}
                            className="mt-0.5 w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] text-ink/50">說明（自由文字）</label>
                    <textarea
                      name="free_text"
                      rows={2}
                      defaultValue={r.free_text ?? ""}
                      className="mt-0.5 w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                    />
                  </div>
                )}

                <div className="rounded-md border border-amber-100 bg-amber-50 p-2">
                  {symptomChangeOptions.length > 0 && (
                    <div className="mb-2">
                      <label className="block text-[11px] text-ink/60">與治療前相比的症狀變化</label>
                      <select
                        name="symptom_change_option_id"
                        defaultValue={r.symptom_change_option_id ?? ""}
                        className="mt-0.5 w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                      >
                        <option value="">（未評估）</option>
                        {symptomChangeOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <label className="mb-1 flex items-center gap-2 text-[11px] text-ink/60">
                    <input type="checkbox" name="recurrence_observed" defaultChecked={r.recurrence_observed === true} />
                    觀察到復發
                  </label>
                  <input
                    name="recurrence_description"
                    defaultValue={r.recurrence_description ?? ""}
                    placeholder="復發情形描述（選填）"
                    className="mb-2 w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                  />
                  <label className="mb-1 flex items-center gap-2 text-[11px] text-ink/60">
                    <input type="checkbox" name="blood_drawn" defaultChecked={r.blood_drawn === true} />
                    此次有抽血
                  </label>
                  <input
                    name="blood_drawn_note"
                    defaultValue={r.blood_drawn_note ?? ""}
                    placeholder="抽血備註（選填）"
                    className="w-full rounded border border-brand-200 px-1.5 py-1 text-xs"
                  />
                </div>

                <SubmitButton variant="outline" size="sm" pendingText="儲存中…">
                  儲存修改
                </SubmitButton>
              </form>

              <form
                action={deleteTreatmentRecordAction}
                className="mt-1.5"
                onSubmit={(e) => {
                  if (!confirm("確定要刪除這筆治療紀錄嗎？（這筆手術自動產生的放療排程會一併刪除）")) e.preventDefault();
                }}
              >
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="record_id" value={r.id} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  className="!px-0 !py-0 text-xs text-red-500 underline hover:!bg-transparent"
                  pendingText="刪除中…"
                >
                  刪除這筆紀錄
                </SubmitButton>
              </form>
            </details>
          </li>
        );
      })}
      </CollapsedList>
    </ul>
  );
}
