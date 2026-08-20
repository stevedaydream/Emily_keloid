"use client";

import { useState } from "react";
import Link from "next/link";
import BodyDiagram from "@/components/BodyDiagram";
import SubmitButton from "@/components/ui/SubmitButton";
import DeletePhotoButton from "./DeletePhotoButton";
import { DOSE_CATEGORY_LABEL, BODY_VIEW_LABEL, type BodyView } from "@/lib/bodyZones";
import {
  addKeloidLesionAction,
  deleteKeloidLesionAction,
  moveKeloidLesionAction,
  updateKeloidLesionAction,
  updateKeloidLesionZoneAction,
} from "./actions";

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };

const VIEW_ORDER: BodyView[] = ["front", "back", "head"];

export type LesionPhoto = {
  id: string;
  taken_at: string;
  body_site: string | null;
  imageUrl: string;
  thumbUrl: string;
};

type Lesion = {
  id: string;
  site_no: number | null;
  body_site: string;
  body_part_zone_id: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  note: string | null;
  /** 診間動線標記的「此部位無法量測／無法拍照」（2026-08-20）。在這裡只呈現，
      勾選與取消都在 /cases/[id]/clinic-flow 做——那頁才知道當下擋住的是什麼。 */
  measure_waived?: boolean | null;
  measure_waived_reason?: string | null;
  photo_waived?: boolean | null;
  photo_waived_reason?: string | null;
};

function formatSize(l: Lesion) {
  const dims = [l.length_cm, l.width_cm, l.height_cm].filter((v) => v !== null);
  if (dims.length === 0) return "尺寸未填";
  return `${l.length_cm ?? "—"} x ${l.width_cm ?? "—"} x ${l.height_cm ?? "—"} cm`;
}

// 每個部位的照片縮圖列（決策 2026-07-28：取消獨立的「傷口照片」card，縮圖直接長在部位底下）。
function PhotoStrip({ caseId, photos }: { caseId: string; photos: LesionPhoto[] }) {
  if (photos.length === 0) {
    return <p className="mt-1 text-[11px] text-ink/30">尚無照片</p>;
  }
  return (
    <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
      {photos.map((p) => (
        <div
          key={p.id}
          className="group relative w-20 shrink-0 overflow-hidden rounded-md border border-brand-100 bg-ink/5"
        >
          <a href={p.imageUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.thumbUrl}
              alt={p.body_site ?? "傷口照片"}
              loading="lazy"
              className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
            />
            <div className="px-1 py-0.5 text-center text-[10px] text-ink/40">
              {new Date(p.taken_at).toLocaleDateString("zh-TW")}
            </div>
          </a>
          <DeletePhotoButton caseId={caseId} photoId={p.id} />
        </div>
      ))}
    </div>
  );
}

