"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BodyDiagram from "@/components/BodyDiagram";
import BigDecimalPad from "@/components/senior/BigDecimalPad";
import Spinner from "@/components/ui/Spinner";
import { DOSE_CATEGORY_LABEL, type BodyView } from "@/lib/bodyZones";
import { isMeasured, isPhotographed, lesionLabel, type LesionCheck } from "@/lib/clinicFlow";
import { updateKeloidLesionAction, deleteKeloidLesionAction, setLesionWaiverAction } from "../actions";

// 平板放大版的病灶量測（決策 2026-08-20）。個案頁的 KeloidLesionSection 是桌機密集版
// （text-xs、小輸入框），這一台平板剛從病人手上拿回來、護理師站著單手操作，
// 那個尺寸點不準。寫入走的是**同一組 server action**，所以兩邊的資料永遠一致，
// 差別只在觸控尺寸與一次只做一件事的動線。

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };

/**
 * 就地修改既有病灶的尺寸。**新增部位不走這裡**——點人形圖會直接進相機頁，
 * 部位由 uploadPhotoAction 依 zone 建立、尺寸跟照片一起送（見 startNew）。
 * 這個面板只服務「照片已經拍了，但尺寸要補或要改」的情況。
 */
type Draft = {
  lesionId: string;
  zoneId: string | null;
  siteName: string;
  length: string;
  width: string;
  height: string;
};

type Field = "length" | "width" | "height";
const FIELD_LABEL: Record<Field, string> = { length: "長", width: "寬", height: "高" };

