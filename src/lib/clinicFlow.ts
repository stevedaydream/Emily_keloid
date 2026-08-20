// 診間收案動線（決策 2026-08-20）。
//
// 門診當次的正確順序是：建檔 → 交平板給病人自填 → 收回平板量測長寬高＋拍照 →
// 醫師觸診填 JSS 疤痕診斷分類表。前三步做完但 JSS 沒填，這位病人的診斷歸類就是空的；
// 量測沒做完就走人，長寬高再也補不回來（照片裡的尺沒有被程式讀出來過，見決策 #3）。
//
// 這裡只放「每一步算不算完成」的判定，UI 與寫入各自在 clinic-flow 底下。
// 判定要跟畫面分開，是因為今日門診卡片、個案頁的提醒也要用同一套標準——
// 三個地方各寫一次「什麼叫量完了」，遲早會不一致。

export type LesionCheck = {
  id: string;
  site_no: number | null;
  body_site: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  measure_waived: boolean;
  photo_waived: boolean;
  photoCount: number;
};

/** 長寬高三個都有值才算量完；勾了「無法量測」視同完成（但會留一筆待補）。 */
export function isMeasured(l: LesionCheck): boolean {
  if (l.measure_waived) return true;
  return l.length_cm !== null && l.width_cm !== null && l.height_cm !== null;
}

/** 至少一張照片；勾了「無法拍照」視同完成。 */
export function isPhotographed(l: LesionCheck): boolean {
  return l.photo_waived || l.photoCount > 0;
}

export function lesionLabel(l: LesionCheck): string {
  return `部位${l.site_no ?? "?"} ${l.body_site}`.trim();
}

/**
 * 開 JSS 之前擋不擋。回傳還缺什麼——空陣列＝可以開。
 * 一個病灶都沒有也算沒過：那代表這位根本還沒被量過。
 */
export function measureBlockers(lesions: LesionCheck[]): string[] {
  if (lesions.length === 0) return ["尚未登記任何病灶部位"];
  const out: string[] = [];
  for (const l of lesions) {
    if (!isMeasured(l)) out.push(`${lesionLabel(l)}：長寬高未填齊`);
    if (!isPhotographed(l)) out.push(`${lesionLabel(l)}：尚未拍照`);
  }
  return out;
}
