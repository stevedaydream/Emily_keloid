"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { useLocalNames } from "@/components/LocalNameProvider";
import ClinicCard from "./ClinicCard";

type AutoEntry = {
  caseId: string;
  researchId: string;
  dueCount: number;
  overdueCount: number;
  earliestDue: string;
};

export type SearchableCase = {
  caseId: string;
  researchId: string;
  bodySite: string;
  enrollmentYear: number | null;
  dataSource: string;
  doctor: string;
};

// 一次最多列這麼多筆：打「yen」會命中幾十筆，全列出來反而找不到人。
// 超過就提示縮小範圍，而不是安靜截斷。
const MAX_RESULTS = 20;

// 比對前把大小寫與連字號/空白抹平，讓「yen2024」也搜得到「YEN-2024-003」。
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s-]/g, "");
}

// 手動加入的名單只存在瀏覽器本機、且只在當天有效——「今天誰來看診」是門診現場的暫時狀態，
// 不是研究資料，沒必要寫進資料庫（也就不用多一張表）。
const STORAGE_KEY = "keloid_clinic_today";

type Stored = { date: string; caseIds: string[] };

export default function ClinicTodayList({
  auto,
  today,
  searchable,
}: {
  auto: AutoEntry[];
  today: string;
  searchable: SearchableCase[];
}) {
  const { names, showNames } = useLocalNames();
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Stored;
      if (parsed.date === today) setManualIds(parsed.caseIds ?? []);
      else window.localStorage.removeItem(STORAGE_KEY); // 隔天自動清空
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [today]);

  const persist = useCallback(
    (ids: string[]) => {
      setManualIds(ids);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, caseIds: ids } satisfies Stored));
    },
    [today]
  );

  const autoIds = useMemo(() => new Set(auto.map((a) => a.caseId)), [auto]);
  const inListIds = useMemo(() => new Set([...autoIds, ...manualIds]), [autoIds, manualIds]);

  // 全部比對都在瀏覽器內做（見 page.tsx 的說明）：關鍵字可能是病人姓名，
  // 而姓名只存在本機對照表，送去伺服器搜尋就等於把姓名送上雲端。
  const matches = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    const hits = searchable.filter((c) => {
      // 姓名只在使用者開著「顯示姓名」時才納入比對，跟 PatientName 的行為一致
      // （投影或有訪客時關掉，就不該還能用姓名搜到人）。
      const name = showNames ? names.get(c.researchId) ?? "" : "";
      const haystack = normalize(
        [c.researchId, name, c.doctor, c.bodySite, c.enrollmentYear ?? "", c.dataSource].join(" ")
      );
      return haystack.includes(q);
    });
    // 已在清單中的排到後面，避免佔住前排位置
    return hits.sort((a, b) => Number(inListIds.has(a.caseId)) - Number(inListIds.has(b.caseId)));
  }, [query, searchable, names, showNames, inListIds]);

  const selectable = matches.filter((m) => !inListIds.has(m.caseId));
  const shown = matches.slice(0, MAX_RESULTS);
  const selectedCount = selected.size;

  function toggle(caseId: string) {
    if (inListIds.has(caseId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }

  function addSelected() {
    const toAdd = [...selected].filter((id) => !inListIds.has(id));
    if (toAdd.length === 0) return;
    persist([...manualIds, ...toAdd]);
    setSelected(new Set());
    setQuery("");
  }

  // 只有一筆結果時按 Enter 直接加入——最常見的情境是打完編號就想收工
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (selectedCount > 0) {
      addSelected();
      return;
    }
    if (selectable.length === 1) {
      persist([...manualIds, selectable[0].caseId]);
      setQuery("");
    }
  }

  const entries = [
    ...auto.map((a) => ({ caseId: a.caseId, badge: a, manual: false })),
    ...manualIds.filter((id) => !autoIds.has(id)).map((id) => ({ caseId: id, badge: null, manual: true })),
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand-100 bg-white p-3">
        <label className="block text-xs font-medium text-ink/60">
          加入病人（可打研究編號{showNames ? "、姓名" : ""}、醫師或部位；打「yen」會列出所有 YEN 的病人）
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(new Set());
            }}
            onKeyDown={handleKeyDown}
            placeholder="例如 yen、2024、王、楊醫師"
            className="min-w-0 flex-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-xs text-ink/40 underline">
              清除
            </button>
          )}
          <Button type="button" size="sm" onClick={addSelected} disabled={selectedCount === 0}>
            加入選取的 {selectedCount} 位
          </Button>
        </div>

        {query && (
          <div className="mt-2">
            {matches.length === 0 ? (
              <p className="rounded-md bg-brand-50 px-2 py-1.5 text-xs text-ink/50">
                找不到符合「{query}」的個案（試試只打編號的一部分，或確認該病人是否已建檔）
              </p>
            ) : (
              <>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
                  <span>
                    符合 {matches.length} 筆
                    {matches.length > MAX_RESULTS && `，以下顯示前 ${MAX_RESULTS} 筆——請再打細一點`}
                  </span>
                  {selectable.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(
                          selectedCount === selectable.length ? new Set() : new Set(selectable.map((s) => s.caseId))
                        )
                      }
                      className="underline hover:text-brand-700"
                    >
                      {selectedCount === selectable.length ? "取消全選" : `全選（${selectable.length} 位）`}
                    </button>
                  )}
                </div>
                <ul className="max-h-72 divide-y divide-brand-50 overflow-y-auto rounded-md border border-brand-100">
                  {shown.map((c) => {
                    const already = inListIds.has(c.caseId);
                    const name = showNames ? names.get(c.researchId) : null;
                    return (
                      <li key={c.caseId}>
                        <label
                          className={`flex items-center gap-2 px-2 py-1.5 text-sm ${
                            already ? "cursor-default bg-brand-50/40 text-ink/40" : "cursor-pointer hover:bg-brand-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(c.caseId)}
                            disabled={already}
                            onChange={() => toggle(c.caseId)}
                          />
                          <span className="font-data whitespace-nowrap">{c.researchId}</span>
                          {name && <span className="whitespace-nowrap">{name}</span>}
                          <span className="truncate text-xs text-ink/40">
                            {[c.doctor, c.bodySite].filter(Boolean).join(" ・ ")}
                          </span>
                          {already && (
                            <span className="ml-auto whitespace-nowrap text-xs text-ink/40">已在清單中</span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-brand-200 p-6 text-center text-sm text-ink/40">
          今天沒有到期或逾期的追蹤項目。有病人回診時，用上方欄位把他加進來即可。
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <ClinicCard
              key={entry.caseId}
              caseId={entry.caseId}
              manual={entry.manual}
              dueBadge={
                entry.badge
                  ? `${entry.badge.dueCount} 項待辦${entry.badge.overdueCount > 0 ? `（${entry.badge.overdueCount} 項逾期）` : ""}`
                  : null
              }
              onRemove={entry.manual ? () => persist(manualIds.filter((id) => id !== entry.caseId)) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
