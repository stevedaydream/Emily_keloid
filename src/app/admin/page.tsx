import Link from "next/link";

const GROUPS = [
  {
    label: "收案內容維護",
    items: [
      { href: "/admin/icd", title: "ICD-9/10 常用碼", desc: "蟹足腫相關診斷碼清單維護" },
      { href: "/admin/terms", title: "醫學術語庫", desc: "術前/術中/術後常用術語與示意圖" },
      { href: "/admin/intake-options", title: "發生原因/得知看診/衛教選單", desc: "個案頁面收案問診四類可複選清單維護" },
    ],
  },
  {
    label: "治療與追蹤設定",
    items: [
      { href: "/admin/treatments", title: "治療類型與套組", desc: "治療欄位定義與常用套組範本" },
      { href: "/admin/schedules", title: "追蹤時程範本", desc: "標準追蹤時程與各時間點動作" },
      { href: "/admin/lab-markers", title: "Lab 生物標記清單", desc: "IgE/Exosome/IL-1α/IL-1β/IL-6/TNF-α/MMP2/MMP9 等標記維護" },
    ],
  },
  {
    label: "問卷與衛教",
    items: [
      { href: "/admin/questionnaires", title: "問卷產生器", desc: "自訂問卷與題目（量表、飲食運動習慣等）" },
    ],
  },
  {
    label: "LINE 機器人",
    items: [
      {
        href: "/admin/health-kb",
        title: "LINE 衛教機器人內容",
        desc: "病人在 LINE 問問題時的回答內容、主題選單順序與啟用狀態",
      },
      {
        href: "/admin/line-messages",
        title: "LINE 機器人回覆設定",
        desc: "回診／放療提醒措辭、加好友與綁定回覆、選單提示語、AI 回應語氣",
      },
      {
        href: "/admin/line-logs",
        title: "LINE 推播與錯誤紀錄",
        desc: "推播成功/失敗紀錄、機器人無法回答的次數與原因（壞掉時只有這裡看得見）",
      },
    ],
  },
  {
    label: "團隊與帳號設定",
    items: [
      { href: "/admin/doctors", title: "醫師代碼清單", desc: "研究編號用醫師代碼維護" },
      { href: "/admin/operators", title: "操作者清單", desc: "共用帳號下的操作者選單維護" },
    ],
  },
  {
    label: "資料與系統工具",
    items: [
      { href: "/admin/import", title: "舊資料匯入", desc: "Excel/CSV 匯入、欄位對應與檢視" },
      {
        href: "/local-tools/mrn-mapping",
        title: "病歷號對照設定",
        desc: "設定本機對照表檔案位置，並可查詢/補登病歷號↔研究編號對照（純本機，不上雲端）",
      },
    ],
  },
];

export default function AdminHubPage() {
  return (
    <div className="space-y-8">
      <h1 className="font-heading text-xl font-medium text-brand-900">後台管理</h1>
      {GROUPS.map((g) => (
        <section key={g.label}>
          <h2 className="mb-2 text-sm font-semibold text-ink/60">{g.label}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {g.items.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="rounded-lg border border-brand-100 bg-paper-raised p-4 hover:border-brand-300 hover:bg-brand-50/40"
              >
                <h3 className="text-sm font-semibold text-brand-900">{s.title}</h3>
                <p className="mt-1 text-xs text-ink/50">{s.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
