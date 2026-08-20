import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  addControlSubjectAction,
  updateControlSubjectAction,
  deleteControlSubjectAction,
} from "./actions";

export default async function ControlSubjectsPage() {
  const supabase = supabaseServer();
  const { data: subjects } = await supabase
    .from("control_subjects")
    .select("*")
    .order("enrollment_year", { ascending: false })
    .order("sequence_no", { ascending: false });

  const field = "rounded-md border border-brand-200 px-2 py-1.5 text-sm";
  const unconsented = (subjects ?? []).filter((s) => !s.consent_signed_at).length;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="font-heading text-xl font-medium text-brand-900">對照組（健康受試者）</h1>
        <p className="mt-1 text-sm text-ink/50">
          一個人一次抽血，不收病灶、診斷、手術、追蹤與問卷，所以<b>不放進個案表</b>——
          否則匯出的 Basic Info 會有兩百多欄對他們永遠是空的。編號自成一組（<code>CTL-年份-序號</code>），
          匯出時是獨立一張分頁。Lab 生物標記與實驗組共用同一張表，才跑得了組間比較。
        </p>
      </div>

      {unconsented > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          有 <b>{unconsented}</b> 位尚未填同意書日期。健康受試者抽血一樣要簽署，匯出時預設會被排除。
        </p>
      )}

      <form
        action={addControlSubjectAction}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-paper-raised p-4"
      >
        <div>
          <label className="block text-xs font-medium text-ink/60">性別</label>
          <select name="sex" className={`mt-1 w-24 ${field}`}>
            <option value="">未填</option>
            <option value="female">女</option>
            <option value="male">男</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">年齡</label>
          <input type="number" name="age_at_enrollment" min={0} max={130} className={`mt-1 w-20 ${field}`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">同意書簽署日</label>
          <input type="date" name="consent_signed_at" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">抽血日期</label>
          <input type="date" name="blood_draw_date" className={`mt-1 ${field}`} />
        </div>
        <div className="min-w-40 flex-1">
          <label className="block text-xs font-medium text-ink/60">備註（選填）</label>
          <input name="notes" className={`mt-1 w-full ${field}`} />
        </div>
        <SubmitButton pendingText="新增中…">新增受試者</SubmitButton>
      </form>

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-paper-raised">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-brand-100 text-left text-xs text-ink/50">
            <tr>
              <th className="px-3 py-2">編號</th>
              <th className="px-3 py-2">性別</th>
              <th className="px-3 py-2">年齡</th>
              <th className="px-3 py-2">同意書</th>
              <th className="px-3 py-2">抽血日期</th>
              <th className="px-3 py-2">備註</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(subjects ?? []).map((s) => (
              <tr key={s.id} className="border-b border-brand-50 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-data text-brand-900">{s.subject_code}</td>
                <td colSpan={6} className="px-3 py-2">
                  <form action={updateControlSubjectAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <select name="sex" defaultValue={s.sex ?? ""} className={`w-20 ${field}`}>
                      <option value="">未填</option>
                      <option value="female">女</option>
                      <option value="male">男</option>
                    </select>
                    <input
                      type="number"
                      name="age_at_enrollment"
                      defaultValue={s.age_at_enrollment ?? ""}
                      className={`w-16 ${field}`}
                    />
                    <input
                      type="date"
                      name="consent_signed_at"
                      defaultValue={s.consent_signed_at ?? ""}
                      className={field}
                    />
                    <input type="date" name="blood_draw_date" defaultValue={s.blood_draw_date ?? ""} className={field} />
                    <input name="notes" defaultValue={s.notes ?? ""} className={`min-w-32 flex-1 ${field}`} />
                    {!s.consent_signed_at && (
                      <span className="whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        同意書未簽
                      </span>
                    )}
                    <SubmitButton variant="outline" size="sm" pendingText="儲存中…">
                      儲存
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {(subjects ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-sm text-ink/40">
                  尚未收任何對照組受試者
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="text-xs text-ink/40">
        <summary className="cursor-pointer">刪除受試者</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {(subjects ?? []).map((s) => (
            <form key={s.id} action={deleteControlSubjectAction}>
              <input type="hidden" name="id" value={s.id} />
              <SubmitButton variant="ghost" size="sm" className="!px-1.5 !py-0.5 text-xs underline" pendingText="刪除中…">
                刪除 {s.subject_code}
              </SubmitButton>
            </form>
          ))}
        </div>
      </details>
    </div>
  );
}
