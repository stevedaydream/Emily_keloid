import { supabaseServer } from "@/lib/supabase";
import { addLabMarkerAction, toggleLabMarkerActiveAction } from "./actions";

export default async function LabMarkersAdminPage() {
  const supabase = supabaseServer();
  const { data: markers } = await supabase.from("lab_marker_definitions").select("*").order("sort_order");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Lab 生物標記清單</h1>
        <p className="mt-1 text-sm text-slate-500">
          個案頁面「Lab 生物標記數據」區塊的標記選項來自這裡維護的清單，可自行新增其他標記。
        </p>
      </div>

      <form action={addLabMarkerAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">代碼（英數，唯一）</label>
          <input name="marker_key" placeholder="例如 il10" required className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">顯示名稱</label>
          <input name="display_name" placeholder="例如 IL-10" required className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">單位</label>
          <input name="unit" placeholder="例如 pg/mL" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800">
          新增
        </button>
      </form>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(markers ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className={m.active ? "" : "text-slate-400 line-through"}>
              {m.display_name}
              {m.unit && <span className="ml-2 text-xs text-slate-400">（{m.unit}）</span>}
            </span>
            <form action={toggleLabMarkerActiveAction}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="active" value={String(m.active)} />
              <button type="submit" className="text-xs text-slate-400 underline">
                {m.active ? "停用" : "啟用"}
              </button>
            </form>
          </li>
        ))}
        {(markers ?? []).length === 0 && <li className="px-4 py-2 text-sm text-slate-400">尚無標記</li>}
      </ul>
    </div>
  );
}
