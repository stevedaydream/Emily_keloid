"use client";

import { useState } from "react";
import Spinner from "@/components/ui/Spinner";
import { addTreatmentRecordAction, markScheduleItemAction } from "../actions";

/**
 * 「登記本次回診」——整條動線最重要的一步。
 *
 * 一次回診在資料上就是一筆 treatment_records（匯出的 FW1–FW24 是拿它依日期推出來的）。
 * 只看一看就讓病人走，那次回診在匯出檔裡等於沒發生，復發與症狀變化也一起消失。
 * 所以這裡預設就幫人員勾好「追蹤（無治療）」，有做別的治療再另外勾——
 * 讓「什麼都沒做」也留得下一筆紀錄，而不是靠人記得去勾那個核取方塊。
 */
const FOLLOWUP_ONLY_TYPE = "追蹤（無治療）";

type Option = { id: string; label: string };
type Lesion = { id: string; site_no: number | null; body_site: string };

export default function RegisterVisitForm({
  caseId,
  today,
  monthIndex,
  lesions,
  symptomOptions,
  treatmentTypes,
}: {
  caseId: string;
  today: string;
  monthIndex: number | null;
  lesions: Lesion[];
  symptomOptions: Option[];
  treatmentTypes: { id: string; name: string }[];
}) {
  const followupType = treatmentTypes.find((t) => t.name === FOLLOWUP_ONLY_TYPE);
  const otherTypes = treatmentTypes.filter((t) => t.name !== FOLLOWUP_ONLY_TYPE);

  const [extraTypeIds, setExtraTypeIds] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState(false);
  const [symptomId, setSymptomId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("case_id", caseId);
      fd.set("treatment_date", today);
      // 有做別的治療就記那些；什麼都沒做才記「追蹤（無治療）」——
      // 兩者都記會讓同一天長出一筆意義重複的紀錄，匯出的當次治療欄位也會打架。
      const ids = extraTypeIds.length > 0 ? extraTypeIds : followupType ? [followupType.id] : [];
      if (ids.length === 0) throw new Error("後台找不到「追蹤（無治療）」治療類型，請先到治療方式管理建立");
      for (const id of ids) fd.append("type_ids", id);
      for (const l of lesions) fd.append("lesion_ids", l.id);
      if (recurrence) fd.set("recurrence_observed", "on");
      if (symptomId) fd.set("symptom_change_option_id", symptomId);
      await addTreatmentRecordAction(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登記失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-ink/60">
        回診日期：<b className="font-data text-ink">{today}</b>
        {monthIndex !== null && <span className="ml-2 text-ink/50">（術後第 {monthIndex} 個月）</span>}
      </p>

      <div>
        <p className="text-base font-medium text-ink">本次有做哪些治療？</p>
        <p className="mt-0.5 text-sm text-ink/50">都沒做就不用勾，系統會記成「{FOLLOWUP_ONLY_TYPE}」。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {otherTypes.map((t) => {
            const on = extraTypeIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setExtraTypeIds((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                className={`min-h-12 rounded-lg border-2 px-4 text-base ${
                  on ? "border-brand-600 bg-brand-50 text-brand-900" : "border-brand-200 bg-white text-ink/70"
                }`}
              >
                {on ? "✓ " : ""}
                {t.name}
              </button>
            );
          })}
        </div>
        {extraTypeIds.length > 0 && (
          <p className="mt-1.5 text-sm text-amber-700">
            劑量、套組等細節欄位這裡不收，登記後請到個案頁的治療紀錄補。
          </p>
        )}
      </div>

      <div>
        <p className="text-base font-medium text-ink">跟上次比，症狀變化？</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {symptomOptions.map((o) => {
            const on = symptomId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSymptomId(on ? "" : o.id)}
                className={`min-h-12 rounded-lg border-2 px-4 text-base ${
                  on ? "border-brand-600 bg-brand-50 text-brand-900" : "border-brand-200 bg-white text-ink/70"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-brand-200 px-4 text-base text-ink/80">
        <input type="checkbox" checked={recurrence} onChange={(e) => setRecurrence(e.target.checked)} className="h-5 w-5" />
        本次觀察到復發
      </label>

      {error && <p className="rounded-lg border-2 border-red-200 bg-red-50 p-3 text-base text-red-700">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xl font-medium text-white disabled:opacity-60"
      >
        {saving ? (
          <>
            <Spinner className="h-5 w-5" />
            登記中…
          </>
        ) : (
          "登記本次回診"
        )}
      </button>
    </div>
  );
}

/** 收尾那一步用的：把一筆待辦時程標記完成。 */
export function CompleteScheduleItem({ caseId, itemId }: { caseId: string; itemId: string }) {
  return (
    <form action={markScheduleItemAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="status" value="done" />
      <button type="submit" className="min-h-10 whitespace-nowrap rounded-lg border-2 border-brand-200 px-3 text-sm text-brand-700">
        標記完成
      </button>
    </form>
  );
}
