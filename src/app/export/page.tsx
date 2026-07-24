import { supabaseServer } from "@/lib/supabase";

export default async function ExportPage() {
  const supabase = supabaseServer();
  const { count: caseCount } = await supabase.from("cases").select("id", { count: "exact", head: true });
  const { count: photoCount } = await supabase.from("photos").select("id", { count: "exact", head: true });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">資料匯出</h1>
        <p className="mt-1 text-sm text-slate-500">
          手動觸發匯出，兩個獨立下載，供人工下載後備份至本機硬碟。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">① 結構化資料表</h2>
        <p className="mt-1 text-xs text-slate-500">
          目前共 {caseCount ?? 0} 筆個案。匯出內容包含個案、診斷、術語紀錄、治療紀錄、追蹤時程、問卷回覆共 6 張 CSV，打包成 zip。
        </p>
        <a
          href="/api/export/structured-data"
          className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          下載結構化資料（zip）
        </a>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">② 傷口照片</h2>
        <p className="mt-1 text-xs text-slate-500">
          目前共 {photoCount ?? 0} 張照片，檔名依「研究編號_日期_檔案」命名，打包成 zip。
        </p>
        <a
          href="/api/export/photos-zip"
          className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          下載照片（zip）
        </a>
      </div>
    </div>
  );
}
