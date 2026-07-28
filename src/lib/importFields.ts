// 舊資料匯入（/admin/import）的欄位定義、對應猜測、值正規化與驗證。
// 純函式，不碰資料庫，讓 Route Handler（上傳解析）與 Server Action（重新驗證/寫入）共用同一套規則。

export type ImportFieldType = "text" | "integer" | "date" | "sex" | "recurrence_status";

export type ImportTargetField = {
  key: string;
  label: string;
  type: ImportFieldType;
  /** 對應猜測用的關鍵字（小寫比對，含中英文） */
  keywords: string[];
  hint?: string;
};

// 只涵蓋「個案層級」欄位。治療紀錄/放療/病灶等一對多資料結構不在這個介面的範圍，
// 需要時仍由匯入腳本處理（決策：介面先解決最常見的一人一列舊表）。
export const IMPORT_TARGET_FIELDS: ImportTargetField[] = [
  {
    key: "research_id",
    label: "研究編號",
    type: "text",
    keywords: ["研究編號", "research id", "research_id", "study id", "編號"],
    hint: "已在診間本機對照工具產生的編號；留空則由醫師代碼＋年份自動產生",
  },
  { key: "doctor_code", label: "醫師代碼", type: "text", keywords: ["醫師代碼", "醫師", "doctor", "physician", "surgeon", "vs"] },
  { key: "enrollment_year", label: "收案年份", type: "integer", keywords: ["收案年份", "年份", "year", "enrollment year"] },
  { key: "sex", label: "性別", type: "sex", keywords: ["性別", "sex", "gender"] },
  { key: "age_at_enrollment", label: "收案年齡", type: "integer", keywords: ["年齡", "age"] },
  { key: "body_site", label: "部位", type: "text", keywords: ["部位", "site", "location", "region", "位置"] },
  { key: "keloid_size", label: "keloid 大小", type: "text", keywords: ["大小", "size", "尺寸", "dimension"] },
  { key: "keloid_history", label: "keloid history", type: "text", keywords: ["keloid history", "病史", "history of keloid"] },
  { key: "keloid_onset_date", label: "初次發生時間", type: "text", keywords: ["初次發生", "onset", "發生時間"] },
  { key: "family_history", label: "家族史", type: "text", keywords: ["家族史", "family history", "family"] },
  { key: "disease_history", label: "疾病史", type: "text", keywords: ["疾病史", "disease history", "past history", "underlying"] },
  { key: "jsw_score", label: "JSW score", type: "text", keywords: ["jsw", "jss", "scar scale", "量表"] },
  { key: "consent_signed_at", label: "同意書簽署日期", type: "date", keywords: ["同意書", "consent", "icf"] },
  {
    key: "recurrence_status",
    label: "復發狀態",
    type: "recurrence_status",
    keywords: ["是否復發", "復發狀態", "recurrence", "recur"],
    hint: "YES/有→復發；NO/NA/無→未復發；其他或空→不明",
  },
  { key: "recurrence_date", label: "復發日期", type: "date", keywords: ["復發日期", "recurrence date"] },
  { key: "days_to_recurrence", label: "復發天數", type: "integer", keywords: ["復發天數", "days to recurrence", "interval"] },
  {
    key: "followup_cutoff_date",
    label: "最後追蹤/統計截止日",
    type: "date",
    keywords: ["最後追蹤", "統計截止", "cutoff", "last follow"],
  },
  { key: "prior_treatment_physician", label: "之前治療醫師", type: "text", keywords: ["之前治療醫師", "prior physician", "先前醫師"] },
  { key: "prior_steroid_treatment", label: "之前類固醇治療", type: "text", keywords: ["類固醇", "steroid"] },
  { key: "prior_tcm_treatment", label: "之前中醫治療", type: "text", keywords: ["中醫", "tcm", "chinese medicine"] },
  { key: "prior_ogawa_patch", label: "之前小川令貼布", type: "text", keywords: ["小川", "ogawa", "貼布", "patch"] },
  { key: "prior_radiation_treatment", label: "之前放射治療", type: "text", keywords: ["之前放射", "prior radiation", "prior rt"] },
  { key: "phone_number", label: "手機號碼", type: "text", keywords: ["手機", "電話", "phone", "mobile"] },
  { key: "notes", label: "備註", type: "text", keywords: ["備註", "note", "remark", "comment"] },
];

export const IMPORT_FIELD_BY_KEY = new Map(IMPORT_TARGET_FIELDS.map((f) => [f.key, f]));

// 疑似個資的欄位名稱關鍵字。決策 #13：雲端匯入只接受已去識別化的檔案，
// 偵測到就整份擋掉，請使用者先在本機移除該欄位再上傳（寧可誤擋，不可誤收）。
const PII_HEADER_KEYWORDS = [
  "病歷號",
  "病歷",
  "chart no",
  "chart number",
  "chartno",
  "mrn",
  "medical record",
  "姓名",
  "名字",
  "patient name",
  "身分證",
  "身份證",
  "id number",
  "national id",
  "生日",
  "出生",
  "birth",
  "地址",
  "address",
];

/** 回傳表頭中疑似含個資的欄位名稱（空陣列＝通過把關）。 */
export function detectPiiHeaders(headers: string[]): string[] {
  return headers.filter((h) => {
    const lower = h.toLowerCase();
    return PII_HEADER_KEYWORDS.some((kw) => lower.includes(kw));
  });
}

