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

/**
 * 步驟 3「醫師評分」要填的量表（2026-08-20）。
 *
 * 兩份都要醫師看同一顆病灶、摸同一個質地——JSS 的「11. 疤痕周圍紅斑」與 VSS 的「血管分布」
 * 是同一件事的兩種刻度，「8. 垂直生長」與「高度/厚度」也是。分成兩次做等於摸兩次病人，
 * 所以擺在同一關、兩份都完成才算結束。
 *
 * 兩份都排在量測之後：JSS 有「7. 大小」「8. 垂直生長／隆起」，VSS 的高度直接用 mm 分級，
 * 沒量長寬高那幾題只能用猜的。
 *
 * 順序＝畫面上的排列順序。JSS 是診斷分類（這是不是蟹足腫，初診定性），
 * VSS 是嚴重度評分（每次追蹤重複測，看治療成效），沒有先後依賴，先列定性的那份。
 */
export const CLINICIAN_SCALE_NAMES = ["JSS 疤痕診斷分類表", "Vancouver Scar Scale (VSS)"] as const;

export type ClinicianScale = {
  id: string;
  name: string;
  /** 這次門診（今天）已經填過 */
  done: boolean;
};