export default function KeloidLesionSection({
  caseId,
  lesions,
  zones,
  sex,
  photosByLesion,
  unassignedPhotos = [],
}: {
  caseId: string;
  lesions: Lesion[];
  zones: Zone[];
  sex?: string | null;
  /** 各病灶的照片（key = lesion id），縮圖直接顯示在該部位底下 */
  photosByLesion: Record<string, LesionPhoto[]>;
  /** 尚未掛到任何部位的舊照片（新拍的照片一律會掛到部位，見 uploadPhotoAction） */
  unassignedPhotos?: LesionPhoto[];
}) {
  // 人形圖點選的部位：同時決定新病灶的名稱（可再改）與部位分類（決定放療劑量方案）
  const [pickedZone, setPickedZone] = useState<Zone | null>(null);
  const [siteName, setSiteName] = useState("");
  // 目前正在就地編輯（名稱／尺寸／備註）的部位 id
  const [editingId, setEditingId] = useState<string | null>(null);

  function pickZone(z: Zone) {
    setPickedZone(z);
    setSiteName(z.display_name);
  }

  const zonesById = new Map(zones.map((z) => [z.id, z]));

  return (
    <div>
      <label className="block text-xs font-medium text-ink/70">
        蟹足腫部位（可多處，依序編號 1、2…，各自可填描述與尺寸）
      </label>
      <p className="mt-0.5 text-[11px] text-ink/40">
        每個部位各自的分類決定它自己的放射治療劑量方案；拍照時也可直接點選對應部位。
      </p>

      {/* 排序有臨床意義（助理 2026-08-13 D10）：嚴重及需開刀的放第一個，匯出時「部位1」就是它。 */}
      {lesions.length > 1 && (
        <p className="mt-2 text-[11px] text-ink/40">
          順序有意義：請把<b>最嚴重、需要開刀的部位排在第一個</b>，匯出時的「部位1」就是它。用 ▲▼ 調整。
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {lesions.map((l, i) => {
          const zone = l.body_part_zone_id ? zonesById.get(l.body_part_zone_id) : null;
          return (
            <li
              key={l.id}
              id={`lesion-${l.id}`}
              // 待補清單的「部位N｜長寬高未量測」點過來會落在這一列並亮一圈
              className="scroll-mt-24 rounded-md border border-brand-100 px-3 py-1.5 text-sm target:bg-accent-50 target:ring-2 target:ring-accent-400"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b className="mr-1 text-brand-700">部位{l.site_no}</b>
                  <b>{l.body_site}</b>
                  <span className="ml-2 font-data text-ink/60">{formatSize(l)}</span>
                  {l.note && <span className="ml-2 text-xs text-ink/40">（{l.note}）</span>}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {lesions.length > 1 && (
                    <span className="flex items-center">
                      {(["up", "down"] as const).map((dir) => {
                        const disabled = dir === "up" ? i === 0 : i === lesions.length - 1;
                        return (
                          <form key={dir} action={moveKeloidLesionAction}>
                            <input type="hidden" name="case_id" value={caseId} />
                            <input type="hidden" name="lesion_id" value={l.id} />
                            <input type="hidden" name="direction" value={dir} />
                            <SubmitButton
                              variant="ghost"
                              size="sm"
                              disabled={disabled}
                              title={dir === "up" ? "往前移（更嚴重）" : "往後移"}
                              className="!px-1 !py-0 text-ink/40 hover:!bg-brand-50"
                              pendingText="…"
                            >
                              {dir === "up" ? "▲" : "▼"}
                            </SubmitButton>
                          </form>
                        );
                      })}
                    </span>
                  )}
                  {l.measure_waived && (
                    <span className="whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-sky-700" title={l.measure_waived_reason ?? ""}>
                      免量測
                    </span>
                  )}
                  {l.photo_waived && (
                    <span className="whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-sky-700" title={l.photo_waived_reason ?? ""}>
                      免拍照
                    </span>
                  )}
                  <span className="whitespace-nowrap text-ink/40">🖼 {(photosByLesion[l.id] ?? []).length} 張</span>
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === l.id ? null : l.id)}
                    className="whitespace-nowrap rounded border border-brand-200 px-1.5 py-0.5 text-brand-700 hover:bg-brand-50"
                  >
                    {editingId === l.id ? "取消編輯" : "編輯"}
                  </button>
                  <Link
                    href={`/patient/${caseId}/photo?lesion_id=${l.id}`}
                    className="whitespace-nowrap rounded border border-brand-200 px-1.5 py-0.5 text-brand-700 hover:bg-brand-50"
                  >
                    拍這個部位
                  </Link>
                  <form
                    action={deleteKeloidLesionAction}
                    onSubmit={(e) => {
                      if (!confirm("確定要刪除這筆病灶測量嗎？（該部位已產生的放療排程會一併刪除）")) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="case_id" value={caseId} />
                    <input type="hidden" name="lesion_id" value={l.id} />
                    <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-red-500 underline hover:!bg-transparent" pendingText="刪除中…">
                      刪除
                    </SubmitButton>
                  </form>
                </span>
              </div>
              {/* 就地編輯：只改名稱／尺寸／備註，照片關聯與放療排程都不受影響 */}
              {editingId === l.id && (
                <form
                  action={async (fd) => {
                    await updateKeloidLesionAction(fd);
                    setEditingId(null);
                  }}
                  className="mt-1.5 flex flex-wrap items-end gap-2 rounded-md border border-brand-200 bg-brand-50/40 p-2"
                >
                  <input type="hidden" name="case_id" value={caseId} />
                  <input type="hidden" name="lesion_id" value={l.id} />
                  <div>
                    <label className="block text-[11px] text-ink/50">部位名稱</label>
                    <input
                      name="body_site"
                      required
                      defaultValue={l.body_site}
                      className="mt-0.5 w-32 rounded-md border border-brand-200 px-1.5 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink/50">長 cm</label>
                    <input name="length_cm" type="number" step="0.1" defaultValue={l.length_cm ?? ""} className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink/50">寬 cm</label>
                    <input name="width_cm" type="number" step="0.1" defaultValue={l.width_cm ?? ""} className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-ink/50">高 cm</label>
                    <input name="height_cm" type="number" step="0.1" defaultValue={l.height_cm ?? ""} className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
                  </div>
                  <div className="min-w-[100px] flex-1">
                    <label className="block text-[11px] text-ink/50">備註</label>
                    <input name="note" defaultValue={l.note ?? ""} className="mt-0.5 w-full rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
                  </div>
                  <SubmitButton size="sm" pendingText="儲存中…">
                    儲存變更
                  </SubmitButton>
                  <p className="w-full text-[11px] text-ink/40">
                    部位編號請用列表上的 ▲▼ 調整（照片是以病灶連結、不是靠編號，重排不會影響既有照片）。
                  </p>
                </form>
              )}

              <form action={updateKeloidLesionZoneAction} className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <input type="hidden" name="case_id" value={caseId} />
                <input type="hidden" name="lesion_id" value={l.id} />
                <span className="text-ink/40">部位分類</span>
                <select
                  name="body_part_zone_id"
                  defaultValue={l.body_part_zone_id ?? ""}
                  className="rounded border border-brand-200 px-1.5 py-0.5 text-xs"
                >
                  <option value="">（未指定，不會自動排放療）</option>
                  {/* 部位擴充到 60 幾個之後平鋪很難找，依人形圖的三個檢視分組 */}
                  {VIEW_ORDER.map((v) => {
                    const list = zones.filter((z) => z.view === v);
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
                    劑量分類：{DOSE_CATEGORY_LABEL[zone.dose_category]}
                  </span>
                ) : (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">尚未指定分類</span>
                )}
                <SubmitButton variant="ghost" size="sm" className="!px-1 !py-0 text-xs underline" pendingText="儲存中…">
                  儲存
                </SubmitButton>
              </form>
              <PhotoStrip caseId={caseId} photos={photosByLesion[l.id] ?? []} />
            </li>
          );
        })}
        {lesions.length === 0 && <li className="text-xs text-ink/40">尚無病灶紀錄，請在下方人形圖點選部位新增</li>}
        {unassignedPhotos.length > 0 && (
          <li className="rounded-md border border-dashed border-amber-200 px-3 py-1.5 text-sm">
            <span className="text-xs text-amber-700">
              未對應部位的照片 {unassignedPhotos.length} 張（新拍的照片都會自動掛到部位，這些是舊資料）
            </span>
            <PhotoStrip caseId={caseId} photos={unassignedPhotos} />
          </li>
        )}
      </ul>

      <div className="mt-3 space-y-2">
        <BodyDiagram zones={zones} currentZoneKey={pickedZone?.zone_key} onSelect={pickZone} sex={sex} />

        <form action={addKeloidLesionAction} className="flex flex-wrap items-end gap-2 rounded-md border border-brand-100 p-2">
          <input type="hidden" name="case_id" value={caseId} />
          <input type="hidden" name="body_part_zone_id" value={pickedZone?.id ?? ""} />
          <div>
            <label className="block text-[11px] text-ink/50">
              部位名稱{pickedZone && <span className="ml-1 text-brand-700">（{DOSE_CATEGORY_LABEL[pickedZone.dose_category]}）</span>}
            </label>
            <input
              name="body_site"
              required
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="請先在上方人形圖點選部位"
              className="mt-0.5 w-32 rounded-md border border-brand-200 px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-ink/50">長 cm</label>
            <input name="length_cm" type="number" step="0.1" className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
          </div>
          <div>
            <label className="block text-[11px] text-ink/50">寬 cm</label>
            <input name="width_cm" type="number" step="0.1" className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
          </div>
          <div>
            <label className="block text-[11px] text-ink/50">高 cm</label>
            <input name="height_cm" type="number" step="0.1" className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
          </div>
          <div className="min-w-[100px] flex-1">
            <label className="block text-[11px] text-ink/50">備註</label>
            <input name="note" className="mt-0.5 w-full rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
          </div>
          <SubmitButton variant="outline" size="sm" pendingText="新增中…">
            ＋ 新增病灶
          </SubmitButton>
          {/* 點了人形圖就能直接去拍這個部位：拍照頁會跳到該部位的相機，
              上傳時自動對應（或建立）這個部位，照片一定掛得上部位。 */}
          {pickedZone && (
            <Link
              href={`/patient/${caseId}/photo?zone_key=${pickedZone.zone_key}`}
              className="whitespace-nowrap rounded border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              📷 直接拍「{pickedZone.display_name}」
            </Link>
          )}
        </form>
        <p className="text-[11px] text-ink/40">
          部位名稱預設帶入人形圖區塊名稱，可再改成更精確的描述（例：「耳」改成「左耳垂」），部位分類仍沿用點選的區塊。
        </p>
      </div>
    </div>
  );
}
