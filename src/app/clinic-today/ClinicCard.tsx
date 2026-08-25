"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import PatientName from "@/components/LocalNameProvider";
import { DOSE_CATEGORY_LABEL } from "@/lib/bodyZones";
import { getClinicCaseAction, saveClinicCardAction, type ClinicCaseData } from "./actions";
import { updateScheduleItemDateAction } from "@/app/cases/[id]/actions";

// 一位病人一張卡片：基本資料 ＋ 當次治療／追蹤紀錄 ＋ 標記時程完成，一次送出。
// 問卷和拍照只放連結——拍照要用手機相機、問卷是完整量表（JSS 12 題、SF-36 36 題），塞進卡片會讓卡片變成一頁長。
export default function ClinicCard({
  caseId,
  manual,
  dueBadge,
  onRemove,
}: {
  caseId: string;
  manual: boolean;
  dueBadge: string | null;
  onRemove?: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<ClinicCaseData | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  // 改期是獨立於卡片主表單的小動作：病人離開前拿到回診單就順手改，不必等整張卡片送出
  const [dateEdits, setDateEdits] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);

  async function saveDate(itemId: string) {
    const value = dateEdits[itemId];
    if (!value) return;
    setSavingDate(itemId);
    try {
      const fd = new FormData();
      fd.set("case_id", caseId);
      fd.set("item_id", itemId);
      fd.set("due_date", value);
      // 在門診改期＝這次回診是約好的，預設要提醒
      fd.set("remind", "on");
      await updateScheduleItemDateAction(fd);
      await load();
      router.refresh();
    } finally {
      setSavingDate(null);
    }
  }

  const load = useCallback(async () => {
    setData(await getClinicCaseAction(caseId));
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const res = await saveClinicCardAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.ok) {
        setSelectedTypes([]);
        await load();
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <div className="rounded-lg border border-brand-100 bg-white p-4 text-sm text-ink/40">載入中…</div>;
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-brand-100 bg-white p-4">
      <input type="hidden" name="case_id" value={caseId} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-brand-50 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/cases/${caseId}`} className="font-data text-sm font-medium text-brand-800 underline">
            {data.research_id}
          </Link>
          <PatientName name={data.patient_name} className="text-sm text-ink/80" />
          <span className="text-xs text-ink/40">{data.doctor}</span>
          {dueBadge && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{dueBadge}</span>}
          {manual && <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">手動加入</span>}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-ink/40 underline hover:text-red-600">
            從今日清單移除
          </button>
        )}
      </div>

      {/* 病人一走，長寬高就再也補不回來（照片裡的尺沒有被程式讀出來過，見決策 #3），
          所以缺什麼要在門診卡片最上面攔住人，不是等到之後看報表才發現（決策 2026-08-20）。 */}
      {data.measureBlockers.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">⚠️ 病人離開前要完成：</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
            {data.measureBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <Link
            href={`/cases/${caseId}/clinic-flow`}
            className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white"
          >
            前往量測與拍照 →
          </Link>
        </div>
      )}

      {/* 回診動線入口（決策 2026-08-20）。已登記手術＝進入追蹤期才出現。
          卡片上只放進度與入口，實際操作在 /cases/[id]/visit-flow——
          那頁是平板尺寸、一次做一件事，卡片是桌機密集版，兩者用途不同。 */}
      {data.inFollowup && (
        <div
          className={`mb-3 rounded-md border p-3 ${
            data.visitRegistered && data.visitTodos.length === 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-brand-200 bg-brand-50/40"
          }`}
        >
          <p className="text-sm font-semibold text-ink/80">
            本次回診
            {data.monthIndex !== null && <span className="ml-1.5 font-normal text-ink/50">術後第 {data.monthIndex} 個月</span>}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            <li className={data.visitRegistered ? "text-emerald-700" : "text-amber-800"}>
              {data.visitRegistered ? "✓ 已登記回診" : "☐ 尚未登記回診（沒登記＝匯出檔視同沒回診）"}
            </li>
            {data.visitTodos.map((t) => (
              <li key={t} className="text-amber-800">
                ☐ {t}
              </li>
            ))}
            {data.visitRegistered && data.visitTodos.length === 0 && (
              <li className="text-emerald-700">✓ {data.postOp ? "拍照已完成" : "量測與拍照已完成"}</li>
            )}
            {/* 追蹤時間點（助理 2026-08-24）：只有滿 1／6／12 個月那三次要測量表，
                不講出來的話人員會以為每次回診都要測（或每次都不用測）。 */}
            {data.timepointLabel && (
              <li className="text-amber-800">☐ 本次是{data.timepointLabel}：要測 JSS ＋ SF-36 ＋ PSQI</li>
            )}
          </ul>
          <Link
            href={`/cases/${caseId}/visit-flow`}
            className="mt-2 inline-block rounded-md bg-brand-700 px-3 py-1.5 text-sm text-white hover:bg-brand-800"
          >
            {data.visitRegistered ? "繼續本次回診 →" : "開始回診 →"}
          </Link>
        </div>
      )}

      {/* 基本資料：主任只負責建檔，這些多半是門診當下由護理師/助理補的 */}
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <label className="block text-xs text-ink/60">性別</label>
          <select name="sex" defaultValue={data.sex} className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm">
            <option value="">未填</option>
            <option value="M">男</option>
            <option value="F">女</option>
            <option value="other">其他</option>
            <option value="unknown">不明</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink/60">年齡</label>
          <input
            type="number"
            name="age_at_enrollment"
            defaultValue={data.age_at_enrollment ?? ""}
            className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink/60">手機</label>
          <input name="phone_number" defaultValue={data.phone_number} className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-ink/60">JSW score</label>
          <input name="jsw_score" defaultValue={data.jsw_score} className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
        </div>
      </div>

      {/* 當次治療／追蹤紀錄 */}
      <div className="mt-3 rounded-md border border-brand-100 bg-brand-50/30 p-3">
        <p className="mb-1 text-xs font-semibold text-ink/70">當次治療／追蹤紀錄（沒有要登記就留空）</p>
        <div className="flex flex-wrap gap-2">
          {data.treatmentTypes.map((t) => (
            <label key={t.id} className="flex items-center gap-1 whitespace-nowrap rounded border border-brand-200 bg-white px-2 py-1 text-xs">
              <input
                type="checkbox"
                name="type_ids"
                value={t.id}
                checked={selectedTypes.includes(t.id)}
                onChange={() =>
                  setSelectedTypes((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]))
                }
              />
              {t.name}
            </label>
          ))}
        </div>

        {selectedTypes.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-ink/60">治療／追蹤日期</label>
                <input
                  type="date"
                  name="treatment_date"
                  defaultValue={today}
                  required
                  className="mt-1 rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-ink/60">其他部位（未登記在病灶清單者）</label>
                <input name="body_site" className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-ink/60">部位（可複選，各建一筆紀錄）</label>
              {data.lesions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.lesions.map((l) => (
                    <label key={l.id} className="flex items-center gap-1 whitespace-nowrap rounded border border-brand-200 bg-white px-2 py-1 text-xs">
                      <input type="checkbox" name="lesion_ids" value={l.id} />
                      部位{l.site_no} {l.body_site}
                      <span className={l.doseCategory ? "text-ink/40" : "text-amber-600"}>
                        （{l.doseCategory ? DOSE_CATEGORY_LABEL[l.doseCategory] : "未指定分類"}）
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink/40">此個案尚未登記病灶部位</p>
              )}
              <p className="mt-1 text-[11px] text-amber-700">
                勾「手術切除」送出後，會為每個已指定分類的部位各產生一組放療排程。
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-ink/60">
              <label className="flex items-center gap-1">
                <input type="checkbox" name="recurrence_observed" /> 觀察到復發
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" name="blood_drawn" /> 此次有抽血
              </label>
            </div>
            <input
              name="recurrence_description"
              placeholder="復發情形描述（選填）"
              className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
            <p className="text-[11px] text-ink/40">
              需要填治療套組、劑量等細節欄位時，請到完整個案頁登打。
            </p>
          </div>
        )}
      </div>

      {/* 這次回診該做的事 */}
      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold text-ink/70">待辦時程</p>
        <ul className="space-y-1">
          {data.scheduleItems.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-brand-100 px-2 py-1.5 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" name="done_item_ids" value={item.id} />
                標記完成
              </label>
              <span className={item.due_date < today ? "text-red-600" : "text-ink/70"}>
                {item.due_date} ・ {item.label}
              </span>
              {(item.actions ?? []).includes("questionnaire") && item.questionnaire_id && (
                <Link href={`/patient/${caseId}/questionnaire/${item.id}`} className="text-brand-700 underline">
                  填問卷
                </Link>
              )}
              {(item.actions ?? []).includes("photo") && (
                <Link href={`/patient/${caseId}/photo/${item.id}`} className="text-brand-700 underline">
                  拍照
                </Link>
              )}
              {/* 改期：病人離開前拿到回診單，那個日期才是真的。改了 LINE 提醒才會在對的日子送。
                  這是獨立的小表單，跟卡片主表單分開送出——改期通常是「順手」而不是整張卡片一起。 */}
              <span className="ml-auto flex items-center gap-1">
                <input
                  type="date"
                  defaultValue={item.due_date ?? ""}
                  onChange={(e) => setDateEdits((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="rounded border border-brand-200 px-1 py-0.5 text-xs"
                  aria-label="實際回診日"
                />
                {dateEdits[item.id] && dateEdits[item.id] !== item.due_date && (
                  <button
                    type="button"
                    onClick={() => void saveDate(item.id)}
                    disabled={savingDate === item.id}
                    className="rounded border border-accent-300 bg-accent-50 px-1.5 py-0.5 text-xs text-accent-800 disabled:opacity-50"
                  >
                    {savingDate === item.id ? "儲存中…" : "改期"}
                  </button>
                )}
              </span>
            </li>
          ))}
          {data.scheduleItems.length === 0 && <li className="text-xs text-ink/40">沒有待辦時程項目</li>}
        </ul>
        <div className="mt-1 flex gap-3 text-xs">
          <Link href={`/patient/${caseId}/questionnaire`} className="text-brand-700 underline">
            臨時填問卷
          </Link>
          <Link href={`/patient/${caseId}/photo`} className="text-brand-700 underline">
            臨時拍照
          </Link>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-brand-50 pt-3">
        <Button type="submit" pending={saving} pendingText="儲存中…">
          儲存這位病人
        </Button>
        {result && (
          <span className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</span>
        )}
      </div>
    </form>
  );
}
