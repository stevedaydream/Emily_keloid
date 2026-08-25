"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SubmitButton from "@/components/ui/SubmitButton";
import PatientName from "@/components/LocalNameProvider";
import FamilyHistoryPicker from "@/app/cases/[id]/FamilyHistoryPicker";
import PriorTreatmentPicker from "@/app/cases/[id]/PriorTreatmentPicker";
import MultiEntryInput from "@/app/cases/[id]/MultiEntryInput";
import { DOSE_CATEGORY_LABEL, BODY_VIEW_LABEL, type BodyView } from "@/lib/bodyZones";
import { onsetDateToMonth } from "@/lib/onsetMonth";
import { updateKeloidLesionZoneAction, deleteKeloidLesionAction, addKeloidLesionAction } from "@/app/cases/[id]/actions";
import { getCaseDetailAction, updateCaseNarrativeAction } from "./actions";

type Detail = Awaited<ReturnType<typeof getCaseDetailAction>>;

const VIEW_ORDER: BodyView[] = ["front", "back", "head"];

// 右側抽屜：處理表格塞不下的東西（病灶這種一對多、家族史/prior_* 這種有專用輸入元件的欄位），
// 外加唯讀的脈絡資訊（照片、最近治療、放療進度、待辦時程）——批次補資料時常常要「看一眼才敢填」。
// 刻意不動表格捲動位置：關掉抽屜後游標還在原來那一列，可以直接往下一筆。
export default function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getCaseDetailAction(caseId));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Esc 關閉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function afterMutation() {
    await load();
    router.refresh(); // 讓表格的統計欄（未分類病灶數等）跟著更新
  }

  const c = detail?.caseRow;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-paper-raised shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-brand-100 bg-paper-raised px-4 py-3">
          <div>
            <span className="font-data text-sm font-medium text-brand-900">{c?.research_id ?? "載入中…"}</span>
            {c?.patient_name && <PatientName name={c.patient_name} className="ml-2 text-sm text-ink/70" />}
          </div>
          <div className="flex items-center gap-2">
            {c && (
              <Link href={`/cases/${caseId}`} className="text-xs text-brand-700 underline">
                完整個案頁
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉"
              className="rounded p-1.5 text-ink/50 hover:bg-brand-50"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {loading || !detail || !c ? (
          <p className="p-4 text-sm text-ink/40">載入中…</p>
        ) : (
          <div className="space-y-4 p-4">
            {/* 病灶：可改分類、可刪、可新增（人形圖點選仍在個案頁，這裡用文字＋分類下拉） */}
            <section className="rounded-lg border border-brand-100 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-ink/80">病灶部位</h3>
              <ul className="space-y-2">
                {detail.lesions.map((l) => {
                  const zone = Array.isArray(l.body_part_zones) ? l.body_part_zones[0] : l.body_part_zones;
                  return (
                    <li key={l.id} className="rounded-md border border-brand-100 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink/80">
                          部位{l.site_no} {l.body_site}
                        </span>
                        <span className="text-ink/40">
                          {[l.length_cm, l.width_cm, l.height_cm].some((v) => v !== null)
                            ? `${l.length_cm ?? "—"} x ${l.width_cm ?? "—"} x ${l.height_cm ?? "—"} cm`
                            : "尺寸未填"}
                        </span>
                      </div>
                      <form action={updateKeloidLesionZoneAction} onSubmit={() => setTimeout(afterMutation, 600)} className="mt-1 flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="lesion_id" value={l.id} />
                        <select
                          name="body_part_zone_id"
                          defaultValue={l.body_part_zone_id ?? ""}
                          className="rounded border border-brand-200 px-1.5 py-0.5 text-xs"
                        >
                          <option value="">（未指定，不會自動排放療）</option>
                          {VIEW_ORDER.map((v) => {
                            const list = detail.zones.filter((z) => z.view === v);
                            if (list.length === 0) return null;
                            return (
                              <optgroup key={v} label={BODY_VIEW_LABEL[v]}>
                                {list.map((z) => (
                                  <option key={z.id} value={z.id}>
                                    {z.display_name}（{DOSE_CATEGORY_LABEL[z.dose_category]}）
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        {zone ? (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">
                            {DOSE_CATEGORY_LABEL[zone.dose_category]}
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">尚未指定分類</span>
                        )}
                        <SubmitButton variant="ghost" size="sm" className="!px-1 !py-0 text-xs underline" pendingText="儲存中…">
                          儲存
                        </SubmitButton>
                      </form>
                      <form action={deleteKeloidLesionAction} onSubmit={() => setTimeout(afterMutation, 600)} className="mt-1">
                        <input type="hidden" name="case_id" value={caseId} />
                        <input type="hidden" name="lesion_id" value={l.id} />
                        <SubmitButton variant="ghost" size="sm" className="!px-1 !py-0 text-xs text-red-500 underline" pendingText="刪除中…">
                          刪除此病灶
                        </SubmitButton>
                      </form>
                    </li>
                  );
                })}
                {detail.lesions.length === 0 && <li className="text-xs text-ink/40">尚未登記病灶</li>}
              </ul>

              <form action={addKeloidLesionAction} onSubmit={() => setTimeout(afterMutation, 600)} className="mt-2 flex flex-wrap items-end gap-1.5 border-t border-brand-50 pt-2">
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="body_part_zone_id" value="" />
                <input name="body_site" required placeholder="部位名稱" className="w-28 rounded border border-brand-200 px-1.5 py-1 text-xs" />
                <input name="length_cm" type="number" step="0.1" placeholder="長" className="w-14 rounded border border-brand-200 px-1.5 py-1 text-xs" />
                <input name="width_cm" type="number" step="0.1" placeholder="寬" className="w-14 rounded border border-brand-200 px-1.5 py-1 text-xs" />
                <input name="height_cm" type="number" step="0.1" placeholder="高" className="w-14 rounded border border-brand-200 px-1.5 py-1 text-xs" />
                <SubmitButton variant="outline" size="sm" pendingText="新增中…">
                  ＋ 新增病灶
                </SubmitButton>
                <p className="w-full text-[11px] text-ink/40">
                  新增後可在上方指定部位分類；要用人形圖點選部位請到完整個案頁。
                </p>
              </form>
            </section>

            {/* 病史與過往治療：沿用個案頁的專用輸入元件，避免打出格式不一致的自由文字 */}
            <section className="rounded-lg border border-brand-100 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-ink/80">病史與過往治療</h3>
              <form action={updateCaseNarrativeAction} onSubmit={() => setTimeout(afterMutation, 600)} className="space-y-2 text-sm">
                <input type="hidden" name="case_id" value={caseId} />
                <div>
                  <label className="block text-xs font-medium text-ink/70">蟹足腫初次發生時間（只到年月）</label>
                  <input
                    type="month"
                    name="keloid_onset_date"
                    defaultValue={onsetDateToMonth(c.keloid_onset_date)}
                    className="mt-1 w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/70">之前治療的醫師（可多位）</label>
                  <MultiEntryInput
                    name="prior_treatment_physician"
                    defaultValue={c.prior_treatment_physician}
                    placeholder="醫師姓名／院所"
                    addLabel="＋ 新增一位醫師"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/70">家族史</label>
                  <FamilyHistoryPicker
                    name="family_history"
                    title="選擇家族史"
                    options={detail.familyOptions}
                    defaultValue={c.family_history ?? ""}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/70">疾病史（一般病史）</label>
                  <FamilyHistoryPicker
                    name="disease_history"
                    title="選擇疾病史"
                    options={detail.familyOptions}
                    defaultValue={c.disease_history ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <PriorTreatmentPicker name="prior_steroid_treatment" label="之前類固醇注射治療" defaultValue={c.prior_steroid_treatment ?? ""} />
                  <PriorTreatmentPicker name="prior_tcm_treatment" label="之前中醫治療" defaultValue={c.prior_tcm_treatment ?? ""} />
                  <PriorTreatmentPicker name="prior_ogawa_patch" label="之前小川令貼布使用史" defaultValue={c.prior_ogawa_patch ?? ""} />
                  <PriorTreatmentPicker name="prior_radiation_treatment" label="之前放射線治療史" defaultValue={c.prior_radiation_treatment ?? ""} />
                </div>
                <SubmitButton pendingText="儲存中…">儲存病史與過往治療</SubmitButton>
              </form>
            </section>

            {/* 唯讀脈絡 */}
            <section className="rounded-lg border border-brand-100 bg-white p-3 text-xs">
              <h3 className="mb-2 text-sm font-semibold text-ink/80">參考資訊（唯讀）</h3>

              <p className="text-ink/60">
                放療進度：<span className="font-data">{detail.rtDone}/{detail.rtTotal}</span> 次
                {detail.rtTotal === 0 && <span className="ml-1 text-ink/40">（尚未排程）</span>}
              </p>

              <div className="mt-2">
                <p className="mb-1 text-ink/50">最近治療紀錄</p>
                <ul className="space-y-0.5 text-ink/70">
                  {detail.treatments.map((t) => {
                    const type = Array.isArray(t.treatment_types) ? t.treatment_types[0] : t.treatment_types;
                    return (
                      <li key={t.id}>
                        {t.treatment_date} ・ {type?.name ?? "—"}
                        {t.body_site ? ` ・ ${t.body_site}` : ""}
                        {t.recurrence_observed ? " ・ 觀察到復發" : ""}
                      </li>
                    );
                  })}
                  {detail.treatments.length === 0 && <li className="text-ink/40">尚無治療紀錄</li>}
                </ul>
              </div>

              <div className="mt-2">
                <p className="mb-1 text-ink/50">待處理時程</p>
                <ul className="space-y-0.5 text-ink/70">
                  {detail.pendingSchedule.map((s) => (
                    <li key={s.id}>
                      {s.due_date} ・ {s.label}
                    </li>
                  ))}
                  {detail.pendingSchedule.length === 0 && <li className="text-ink/40">無待處理項目</li>}
                </ul>
              </div>

              <div className="mt-2">
                <p className="mb-1 text-ink/50">傷口照片（最新 {detail.photos.length} 張）</p>
                {detail.photos.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1">
                    {detail.photos.map((p) => (
                      <a key={p.id} href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer" title={`${p.body_site ?? ""} ${p.taken_at?.slice(0, 10) ?? ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/photos/${p.id}?variant=thumb`}
                          alt={p.body_site ?? "傷口照片"}
                          className="aspect-square w-full rounded object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-ink/40">尚無照片</p>
                )}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
