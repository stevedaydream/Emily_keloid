import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { addKbEntryAction, toggleKbActiveAction } from "./actions";

export default async function HealthKbAdminPage() {
  const supabase = supabaseServer();
  const { data: entries } = await supabase.from("health_education_kb").select("*").order("sort_order");

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">衛教資料庫</h1>
        <Link href="/kb-chat" className="text-sm text-blue-600 underline">
          試用衛教機器人 →
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Gemini 衛教機器人只會依據下方內容回答，資料庫沒涵蓋的問題會請病人洽詢診間，不會自行發揮通用醫學知識。
      </p>

      <form action={addKbEntryAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <input name="topic" placeholder="主題（例：傷口會癢怎麼辦）" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <textarea name="content" rows={3} placeholder="衛教內容" required className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增
        </button>
      </form>

      <ul className="space-y-2">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex items-center justify-between">
              <b>{e.topic}</b>
              <form action={toggleKbActiveAction}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="active" value={String(e.active)} />
                <button type="submit" className="text-xs text-slate-400 underline">
                  {e.active ? "停用" : "啟用"}
                </button>
              </form>
            </div>
            <p className="mt-1 text-slate-600">{e.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
