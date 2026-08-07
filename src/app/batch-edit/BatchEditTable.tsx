"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import PatientName, { useLocalNames } from "@/components/LocalNameProvider";
import CaseDrawer from "./CaseDrawer";
import { saveBatchEditsAction, type BatchEdit } from "./actions";

export type BatchCaseRow = {
  id: string;
  research_id: string;
  doctor: string;
  sex: string;
  age_at_enrollment: string;
  phone_number: string;
  consent_signed_at: string;
  jsw_score: string;
  recurrence_status: string;
  recurrence_date: string;
  followup_cutoff_date: string;
  notes: string;
  body_site: string;
  lesionCount: number;
  lesionUnclassified: number;
  treatmentCount: number;
  photoCount: number;
  pendingScheduleCount: number;
  pendingCompletenessCount: number;
};

type ColumnKind = "text" | "int" | "date" | "sex" | "recurrence";
type Column = { key: keyof BatchCaseRow; label: string; kind: ColumnKind; width: string };

// 預設只顯示最常補的欄位，一鍵展開才出現其餘欄位（18 欄在診間螢幕一定要左右捲，
// 而批次補資料最痛苦的就是「往右捲填一格、往左捲確認這是誰」）。
//
// width 直接掛在 input/select 上而不是 <td>：表格是 auto layout，<td> 的寬度只是建議值，
// 真正決定欄寬的是格子裡那個元件的寬度。手機上表格整體用 min-w-max 撐開後左右捲動，
// 所以這裡的寬度要「放得下內容」而不是「擠進畫面」。
const COMPACT_COLUMNS: Column[] = [
  { key: "sex", label: "性別", kind: "sex", width: "w-20" },
  // 年齡是 number input，Chrome 會在右側疊上上下箭頭，w-16 會把數字擠掉
  { key: "age_at_enrollment", label: "年齡", kind: "int", width: "w-20" },
  // 手機號碼 09xx-xxx-xxx 連同 padding 要 ~150px
  { key: "phone_number", label: "手機", kind: "text", width: "w-40" },
  { key: "consent_signed_at", label: "同意書日期", kind: "date", width: "w-40" },
  { key: "jsw_score", label: "JSW score", kind: "text", width: "w-28" },
];

const EXTRA_COLUMNS: Column[] = [
  { key: "recurrence_status", label: "復發狀態", kind: "recurrence", width: "w-28" },
  { key: "recurrence_date", label: "復發日期", kind: "date", width: "w-40" },
  { key: "followup_cutoff_date", label: "最後追蹤日", kind: "date", width: "w-40" },
  { key: "notes", label: "備註", kind: "text", width: "w-48" },
];

// number input 的上下箭頭會蓋掉右側數字，且只有 hover 時出現，欄位看起來就像被截斷。
const NUMBER_INPUT_RESET =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const SEX_OPTIONS = [
  { value: "", label: "未填" },
  { value: "M", label: "男" },
  { value: "F", label: "女" },
  { value: "other", label: "其他" },
  { value: "unknown", label: "不明" },
];

const RECURRENCE_OPTIONS = [
  { value: "", label: "未填" },
  { value: "none", label: "無復發" },
  { value: "recurred", label: "已復發" },
  { value: "unknown", label: "未知" },
  { value: "not_applicable", label: "不適用" },
];

const editKey = (caseId: string, field: string) => `${caseId}:${field}`;

