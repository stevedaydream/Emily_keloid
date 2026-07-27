import Link from "next/link";

const SECTIONS = [
  { href: "/admin/questionnaires", title: "問卷產生器", desc: "自訂問卷與題目（量表、飲食運動習慣等）" },
  { href: "/admin/terms", title: "醫學術語庫", desc: "術前/術中/術後常用術語與示意圖" },
  { href: "/admin/treatments", title: "治療類型與套組", desc: "治療欄位定義與常用套組範本" },
  { href: "/admin/schedules", title: "追蹤時程範本", desc: "標準追蹤時程與各時間點動作" },
  { href: "/admin/doctors", title: "醫師代碼清單", desc: "研究編號用醫師代碼維護" },
  { href: "/admin/operators", title: "操作者清單", desc: "共用帳號下的操作者選單維護" },
  { href: "/admin/icd", title: "ICD-9/10 常用碼", desc: "蟹足腫相關診斷碼清單維護" },
  { href: "/admin/import", title: "舊資料匯入", desc: "Excel/CSV 匯入、欄位對應與檢視" },
  { href: "/admin/health-kb", title: "衛教資料庫", desc: "Gemini 衛教機器人的回答內容來源" },
  { href: "/admin/intake-options", title: "發生原因/得知看診/衛教選單", desc: "個案頁面收案問診四類可複選清單維護" },
  { href: "/admin/lab-markers", title: "Lab 生物標記清單", desc: "IgE/Exosome/IL-1α/IL-1β/IL-6/TNF-α/MMP2/MMP9 等標記維護" },
  { href: "/local-tools/mrn-mapping", title: "病歷號對照設定", desc: "設定本機對照表檔案位置，並可查詢/補登病歷號↔研究編號對照（純本機，不上雲端）" },
];

export default function AdminHubPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-medium text-brand-900">後台管理</h1>
      <div className="grid grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-brand-100 bg-paper-raised p-4 hover:border-brand-300 hover:bg-brand-50/40"
          >
            <h2 className="text-sm font-semibold text-brand-900">{s.title}</h2>
            <p className="mt-1 text-xs text-ink/50">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
