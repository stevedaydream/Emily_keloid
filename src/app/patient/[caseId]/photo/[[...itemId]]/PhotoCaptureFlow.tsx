"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BodyDiagram from "@/components/BodyDiagram";
import CameraCapture from "./CameraCapture";
import type { BodyView } from "@/lib/bodyZones";

type Zone = { id: string; zone_key: string; view: BodyView; display_name: string; dose_category: string };
type Site = {
  id: string;
  site_no: number | null;
  body_site: string;
  note: string | null;
  zoneKey: string;
  doseCategory: string;
  photoCount: number;
  /** 已量過的尺寸，帶進相機頁讓人員只補缺的那一格（2026-08-20：尺寸與照片一起送） */
  length: string;
  width: string;
  height: string;
};

// 相機需要的部位資訊：從個案部位清單挑選時帶入該病灶自己的 zone/劑量分類；從身體圖挑選時帶入該區塊資訊。
type Target = {
  zoneKey: string;
  displayName: string;
  doseCategory: string;
  lesionId: string | null;
  size?: { length: string; width: string; height: string };
};

const targetForSite = (s: Site): Target => ({
  zoneKey: s.zoneKey,
  displayName: `部位${s.site_no ?? ""} ${s.body_site}`.trim(),
  doseCategory: s.doseCategory,
  lesionId: s.id,
  size: { length: s.length, width: s.width, height: s.height },
});

export default function PhotoCaptureFlow({
  caseId,
  itemId,
  zones,
  sex,
  sites,
  initialLesionId,
  initialZoneKey,
  next,
  sizeLocked = false,
}: {
  caseId: string;
  itemId: string;
  zones: Zone[];
  sex?: string | null;
  sites?: Site[];
  /** 拍完要回哪裡。診間收案動線會帶自己的網址進來，讓人拍完直接回到那三步的畫面。 */
  next?: string | null;
  /** 從個案頁面的「拍這個部位」進來時直接跳到該部位的相機畫面 */
  initialLesionId?: string | null;
  /** 從個案頁面的人形圖點選部位後直接進來拍照時帶的區塊代碼 */
  initialZoneKey?: string | null;
  /** 已登記手術：尺寸只留術前 baseline，相機頁不再收長寬高（助理 2026-08-24） */
  sizeLocked?: boolean;
}) {
  const initialSite = initialLesionId ? (sites ?? []).find((s) => s.id === initialLesionId) : undefined;
  // 人形圖帶進來的區塊：該個案已有同區塊的部位就直接對上，否則以區塊本身當目標
  // （上傳時 uploadPhotoAction 會補建對應的部位，照片不會變成「未對應部位」）。
  const initialZone = !initialSite && initialZoneKey ? zones.find((z) => z.zone_key === initialZoneKey) : undefined;
  const initialZoneSite = initialZone ? (sites ?? []).find((s) => s.zoneKey === initialZone.zone_key) : undefined;
  const [target, setTarget] = useState<Target | null>(
    initialSite
      ? targetForSite(initialSite)
      : initialZoneSite
      ? targetForSite(initialZoneSite)
      : initialZone
      ? { zoneKey: initialZone.zone_key, displayName: initialZone.display_name, doseCategory: initialZone.dose_category, lesionId: null }
      : null
  );
  const backTo = next && next.startsWith("/") && !next.startsWith("//") ? next : `/cases/${caseId}`;
  const [showDiagram, setShowDiagram] = useState((sites ?? []).length === 0);
  const router = useRouter();

  if (target) {
    return (
      <CameraCapture
        caseId={caseId}
        itemId={itemId}
        zoneKey={target.zoneKey}
        zoneDisplayName={target.displayName}
        doseCategory={target.doseCategory}
        lesionId={target.lesionId}
        initialSize={target.size}
        sizeLocked={sizeLocked}
        doneLabel={next ? "回到收案動線" : "回個案頁面"}
        onBack={() => setTarget(null)}
        onDone={() => router.push(backTo)}
      />
    );
  }

  const caseSites = sites ?? [];

  return (
    <div className="mx-auto max-w-sm space-y-3">
      <h1 className="text-center text-lg font-semibold text-slate-800">部位標記與拍照</h1>

      {caseSites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">此個案已設定 {caseSites.length} 個部位，點選要拍照的部位：</p>
          <ul className="space-y-1.5">
            {caseSites.map((s) => {
              const done = s.photoCount > 0;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setTarget(targetForSite(s))}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-slate-400"
                  >
                    <span>
                      <b>部位{s.site_no}</b>
                      <span className="ml-2">{s.body_site}</span>
                      {s.note && <span className="ml-2 text-xs text-slate-400">（{s.note}）</span>}
                    </span>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                        done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {done ? `已拍 ${s.photoCount} 張` : "尚未拍照"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!showDiagram && (
            <button
              type="button"
              onClick={() => setShowDiagram(true)}
              className="w-full rounded-md border border-dashed border-slate-300 py-2 text-xs text-slate-500 hover:border-slate-400"
            >
              ＋ 其他部位（用身體圖選擇）
            </button>
          )}
        </div>
      )}

      {showDiagram && (
        <BodyDiagram
          zones={zones}
          onSelect={(z) =>
            setTarget({ zoneKey: z.zone_key, displayName: z.display_name, doseCategory: z.dose_category, lesionId: null })
          }
          sex={sex}
        />
      )}
    </div>
  );
}