/** 依欄位名稱關鍵字猜一份初始對應：{ 來源欄位: 目標欄位 key }。同一個目標欄位只會被猜中一次。 */
export function guessMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    if (!lower) continue;
    const hit = IMPORT_TARGET_FIELDS.find(
      (f) => !used.has(f.key) && f.keywords.some((kw) => lower === kw || lower.includes(kw))
    );
    if (hit) {
      mapping[header] = hit.key;
      used.add(hit.key);
    }
  }
  return mapping;
}

const RESEARCH_ID_RE = /^([A-Za-z]+)-(\d{4})-(\d+)$/;

export function parseResearchId(value: string) {
  const m = value.trim().match(RESEARCH_ID_RE);
  if (!m) return null;
  return { doctorCode: m[1].toUpperCase(), year: Number(m[2]), sequenceNo: Number(m[3]) };
}

/** 組出 YYYY-MM-DD，並確認是真實存在的日期（擋掉 2018/13/45 這種月份日數越界的值）。 */
function buildDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  // ISO（含解析 Excel 儲存格已轉成的 ISO 字串）
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return buildDate(iso[1], iso[2], iso[3]);
  // 2019/3/5、2019.3.5
  const slash = v.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (slash) return buildDate(slash[1], slash[2], slash[3]);
  return null;
}

function normalizeSex(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (["m", "male", "男", "男性"].includes(v)) return "M";
  if (["f", "female", "女", "女性"].includes(v)) return "F";
  if (["other", "其他"].includes(v)) return "other";
  if (["unknown", "不明", "na", "n/a"].includes(v)) return "unknown";
  return null;
}

function normalizeRecurrence(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (["yes", "y", "有", "recurred", "復發"].includes(v)) return "recurred";
  if (["no", "n", "na", "n/a", "無", "none", "未復發"].includes(v)) return "none";
  if (["unknown", "不明", "?"].includes(v)) return "unknown";
  return null;
}

export type MappedRow = { mapped: Record<string, string | number | null>; errors: string[] };

/**
 * 依欄位對應把一列原始資料轉成平台欄位值，同時累積該列的驗證錯誤。
 * knownDoctorCodes 傳入後台現有的醫師代碼，用來擋掉打錯的代碼。
 */
export function mapAndValidateRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
  knownDoctorCodes: string[]
): MappedRow {
  const mapped: Record<string, string | number | null> = {};
  const errors: string[] = [];

  for (const [sourceHeader, targetKey] of Object.entries(mapping)) {
    if (!targetKey) continue;
    const field = IMPORT_FIELD_BY_KEY.get(targetKey);
    if (!field) continue;

    const rawValue = raw[sourceHeader];
    const text = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
    if (!text) {
      mapped[targetKey] = null;
      continue;
    }

    switch (field.type) {
      case "integer": {
        const n = Number(text.replace(/[^\d.-]/g, ""));
        if (Number.isNaN(n)) {
          errors.push(`${field.label}「${text}」不是數字`);
          mapped[targetKey] = null;
        } else {
          mapped[targetKey] = Math.round(n);
        }
        break;
      }
      case "date": {
        const d = normalizeDate(text);
        if (!d) {
          errors.push(`${field.label}「${text}」不是可辨識的日期（需 YYYY-MM-DD 或 YYYY/M/D）`);
          mapped[targetKey] = null;
        } else {
          mapped[targetKey] = d;
        }
        break;
      }
      case "sex": {
        const s = normalizeSex(text);
        if (!s) {
          errors.push(`性別「${text}」無法辨識（可用 M/F/男/女）`);
          mapped[targetKey] = null;
        } else {
          mapped[targetKey] = s;
        }
        break;
      }
      case "recurrence_status": {
        const s = normalizeRecurrence(text);
        mapped[targetKey] = s ?? "unknown";
        break;
      }
      default:
        mapped[targetKey] = text;
    }
  }

  // 研究編號／醫師代碼／年份：三者要能湊出一組完整的編號規則
  const researchId = typeof mapped.research_id === "string" ? mapped.research_id : null;
  const parsed = researchId ? parseResearchId(researchId) : null;
  if (researchId && !parsed) {
    errors.push(`研究編號「${researchId}」格式不符（需 [醫師代碼]-[年份]-[序號]，例 CHN-2026-001）`);
  }

  const doctorCode = ((mapped.doctor_code as string) ?? parsed?.doctorCode ?? "").toUpperCase();
  if (!doctorCode) {
    errors.push("缺少醫師代碼（且研究編號無法解析出代碼）");
  } else if (knownDoctorCodes.length > 0 && !knownDoctorCodes.includes(doctorCode)) {
    errors.push(`醫師代碼「${doctorCode}」不在後台清單中，請先於「醫師代碼清單」新增`);
  }
  if (doctorCode) mapped.doctor_code = doctorCode;

  const year = (mapped.enrollment_year as number) ?? parsed?.year ?? null;
  if (!year) {
    errors.push("缺少收案年份（且研究編號無法解析出年份）");
  } else if (year < 1980 || year > 2100) {
    errors.push(`收案年份「${year}」超出合理範圍`);
  }
  if (year) mapped.enrollment_year = year;

  const age = mapped.age_at_enrollment;
  if (typeof age === "number" && (age < 0 || age > 130)) {
    errors.push(`收案年齡「${age}」超出合理範圍（0-130）`);
  }

  return { mapped, errors };
}