export default function LesionMeasureFlow({
  caseId,
  lesions,
  zones,
  sex,
  photoOnly = false,
  backTo,
}: {
  caseId: string;
  lesions: LesionCheck[];
  zones: Zone[];
  sex?: string | null;
  /**
   * 只拍照、不量尺寸（術後回診）。尺寸只收術前 baseline——病灶已經切掉了，
   * 這時候量到的是疤痕，存進去會把 baseline 蓋掉（助理 2026-08-24）。
   * 所以量測的入口在這個模式下整個不出現，不是只給提示。
   */
  photoOnly?: boolean;
  /** 拍完照回哪一頁；預設回收案動線 */
  backTo?: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [field, setField] = useState<Field>("length");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiverFor, setWaiverFor] = useState<{ lesionId: string; kind: "measure" | "photo" } | null>(null);
  const router = useRouter();

  const zonesById = new Map(zones.map((z) => [z.id, z]));
  const backHere = backTo ?? `/cases/${caseId}/clinic-flow`;

  // 點人形圖直接進相機頁（2026-08-20 使用者要求）。原本是「點部位→在這頁填尺寸→再點拍照」，
  // 拍照鈕離當下的焦點太遠也不直覺。現在點下去就是相機，長寬高就在相機下方跟照片一起送，
  // 部位不存在時由 uploadPhotoAction 依 zone 自動建立，照片一定掛得上部位。
  function startNew(zone: Zone) {
    router.push(`/patient/${caseId}/photo?zone_key=${encodeURIComponent(zone.zone_key)}&next=${encodeURIComponent(backHere)}`);
  }

  function startEdit(l: LesionCheck, zoneId: string | null) {
    setDraft({
      lesionId: l.id,
      zoneId,
      siteName: l.body_site,
      length: l.length_cm != null ? String(l.length_cm) : "",
      width: l.width_cm != null ? String(l.width_cm) : "",
      height: l.height_cm != null ? String(l.height_cm) : "",
    });
    setField("length");
    setError(null);
  }

  async function save() {
    if (!draft || !draft.siteName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("case_id", caseId);
      fd.set("body_site", draft.siteName.trim());
      fd.set("length_cm", draft.length);
      fd.set("width_cm", draft.width);
      fd.set("height_cm", draft.height);
      fd.set("lesion_id", draft.lesionId);
      await updateKeloidLesionAction(fd);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── 已登記的部位 ─────────────────────────────── */}
      {lesions.length > 0 && (
        <ul className="space-y-2">
          {lesions.map((l) => {
            const measured = isMeasured(l);
            const shot = isPhotographed(l);
            const zoneId = zones.find((z) => z.display_name === l.body_site)?.id ?? null;
            return (
              <li key={l.id} className="rounded-xl border-2 border-brand-100 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-medium text-ink">{lesionLabel(l)}</span>
                  <span className="flex gap-1.5 text-sm">
                    {/* 術後只是把 baseline 拿出來對照（不能改），所以標成灰的、寫明是 baseline */}
                    <Badge ok={photoOnly ? true : measured} waived={photoOnly || l.measure_waived}>
                      {photoOnly
                        ? measured
                          ? `baseline ${l.length_cm}×${l.width_cm}×${l.height_cm} cm`
                          : "無術前尺寸"
                        : l.measure_waived
                          ? "免量測"
                          : measured
                            ? `${l.length_cm}×${l.width_cm}×${l.height_cm} cm`
                            : "尺寸未齊"}
                    </Badge>
                    <Badge ok={shot} waived={l.photo_waived}>
                      {l.photo_waived ? "免拍照" : shot ? `🖼 ${l.photoCount} 張` : "未拍照"}
                    </Badge>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {!photoOnly && (
                    <button
                      type="button"
                      onClick={() => startEdit(l, zoneId)}
                      className="min-h-12 flex-1 rounded-lg border-2 border-brand-200 px-4 text-base text-ink/80"
                    >
                      ✏️ 只改尺寸（不重拍）
                    </button>
                  )}
                  <Link
                    href={`/patient/${caseId}/photo?lesion_id=${l.id}&next=${encodeURIComponent(backHere)}`}
                    className="flex min-h-12 flex-1 items-center justify-center rounded-lg border-2 border-brand-200 px-4 text-base text-ink/80"
                  >
                    {photoOnly ? "📷 拍這個部位" : "📷 拍照＋量尺寸"}
                  </Link>
                </div>

                {/* 逃生口刻意做得比主要動作小、且要兩步（點開才看得到原因輸入格），
                    免得順手一按就把該量的部位標成免除。 */}
                {((!photoOnly && (!measured || l.measure_waived)) || !shot || l.photo_waived) && (
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {!photoOnly && (!measured || l.measure_waived) && (
                      <WaiverToggle
                        active={l.measure_waived}
                        open={waiverFor?.lesionId === l.id && waiverFor.kind === "measure"}
                        onOpen={() => setWaiverFor({ lesionId: l.id, kind: "measure" })}
                        onClose={() => setWaiverFor(null)}
                        caseId={caseId}
                        lesionId={l.id}
                        kind="measure"
                        label="此部位無法量測"
                      />
                    )}
                    {(!shot || l.photo_waived) && (
                      <WaiverToggle
                        active={l.photo_waived}
                        open={waiverFor?.lesionId === l.id && waiverFor.kind === "photo"}
                        onOpen={() => setWaiverFor({ lesionId: l.id, kind: "photo" })}
                        onClose={() => setWaiverFor(null)}
                        caseId={caseId}
                        lesionId={l.id}
                        kind="photo"
                        label="病人拒絕拍照"
                      />
                    )}
                    <form
                      action={deleteKeloidLesionAction}
                      onSubmit={(e) => {
                        if (!confirm(`確定刪除「${lesionLabel(l)}」嗎？該部位已產生的放療排程會一併刪除。`)) e.preventDefault();
                      }}
                      className="ml-auto"
                    >
                      <input type="hidden" name="case_id" value={caseId} />
                      <input type="hidden" name="lesion_id" value={l.id} />
                      <button type="submit" className="text-sm text-red-500 underline">
                        刪除
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── 量測面板（新增或編輯） ───────────────────── */}
      {draft ? (
        <div className="rounded-xl border-2 border-brand-500 bg-paper-raised p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xl font-semibold text-ink">修改尺寸</h3>
            {draft.zoneId && zonesById.get(draft.zoneId) && (
              <span className="rounded bg-sky-100 px-2 py-0.5 text-sm text-sky-700">
                {DOSE_CATEGORY_LABEL[zonesById.get(draft.zoneId)!.dose_category]}
              </span>
            )}
          </div>

          <label className="mt-3 block text-base text-ink/60">部位名稱</label>
          <input
            value={draft.siteName}
            onChange={(e) => setDraft({ ...draft, siteName: e.target.value })}
            className="mt-1 min-h-14 w-full rounded-xl border-2 border-brand-200 px-4 text-xl"
          />

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["length", "width", "height"] as Field[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setField(f)}
                className={`rounded-xl border-2 px-2 py-2 text-center ${
                  field === f ? "border-brand-600 bg-brand-50" : "border-brand-200 bg-white"
                }`}
              >
                <span className="block text-sm text-ink/50">{FIELD_LABEL[f]} cm</span>
                <span className="block min-h-9 text-3xl tabular-nums text-ink">{draft[f] || "—"}</span>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <BigDecimalPad value={draft[field]} onChange={(v) => setDraft({ ...draft, [field]: v })} />
          </div>

          {error && <p className="mt-3 rounded-lg border-2 border-red-200 bg-red-50 p-3 text-base text-red-700">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="min-h-14 flex-1 rounded-xl border-2 border-brand-200 text-lg text-ink/70 disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft.siteName.trim()}
              className="flex min-h-14 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-700 text-lg font-medium text-white disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Spinner className="h-5 w-5" />
                  儲存中…
                </>
              ) : (
                "儲存尺寸"
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-base text-ink/60">
            {photoOnly ? (
              <>在人形圖上點選部位，會<b>直接進到相機頁</b>。術後只拍照，長寬高留術前那組不動。</>
            ) : (
              <>在人形圖上點選部位，會<b>直接進到相機頁</b>——長寬高就在相機下方，量完拍完一次送出。</>
            )}
          </p>
          <BodyDiagram zones={zones} onSelect={startNew} sex={sex} />
        </div>
      )}
    </div>
  );
}

function Badge({ ok, waived, children }: { ok: boolean; waived: boolean; children: React.ReactNode }) {
  const cls = waived
    ? "bg-sky-100 text-sky-700"
    : ok
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-800";
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 font-data ${cls}`}>{children}</span>;
}

/** 「無法量測／拒絕拍照」：點開才出現原因欄，填了才送得出去（原因是之後回頭補的唯一線索）。 */
function WaiverToggle({
  active,
  open,
  onOpen,
  onClose,
  caseId,
  lesionId,
  kind,
  label,
}: {
  active: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  caseId: string;
  lesionId: string;
  kind: "measure" | "photo";
  label: string;
}) {
  if (active) {
    return (
      <form action={setLesionWaiverAction} className="flex items-center gap-1.5">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="lesion_id" value={lesionId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="waived" value="" />
        <span className="text-sky-700">已標記「{label}」</span>
        <button type="submit" className="text-ink/40 underline">
          取消標記
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={onOpen} className="text-ink/40 underline">
        {label}？
      </button>
    );
  }

  return (
    <form action={setLesionWaiverAction} onSubmit={onClose} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="lesion_id" value={lesionId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="waived" value="1" />
      <input
        name="reason"
        required
        placeholder={`${label}的原因（必填）`}
        className="min-h-12 flex-1 rounded-lg border-2 border-brand-200 px-3 text-base"
      />
      <button type="submit" className="min-h-12 rounded-lg bg-amber-600 px-4 text-base text-white">
        確定免除
      </button>
      <button type="button" onClick={onClose} className="text-ink/40 underline">
        取消
      </button>
    </form>
  );
}