export default function BatchEditTable({ rows, years }: { rows: BatchCaseRow[]; years: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { names, showNames, linked } = useLocalNames();
  // 沒掛本機對照表時整欄不顯示，免得留下一排空白的姓名欄
  const withNames = showNames && linked;

  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [drawerCaseId, setDrawerCaseId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ saved: number; errors: string[] } | null>(null);

  const columns = showAllColumns ? [...COMPACT_COLUMNS, ...EXTRA_COLUMNS] : COMPACT_COLUMNS;

  // 92 筆一次載入不分頁，所以表格自己的左右捲軸落在整頁最底部——要往右捲一格，
  // 得先把整頁滑到最下面。這裡另外放一條「代理捲軸」黏在螢幕最下方，跟表格雙向同步，
  // 捲到哪一列都能直接拉。原生那條會同時被藏起來（見下方 scroller 的 className），
  // 否則兩條外觀與功能都相同的拉桿並存，只是一條會跟著頁面跑，看起來像 bug。
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [scrollMetrics, setScrollMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });
  const overflowing = scrollMetrics.scrollWidth > scrollMetrics.clientWidth + 1;

  useEffect(() => {
    const scroller = scrollerRef.current;
    const table = tableRef.current;
    if (!scroller || !table) return;
    // 量測放在 ResizeObserver 的 callback 裡（observe 後會立刻非同步回呼一次），
    // 而不是 effect 本體直接 setState——後者會多一輪串聯 render。
    const observer = new ResizeObserver(() =>
      setScrollMetrics({ scrollWidth: table.scrollWidth, clientWidth: scroller.clientWidth })
    );
    observer.observe(table);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // 兩邊互相寫 scrollLeft 會來回觸發 scroll 事件，用一個旗標讓回聲那一次不做事
  function syncScroll(from: "table" | "proxy") {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    const scroller = scrollerRef.current;
    const proxy = proxyRef.current;
    if (!scroller || !proxy) return;
    syncingRef.current = true;
    if (from === "table") proxy.scrollLeft = scroller.scrollLeft;
    else scroller.scrollLeft = proxy.scrollLeft;
  }

  // 未儲存變更時，關掉分頁前給瀏覽器的提示（擋不了強制關閉整個瀏覽器，但擋得掉多數誤觸）
  useEffect(() => {
    if (edits.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [edits.size]);

  const valueOf = (row: BatchCaseRow, field: keyof BatchCaseRow) => {
    const pending = edits.get(editKey(row.id, String(field)));
    return pending !== undefined ? pending : String(row[field] ?? "");
  };

  function setValue(row: BatchCaseRow, field: keyof BatchCaseRow, value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      const key = editKey(row.id, String(field));
      // 改回原值就把這筆變更移除，避免「假的未儲存」
      if (value === String(row[field] ?? "")) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }

  const isRowIncomplete = (r: BatchCaseRow) =>
    !r.sex || !r.age_at_enrollment || !r.phone_number || !r.consent_signed_at || !r.jsw_score || r.lesionUnclassified > 0;

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyIncomplete && !isRowIncomplete(r)) return false;
      if (!needle) return true;
      const name = names.get(r.research_id) ?? "";
      return (
        r.research_id.toLowerCase().includes(needle) ||
        r.doctor.toLowerCase().includes(needle) ||
        r.body_site.toLowerCase().includes(needle) ||
        (showNames && name.toLowerCase().includes(needle))
      );
    });
  }, [rows, keyword, onlyIncomplete, names, showNames]);

  async function handleSave() {
    if (edits.size === 0) return;
    setSaving(true);
    setResult(null);
    try {
      const payload: BatchEdit[] = [...edits.entries()].map(([key, value]) => {
        const [caseId, field] = key.split(":");
        return { caseId, field, value };
      });
      const res = await saveBatchEditsAction(payload);
      setResult(res);
      if (res.errors.length === 0) setEdits(new Map());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/batch-edit?${params.toString()}`);
  }

  const changedCaseCount = new Set([...edits.keys()].map((k) => k.split(":")[0])).size;

  return (
    <div className="space-y-3">
      {/* 篩選列 */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-white p-3 text-sm">
        <div>
          <label className="block text-xs text-ink/50">收案年度</label>
          <select
            value={searchParams.get("year") ?? ""}
            onChange={(e) => setFilter("year", e.target.value)}
            className="mt-1 rounded-md border border-brand-200 px-2 py-1 text-sm"
          >
            <option value="">全部</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink/50">來源</label>
          <select
            value={searchParams.get("source") ?? ""}
            onChange={(e) => setFilter("source", e.target.value)}
            className="mt-1 rounded-md border border-brand-200 px-2 py-1 text-sm"
          >
            <option value="">全部</option>
            <option value="normal">正常收案</option>
            <option value="legacy_import">舊資料回溯建檔</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink/50">同意書</label>
          <select
            value={searchParams.get("consent") ?? ""}
            onChange={(e) => setFilter("consent", e.target.value)}
            className="mt-1 rounded-md border border-brand-200 px-2 py-1 text-sm"
          >
            <option value="">全部</option>
            <option value="signed">已簽署</option>
            <option value="unsigned">未簽署</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-ink/50">關鍵字（編號／醫師／部位／姓名）</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1 text-sm"
          />
        </div>
        <label className="flex items-center gap-1 whitespace-nowrap rounded-md border border-brand-200 px-2 py-1 text-xs">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} />
          只顯示有空欄位的
        </label>
        <button
          type="button"
          onClick={() => setShowAllColumns((v) => !v)}
          className="whitespace-nowrap rounded-md border border-brand-200 px-2 py-1 text-xs hover:bg-brand-50"
        >
          {showAllColumns ? "精簡欄位" : "顯示全部欄位"}
        </button>
      </div>

      {/* 未儲存橫幅：有變更時才出現，常駐在表格上方 */}
      {edits.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <span className="text-amber-800">
            <b className="font-data">{edits.size}</b> 處變更未儲存（{changedCaseCount} 個案）
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEdits(new Map())}
              className="whitespace-nowrap rounded-md border border-amber-300 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
            >
              全部捨棄
            </button>
            <Button size="sm" pending={saving} pendingText="儲存中…" onClick={handleSave}>
              儲存全部變更
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            result.errors.length > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          已儲存 {result.saved} 處變更
          {result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-ink/40">
        顯示 {filtered.length} / {rows.length} 筆
      </p>

      {/* min-w-max：表格取自己的自然寬度，容器負責左右捲動。
          先前是 w-full，表格會被壓到容器寬度，欄位互相擠壓、文字換行，手機上尤其明顯。 */}
      <div
        ref={scrollerRef}
        onScroll={() => syncScroll("table")}
        className={`overflow-x-auto rounded-lg border border-brand-100 bg-white ${
          // 有代理捲軸時把原生那條藏起來，否則畫面上會有兩條長得一樣、功能也一樣的拉桿
          // （一條在表格底部隨頁面捲動、一條黏在螢幕最下方），看起來像壞掉。
          // 只是視覺隱藏，容器仍然可捲：觸控滑動、Shift+滾輪、鍵盤都照常。
          overflowing ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""
        }`}
      >
        <table ref={tableRef} className="w-full min-w-max text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-left text-xs text-ink/60">
            <tr>
              <th className="sticky left-0 z-10 whitespace-nowrap bg-brand-50 px-3 py-2 font-medium">研究編號</th>
              {withNames && <th className="whitespace-nowrap px-3 py-2 font-medium">姓名</th>}
              {columns.map((c) => (
                <th key={String(c.key)} className="whitespace-nowrap px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2 font-medium">部位</th>
              {showAllColumns && (
                <>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">治療</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">照片</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">待辦時程</th>
                </>
              )}
              <th className="whitespace-nowrap px-3 py-2 font-medium">待補</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">詳細</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-brand-50 last:border-0 hover:bg-brand-50/30">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5">
                  <Link href={`/cases/${row.id}`} className="font-data text-xs text-brand-800 underline">
                    {row.research_id}
                  </Link>
                </td>
                {withNames && (
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink/80">
                    <PatientName researchId={row.research_id} />
                  </td>
                )}
                {columns.map((col) => {
                  const key = editKey(row.id, String(col.key));
                  const dirty = edits.has(key);
                  const value = valueOf(row, col.key);
                  const cls = `${col.width} max-w-none rounded border px-1.5 py-1 text-xs ${
                    col.kind === "int" ? NUMBER_INPUT_RESET : ""
                  } ${dirty ? "border-amber-400 bg-amber-50" : "border-brand-100"}`;
                  return (
                    <td key={String(col.key)} className="whitespace-nowrap px-2 py-1">
                      {col.kind === "sex" || col.kind === "recurrence" ? (
                        <select value={value} onChange={(e) => setValue(row, col.key, e.target.value)} className={cls}>
                          {(col.kind === "sex" ? SEX_OPTIONS : RECURRENCE_OPTIONS).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={col.kind === "date" ? "date" : col.kind === "int" ? "number" : "text"}
                          value={value}
                          onChange={(e) => setValue(row, col.key, e.target.value)}
                          className={cls}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-ink/60">
                  {row.body_site || "—"}
                  {row.lesionUnclassified > 0 && (
                    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                      {row.lesionUnclassified} 未分類
                    </span>
                  )}
                </td>
                {showAllColumns && (
                  <>
                    <td className="whitespace-nowrap px-3 py-1.5 text-center font-data text-xs text-ink/50">{row.treatmentCount}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-center font-data text-xs text-ink/50">{row.photoCount}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-center font-data text-xs text-ink/50">{row.pendingScheduleCount}</td>
                  </>
                )}
                <td className="whitespace-nowrap px-3 py-1.5 text-center">
                  {row.pendingCompletenessCount > 0 ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-data text-xs text-amber-700">
                      {row.pendingCompletenessCount}
                    </span>
                  ) : (
                    <span className="text-xs text-ink/30">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setDrawerCaseId(row.id)}
                    className="rounded border border-brand-200 px-2 py-0.5 text-xs text-brand-800 hover:bg-brand-50"
                  >
                    詳細
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length + 6} className="px-3 py-6 text-center text-sm text-ink/40">
                  沒有符合條件的個案
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 黏在螢幕最下方的代理捲軸。sticky 的容器是外層那個 div，所以捲到表格範圍以外時
          它會停在原位，不會一直懸浮在頁尾。用 overflow-x-scroll（不是 auto）讓拉桿恆常可見。 */}
      {overflowing && (
        <div
          ref={proxyRef}
          onScroll={() => syncScroll("proxy")}
          aria-hidden
          className="sticky bottom-0 z-30 -mt-3 overflow-x-scroll rounded-b-lg border-x border-b border-brand-100 bg-white/95 shadow-[0_-2px_6px_rgba(0,0,0,0.06)] backdrop-blur"
        >
          <div style={{ width: scrollMetrics.scrollWidth, height: 1 }} />
        </div>
      )}

      {drawerCaseId && <CaseDrawer caseId={drawerCaseId} onClose={() => setDrawerCaseId(null)} />}
    </div>
  );
}
