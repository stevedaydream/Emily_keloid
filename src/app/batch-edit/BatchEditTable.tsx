"use client";

import { useEffect, useMemo, useState } from "react";
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
const COMPACT_COLUMNS: Column[] = [
  { key: "sex", label: "性別", kind: "sex", width: "w-20" },
  { key: "age_at_enrollment", label: "年齡", kind: "int", width: "w-16" },
  { key: "phone_number", label: "手機", kind: "text", width: "w-32" },
  { key: "consent_signed_at", label: "同意書日期", kind: "date", width: "w-36" },
  { key: "jsw_score", label: "JSW score", kind: "text", width: "w-28" },
];

const EXTRA_COLUMNS: Column[] = [
  { key: "recurrence_status", label: "復發狀態", kind: "recurrence", width: "w-28" },
  { key: "recurrence_date", label: "復發日期", kind: "date", width: "w-36" },
  { key: "followup_cutoff_date", label: "最後追蹤日", kind: "date", width: "w-36" },
  { key: "notes", label: "備註", kind: "text", width: "w-48" },
];

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

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-left text-xs text-ink/60">
            <tr>
              <th className="sticky left-0 z-10 bg-brand-50 px-3 py-2 font-medium">研究編號</th>
              {withNames && <th className="px-3 py-2 font-medium">姓名</th>}
              {columns.map((c) => (
                <th key={String(c.key)} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">部位</th>
              {showAllColumns && (
                <>
                  <th className="px-3 py-2 font-medium">治療</th>
                  <th className="px-3 py-2 font-medium">照片</th>
                  <th className="px-3 py-2 font-medium">待辦時程</th>
                </>
              )}
              <th className="px-3 py-2 font-medium">待補</th>
              <th className="px-3 py-2 font-medium">詳細</th>
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
                  const cls = `w-full rounded border px-1.5 py-1 text-xs ${
                    dirty ? "border-amber-400 bg-amber-50" : "border-brand-100"
                  }`;
                  return (
                    <td key={String(col.key)} className={`px-2 py-1 ${col.width}`}>
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
                    <td className="px-3 py-1.5 text-center font-data text-xs text-ink/50">{row.treatmentCount}</td>
                    <td className="px-3 py-1.5 text-center font-data text-xs text-ink/50">{row.photoCount}</td>
                    <td className="px-3 py-1.5 text-center font-data text-xs text-ink/50">{row.pendingScheduleCount}</td>
                  </>
                )}
                <td className="px-3 py-1.5 text-center">
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

      {drawerCaseId && <CaseDrawer caseId={drawerCaseId} onClose={() => setDrawerCaseId(null)} />}
    </div>
  );
}
