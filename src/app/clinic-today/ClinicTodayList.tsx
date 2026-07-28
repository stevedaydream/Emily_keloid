"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { useLocalNames } from "@/components/LocalNameProvider";
import { lookupCaseIdByResearchId } from "@/app/local-tools/mrn-mapping/actions";
import ClinicCard from "./ClinicCard";

type AutoEntry = {
  caseId: string;
  researchId: string;
  dueCount: number;
  overdueCount: number;
  earliestDue: string;
};

// 手動加入的名單只存在瀏覽器本機、且只在當天有效——「今天誰來看診」是門診現場的暫時狀態，
// 不是研究資料，沒必要寫進資料庫（也就不用多一張表）。
const STORAGE_KEY = "keloid_clinic_today";

type Stored = { date: string; caseIds: string[] };

export default function ClinicTodayList({ auto, today }: { auto: AutoEntry[]; today: string }) {
  const { names, showNames } = useLocalNames();
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setAdding(true);
    setError(null);
    try {
      // 先在本機對照表用姓名換研究編號（姓名不會送到伺服器），再用研究編號查個案 id
      let researchId = q;
      const lower = q.toLowerCase();
      for (const [rid, name] of names) {
        if (name.toLowerCase().includes(lower)) {
          researchId = rid;
          break;
        }
      }
      const caseId = await lookupCaseIdByResearchId(researchId);
      if (!caseId) {
        setError(`找不到「${q}」對應的個案（請確認研究編號，或該病人是否已建檔）`);
        return;
      }
      if (autoIds.has(caseId) || manualIds.includes(caseId)) {
        setError("這位病人已經在今日清單中");
        return;
      }
      persist([...manualIds, caseId]);
      setQuery("");
    } finally {
      setAdding(false);
    }
  }

  const entries = [
    ...auto.map((a) => ({ caseId: a.caseId, badge: a, manual: false })),
    ...manualIds.filter((id) => !autoIds.has(id)).map((id) => ({ caseId: id, badge: null, manual: true })),
  ];

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-white p-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-ink/60">
            加入病人{showNames ? "（研究編號或姓名）" : "（研究編號）"}
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如 YAN-2024-003"
            className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
        </div>
        <Button type="submit" size="sm" pending={adding} pendingText="加入中…">
          加入今日清單
        </Button>
      </form>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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
