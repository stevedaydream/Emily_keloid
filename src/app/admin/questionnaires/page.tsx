import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { createQuestionnaireAction } from "./actions";

const CATEGORY_LABEL: Record<string, string> = { scale: "疤痕量表", lifestyle: "飲食運動習慣", other: "其他" };

export default async function QuestionnairesAdminPage() {
  const supabase = supabaseServer();
  const { data: templates } = await supabase.from("questionnaire_templates").select("*").order("created_at");

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">問卷產生器</h1>
      <p className="text-sm text-slate-500">後台自訂問卷與題目，內容異動不需改程式碼。</p>

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
          <li key={t.id} className="px-4 py-2 text-sm">
            <Link href={`/admin/questionnaires/${t.id}`} className="font-medium underline">
              {t.name}
            </Link>
            <span className="ml-2 text-xs text-slate-400">{CATEGORY_LABEL[t.category]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
