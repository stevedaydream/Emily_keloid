"use client";

import { useState } from "react";
import Link from "next/link";
import BodyDiagram from "@/components/BodyDiagram";
import SubmitButton from "@/components/ui/SubmitButton";
import { DOSE_CATEGORY_LABEL, BODY_VIEW_LABEL, type BodyView } from "@/lib/bodyZones";
import { addKeloidLesionAction, deleteKeloidLesionAction, updateKeloidLesionZoneAction } from "./actions";

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };

const VIEW_ORDER: BodyView[] = ["front", "back", "head"];

type Lesion = {
  id: string;
  site_no: number | null;
  body_site: string;
  body_part_zone_id: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  note: string | null;
};

function formatSize(l: Lesion) {
  const dims = [l.length_cm, l.width_cm, l.height_cm].filter((v) => v !== null);
  if (dims.length === 0) return "尺寸未填";
  return `${l.length_cm ?? "—"} x ${l.width_cm ?? "—"} x ${l.height_cm ?? "—"} cm`;
}

export default function KeloidLesionSection({
  caseId,
  lesions,
  zones,
  sex,
  photoCounts,
}: {
  caseId: string;
  lesions: Lesion[];
  zones: Zone[];
  sex?: string | null;
  /** 各病灶已拍照張數（key = lesion id），供「照片 N 張」連結顯示 */
  photoCounts: Record<string, number>;
}) {
  // 人形圖點選的部位：同時決定新病灶的名稱（可再改）與部位分類（決定放療劑量方案）
  const [pickedZone, setPickedZone] = useState<Zone | null>(null);
  const [siteName, setSiteName] = useState("");

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

      <ul className="mt-2 space-y-1">
        {lesions.map((l) => {
          const zone = l.body_part_zone_id ? zonesById.get(l.body_part_zone_id) : null;
          return (
            <li key={l.id} className="rounded-md border border-brand-100 px-3 py-1.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b className="mr-1 text-brand-700">部位{l.site_no}</b>
                  <b>{l.body_site}</b>
                  <span className="ml-2 font-data text-ink/60">{formatSize(l)}</span>
                  {l.note && <span className="ml-2 text-xs text-ink/40">（{l.note}）</span>}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {/* 跳到下方「傷口照片」區塊中這個部位的照片群組 */}
                  <a href={`#photos-lesion-${l.id}`} className="whitespace-nowrap text-brand-700 underline">
                    🖼 照片 {photoCounts[l.id] ?? 0} 張
                  </a>
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
            </li>
          );
        })}
        {lesions.length === 0 && <li className="text-xs text-ink/40">尚無病灶紀錄，請在下方人形圖點選部位新增</li>}
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
        </form>
        <p className="text-[11px] text-ink/40">
          部位名稱預設帶入人形圖區塊名稱，可再改成更精確的描述（例：「耳」改成「左耳垂」），部位分類仍沿用點選的區塊。
        </p>
      </div>
    </div>
  );
}
