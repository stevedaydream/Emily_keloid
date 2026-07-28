import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  createQuestionnaireAction,
  toggleQuestionnaireRequiredAction,
  toggleQuestionnaireActiveAction,
} from "./actions";

const CATEGORY_LABEL: Record<string, string> = { scale: "疤痕量表", lifestyle: "飲食運動習慣", other: "其他" };

export default async function QuestionnairesAdminPage() {
  const supabase = supabaseServer();
  const { data: templates } = await supabase.from("questionnaire_templates").select("*").order("created_at");

  const requiredCount = (templates ?? []).filter((t) => t.required_for_intake && t.active).length;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">問卷產生器</h1>
        <p className="mt-1 text-sm text-slate-500">
          後台自訂問卷與題目，內容異動不需改程式碼。勾選「正式上線需填寫」的問卷會列進每個個案頁面的「應填問卷清單」，
          填過就會自動打勾（目前 {requiredCount} 份）。
        </p>
      </div>

      <form action={createQuestionnaireAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <input name="name" placeholder="問卷名稱" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <select name="category" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="scale">疤痕量表</option>
          <option value="lifestyle">飲食運動習慣</option>
          <option value="other">其他</option>
        </select>
        <textarea name="description" rows={2} placeholder="說明（選填）" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          建立問卷
        </button>
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(templates ?? []).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
            <Link
              href={`/admin/questionnaires/${t.id}`}
              className={`font-medium underline ${t.active ? "" : "text-slate-300 line-through"}`}
            >
              {t.name}
            </Link>
            <span className="text-xs text-slate-400">{CATEGORY_LABEL[t.category]}</span>
            {t.required_for_intake && (
              <span className="whitespace-nowrap rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                正式上線需填寫
              </span>
            )}
            <span className="ml-auto flex items-center gap-3">
              <form action={toggleQuestionnaireRequiredAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="required_for_intake" value={String(t.required_for_intake)} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  className="!px-0 !py-0 whitespace-nowrap text-xs text-slate-500 underline hover:!bg-transparent"
                  pendingText="處理中…"
                >
                  {t.required_for_intake ? "取消必填" : "設為必填"}
                </SubmitButton>
              </form>
              <form action={toggleQuestionnaireActiveAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="active" value={String(t.active)} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  className="!px-0 !py-0 whitespace-nowrap text-xs text-slate-400 underline hover:!bg-transparent"
                  pendingText="處理中…"
                >
                  {t.active ? "停用" : "啟用"}
                </SubmitButton>
              </form>
            </span>
          </li>
        ))}
        {(templates ?? []).length === 0 && <li className="px-4 py-2 text-sm text-slate-400">尚無問卷</li>}
      </ul>
    </div>
  );
}
