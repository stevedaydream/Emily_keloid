"use client";

import { useState } from "react";
import Spinner from "@/components/ui/Spinner";
import { registerVisitAtScheduleItemAction } from "./actions";

/**
 * 追蹤時程某一列底下的「登記本次回診」（2026-08-26 助理要求：
 * 後面每次回診的治療紀錄跟追蹤時程放在一起 key）。
 *
 * 欄位刻意跟回診動線的 RegisterVisitForm 一致（治療方式複選／症狀變化／復發／抽血）——
 * 同一件事在系統裡有兩個入口，欄位不一樣的話兩邊收到的資料就對不起來。
 * 劑量、套組那些細節仍到上方的完整治療表單補。
 */

const FOLLOWUP_ONLY_TYPE = "追蹤（無治療）";

type Option = { id: string; label: string };
type Lesion = { id: string; site_no: number | null; body_site: string };

export default function ScheduleVisitForm({
  caseId,
  itemId,
  today,
  lesions,
  symptomOptions,
  treatmentTypes,
  /** 這一列有問卷／拍照動作卻還沒有對應紀錄時，登記前要先確認一次（見 pendingWarnings） */
  pendingWarnings,
}: {
  caseId: string;
  itemId: string;
  today: string;
  lesions: Lesion[];
  symptomOptions: Option[];
  treatmentTypes: { id: string; name: string }[];
  pendingWarnings: string[];
}) {
  // 「實際回診日」預帶今天而不是該列的到期日：到期日是範本算出來的預估值，
  // 病人晚兩週才來是常態。治療紀錄的日期決定它落到 FW 的哪一格，取錯格就整排錯位。
  const [visitDate, setVisitDate] = useState(today);
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [symptomId, setSymptomId] = useState("");
  const [recurrence, setRecurrence] = useState(false);
  const [blood, setBlood] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherTypes = treatmentTypes.filter((t) => t.name !== FOLLOWUP_ONLY_TYPE);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("case_id", caseId);
      fd.set("item_id", itemId);
      fd.set("visit_date", visitDate);
      for (const id of typeIds) fd.append("type_ids", id);
      // 部位一律全帶：一次回診看的是這位病人所有病灶，逐顆勾在門診現場只是多按幾下
      for (const l of lesions) fd.append("lesion_ids", l.id);
      if (recurrence) fd.set("recurrence_observed", "on");
      if (blood) fd.set("blood_drawn", "on");
      if (symptomId) fd.set("symptom_change_option_id", symptomId);
      await registerVisitAtScheduleItemAction(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登記失敗");
      setSaving(false);
      setConfirming(false);
    }
  }

  function onRegister() {
    // 這一列還有問卷／拍照沒做時先問一次。擋得住誤按，但不擋真的不用做的情況——
    // 這正是文件抱怨的來源：列被標成已完成，問卷其實沒填，然後就再也打不開了。
    if (pendingWarnings.length > 0) setConfirming(true);
    else void submit();
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-brand-100 bg-paper-sunken p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-ink/50">實際回診日</label>
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className="mt-0.5 rounded-md border border-brand-200 px-2 py-1 text-sm"
          />
        </div>
        <p className="pb-1 text-xs text-ink/40">病人實際來的那天，不是範本算出來的到期日。</p>
      </div>

      <div>
        <p className="text-xs text-ink/60">
          本次有做哪些治療？<span className="text-ink/40">都沒做就不用勾，會記成「{FOLLOWUP_ONLY_TYPE}」。</span>
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {otherTypes.map((t) => {
            const on = typeIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeIds((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                className={`rounded border px-2 py-1 text-xs ${
                  on ? "border-brand-600 bg-brand-50 text-brand-900" : "border-brand-200 bg-white text-ink/70"
                }`}
              >
                {on ? "✓ " : ""}
                {t.name}
              </button>
            );
          })}
        </div>
        {typeIds.length > 0 && (
          <p className="mt-1 text-xs text-amber-700">劑量、套組等細節欄位這裡不收，登記後請到上方「術前治療與收案當次手術」的表單補。</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          跟上次比，症狀變化？
          <select
            value={symptomId}
            onChange={(e) => setSymptomId(e.target.value)}
            className="rounded-md border border-brand-200 px-2 py-1 text-xs"
          >
            <option value="">（未評估）</option>
            {symptomOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink/70">
          <input type="checkbox" checked={recurrence} onChange={(e) => setRecurrence(e.target.checked)} />
          本次觀察到復發
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink/70">
          <input type="checkbox" checked={blood} onChange={(e) => setBlood(e.target.checked)} />
          此次有抽血
        </label>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {confirming ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
          <p className="text-xs text-amber-900">
            這一列的{pendingWarnings.join("、")}還沒完成，登記後這一列會標成「已完成」。確定嗎？
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-brand-200 bg-white px-3 py-1 text-xs text-ink/60"
            >
              取消，先去補
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              {saving ? "登記中…" : "確定登記"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRegister}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {saving && <Spinner className="h-3.5 w-3.5" />}
          {saving ? "登記中…" : "登記本次回診"}
        </button>
      )}
    </div>
  );
}
