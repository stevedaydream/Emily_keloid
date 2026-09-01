import Link from "next/link";
import { canUseMaintenanceTools } from "@/lib/adminPin";

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
      { href: "/admin/lab-markers", title: "Lab 生物標記清單", desc: "IgE/Exosome/IL-1β/IL-6/IL-10/TNF-α/MMP2/MMP9 等標記維護" },
    ],
  },
  {
    label: "問卷與衛教",
    items: [
      { href: "/admin/questionnaires", title: "問卷產生器", desc: "自訂問卷與題目（量表、飲食運動習慣等）" },
      {
        href: "/admin/scoring-check",
        title: "量表計分驗算",
        desc: "SF-36／PSQI 逐步計算過程攤開來核對，可載入既有回覆或手動試算",
      },
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
      { href: "/admin/rt-doctors", title: "放射科醫師清單", desc: "放療紀錄可選的醫師與匯出代碼" },
      { href: "/admin/operators", title: "操作者清單", desc: "共用帳號下的操作者選單維護" },
    ],
  },
  {
    label: "資料與系統工具",
    items: [
      {
        href: "/admin/import-keloid",
        title: "批次匯入（部長格式）",
        desc: "下載空白範本→填寫→上傳，尺寸自動拆成長寬高",
      },
      { href: "/admin/import", title: "舊資料匯入（自訂欄位對應）", desc: "任意格式 Excel/CSV，需手動對應欄位" },
      {
        href: "/admin/control-subjects",
        title: "對照組（健康受試者）",
        desc: "一人一次抽血；獨立編號 CTL-年份-序號，匯出為獨立分頁",
      },
      {
        href: "/admin/export-key",
        title: "匯出金鑰",
        desc: "控制匯出檔要不要帶出病歷號與姓名；含救援碼（忘記時可重設）",
        adminOnly: true,
      },
      {
        href: "/admin/test-mode",
        title: "測試模式",
        desc: "demo／教育訓練期間收的個案標成「測試」，不進匯出檔，之後可一鍵刪除",
        // 維運工具：只給系統管理者看（使用者要求 2026-08-25）。部長看到一顆
        // 「刪除所有測試個案」只會困惑，那跟他的工作無關。
        adminOnly: true,
      },
      {
        href: "/admin/admin-pin",
        title: "系統管理者 PIN",
        desc: "正式上線後，切換成系統管理者要先輸入 PIN，維運工具才打得開",
        adminOnly: true,
      },
    ],
  },
];

export default async function AdminHubPage() {
  // adminOnly 的卡片＝維運工具，要系統管理者身分，且設了 PIN 之後還要通過 PIN 驗證。
  // ⚠️ 隱藏卡片是**動線**，真正的門在各頁自己那道 canUseMaintenanceTools()（決策 #9：
  // 全體共用一組帳號，知道網址的人照樣打得開網址，但打不開內容）。
  const isSystemAdmin = (await canUseMaintenanceTools()).ok;

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-xl font-medium text-brand-900">後台管理</h1>
      {GROUPS.map((g) => {
        const items = g.items.filter((s) => !("adminOnly" in s) || isSystemAdmin);
        if (items.length === 0) return null;
        return (
        <section key={g.label}>
          <h2 className="mb-2 text-sm font-semibold text-ink/60">{g.label}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((s) => (
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
        );
      })}
    </div>
  );
}
