// 診間收案動線（決策 2026-08-20）。
//
// 門診當次的正確順序是：建檔 → 交平板給病人自填 → 收回平板量測長寬高＋拍照 →
// 醫師觸診填 JSS 疤痕診斷分類表。前三步做完但 JSS 沒填，這位病人的診斷歸類就是空的；
// 量測沒做完就走人，長寬高再也補不回來（照片裡的尺沒有被程式讀出來過，見決策 #3）。
//
// **2026-08-24 起這一步更關鍵**：助理裁決病灶尺寸只收「術前 baseline」一組
// （手術把病灶切掉了，術後沒有東西可量），所以術前沒量到就是永遠沒有——
// 回診動線不會再叫任何人補。
//
// 這裡只放「每一步算不算完成」的判定，UI 與寫入各自在 clinic-flow 底下。
// 判定要跟畫面分開，是因為今日門診卡片、個案頁的提醒也要用同一套標準——
// 三個地方各寫一次「什麼叫量完了」，遲早會不一致。

export type LesionCheck = {
  id: string;
  site_no: number | null;
  body_site: string;
  /** 主病灶＝要開刀那一顆，也是 JSS 評分的對象（2026-08-24） */
  is_primary: boolean;
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
 * 步驟 3「醫師評分」要填的量表（2026-08-20；2026-08-24 助理裁決只留 JSS）。
 *
 * 原本這裡有 JSS ＋ VSS 兩份，但兩份有一半的題目在量同一件事——JSS 的「11. 疤痕周圍紅斑」
 * 與 VSS 的「血管分布」是同一件事的兩種刻度，「8. 垂直生長」與「高度/厚度」也是。
 * 助理 2026-08-24 裁決疤痕評分只留 JSS，VSS 整份停收（資料與問卷都已刪，
 * 見 migration 20260824010000）。
 *
 * 排在量測之後：JSS 有「7. 大小」「8. 垂直生長／隆起」，沒量長寬高那幾題只能用猜的。
 *
 * **JSS 評的是主病灶**（`case_keloid_lesions.is_primary`，即要開刀那一顆）：
 * 12 題裡有 6 題描述單一顆疤，一個病人最多 5 顆，不指定就無法解讀。
 */
export const CLINICIAN_SCALE_NAMES = ["JSS 疤痕診斷分類表"] as const;

export type ClinicianScale = {
  id: string;
  name: string;
  /** 這次門診（今天）已經填過 */
  done: boolean;
};
