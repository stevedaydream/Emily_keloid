"use client";

import { useState } from "react";
import IdentifiedExport from "./IdentifiedExport";
import { buttonClasses } from "@/components/ui/buttonStyles";

// 匯出篩選與排序（docx 2026-08-12 第 7 點：「後台 raw data 匯出，可以照收案點選先後順序排序或其他篩選方式列出」）。
//
// 篩選條件要同時套用在「一般匯出」與「含姓名的匯出」兩個下載上，所以查詢字串在這裡集中管理，
// 再分別交給下載連結與 IdentifiedExport。

export type DoctorOption = { id: string; code: string; name: string };

export default function StructuredExportPanel({
  doctors,
  caseCount,
}: {
  doctors: DoctorOption[];
  caseCount: number;
}) {
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [doctor, setDoctor] = useState("");
  const [operated, setOperated] = useState("");
  const [source, setSource] = useState("");
  // 未簽同意書的個案預設排除（決策 2026-08-20 F-C2）。實務上病人是先在平板填完、
  // 之後才補簽同意書，所以「已填問卷但同意書還沒進來」是常態；那些資料不該混進交出去的檔案。
  const [consentOnly, setConsentOnly] = useState(true);
  const [sort, setSort] = useState("created");

  const params = new URLSearchParams();
  if (yearFrom) params.set("yearFrom", yearFrom);
  if (yearTo) params.set("yearTo", yearTo);
  if (doctor) params.set("doctor", doctor);
  if (operated) params.set("operated", operated);
  if (source) params.set("source", source);
  if (!consentOnly) params.set("consent", "all");
  if (sort && sort !== "created") params.set("sort", sort);
  const query = params.toString();
  const href = `/api/export/structured-data${query ? `?${query}` : ""}`;
  const filtered = [yearFrom, yearTo, doctor, operated, source].some(Boolean) || consentOnly;

  const field = "mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm";

  return (
    <div className="rounded-lg border border-brand-100 bg-paper-raised p-4">
      <h2 className="text-sm font-semibold text-brand-900">① 結構化資料表</h2>
      <p className="mt-1 text-xs text-ink/50">
        目前共 {caseCount} 筆個案。格式為部長 2026-08 版 Excel 編碼簿的 4 張主表
        （Basic Info. 56 欄 / Operation 26 欄 / Year 1 follow-up 42 欄 / Year 2 follow-up 41 欄），
        欄位順序與數量完全一致，儲存格只放數字碼，可直接貼進統計軟體。
        平台多出來的資料（病灶數字化測量、追蹤逐筆、問卷分數、Lab、編碼對照表、未能對應清單、欄位缺口清單）
        放在附表，不污染主表。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-ink/60">收案年份（起）</label>
          <input
            type="number"
            placeholder="例 2019"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">收案年份（迄）</label>
          <input
            type="number"
            placeholder="例 2026"
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">主治醫師</label>
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className={field}>
            <option value="">全部</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}（{d.code}）
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="flex items-start gap-2 rounded-md border border-brand-100 bg-paper-sunken px-2 py-1.5 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={consentOnly}
              onChange={(e) => setConsentOnly(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <b>只匯出已簽署知情同意書的個案</b>（預設開啟）
              <span className="mt-0.5 block text-ink/40">
                關閉後，同意書日期還空著的個案也會一起匯出。這些個案的問卷與檢體資料在研究上尚不可用，
                個案頁與「未能對應清單」會標示出來。
              </span>
            </span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">是否已手術</label>
          <select value={operated} onChange={(e) => setOperated(e.target.value)} className={field}>
            <option value="">全部</option>
            <option value="yes">已手術</option>
            <option value="no">尚未手術</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">資料來源</label>
          <select value={source} onChange={(e) => setSource(e.target.value)} className={field}>
            <option value="">全部</option>
            <option value="normal">正常收案</option>
            <option value="legacy_import">舊資料回溯建檔</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/60">排序</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={field}>
            <option value="created">收案建檔順序</option>
            <option value="research_id">研究編號</option>
            <option value="surgery">手術日期</option>
          </select>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-ink/40">
        「收案年份」比對的是研究編號裡的年份（<code>enrollment_year</code>），不是資料建檔日——
        舊資料回溯建檔的建檔日是匯入當天，用它篩會把 2019 年的舊病人也一起撈出來。
      </p>

      <a href={href} className={`${buttonClasses("primary")} mt-3`}>
        下載結構化資料（.xlsx）
        {filtered && <span className="ml-1 text-xs opacity-80">・已套用篩選</span>}
      </a>

      <IdentifiedExport query={query} />
    </div>
  );
}
