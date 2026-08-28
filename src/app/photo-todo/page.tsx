import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import PatientName from "@/components/LocalNameProvider";
import { isPhotographed, lesionLabel, type LesionCheck } from "@/lib/clinicFlow";

// 補拍照（2026-08-28 使用者要求）。
//
// 背景：助理與顏主任討論後決定「手機只拿來拍照」——病灶登記、拍照、JSS 由負責的助理事後補 key。
// 那條動線缺的就是這一頁：拿起手機的人需要先知道**還有誰的哪一顆病灶沒有照片**。
//
// 三個零件全部沿用既有的，不另造一套：
//   ① 「什麼叫拍過了」＝ lib/clinicFlow 的 isPhotographed（收案動線、回診動線、今日門診同一份判定）
//   ② 「今天該看誰」＝ 今日門診那份查詢（pending 且到期日 ≤ 今天的時程項目）
//   ③ 「點了去拍」＝ /patient/[caseId]/photo?lesion_id=…&next=…（這個路由本來就收 lesion_id）
//
// 分兩組是刻意的（使用者裁決）：
//   A 從來沒拍過 —— 術前 baseline 缺了就是永遠缺（病灶被切掉之後沒有東西可拍），最優先。
//   B 今日門診名單上、今天還沒拍 —— 人還在，補得到。
export const dynamic = "force-dynamic";

type Row = {
  caseId: string;
  researchId: string;
  mrn: string | null;
  patientName: string | null;
  lesions: LesionCheck[];
};

export default async function PhotoTodoPage() {
  const supabase = supabaseServer();
  // 台北的今天。伺服器跑 UTC，直接用 toISOString 會在台北凌晨差一天。
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());

  const [{ data: lesions }, { data: photos }, { data: dueItems }] = await Promise.all([
    supabase
      .from("case_keloid_lesions")
      .select(
        "id, case_id, site_no, body_site, is_primary, length_cm, width_cm, height_cm, measure_waived, photo_waived, cases(research_id, mrn, patient_name, data_source)"
      )
      .order("site_no"),
    supabase.from("photos").select("lesion_id, created_at").not("lesion_id", "is", null),
    supabase
      .from("case_schedule_items")
      .select("case_id")
      .eq("status", "pending")
      .lte("due_date", today),
  ]);

  const taipeiDay = (ts: unknown) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(String(ts)));

  // 「有沒有拍過」用全部照片；「今天拍了沒」用 created_at（＝寫進資料庫的時間）。
  // 不用 taken_at：候補上傳的照片 taken_at 是真正的拍攝日（可能是三天前），
  // 拿它判定的話今天補上去的照片永遠不算今天做過（同 visit-flow 的處理）。
  const everCount = new Map<string, number>();
  const todayCount = new Map<string, number>();
  for (const p of photos ?? []) {
    const id = p.lesion_id as string;
    everCount.set(id, (everCount.get(id) ?? 0) + 1);
    if (taipeiDay(p.created_at) === today) todayCount.set(id, (todayCount.get(id) ?? 0) + 1);
  }

  const todayCaseIds = new Set((dueItems ?? []).map((i) => i.case_id as string));

  const groupA = new Map<string, Row>(); // 從來沒拍過
  const groupB = new Map<string, Row>(); // 今日門診名單上、今天還沒拍
  let legacyMissing = 0;

  for (const l of lesions ?? []) {
    const c = (Array.isArray(l.cases) ? l.cases[0] : l.cases) as
      | { research_id: string; mrn: string | null; patient_name: string | null; data_source: string | null }
      | null;
    if (!c) continue;

    const base: LesionCheck = {
      id: l.id,
      site_no: l.site_no,
      body_site: l.body_site,
      is_primary: l.is_primary ?? false,
      length_cm: l.length_cm,
      width_cm: l.width_cm,
      height_cm: l.height_cm,
      measure_waived: l.measure_waived ?? false,
      photo_waived: l.photo_waived ?? false,
      photoCount: everCount.get(l.id) ?? 0,
    };
    // 勾了「無法拍照／病人拒絕」的不算欠——那是當下已經決定過的事，再提醒只是雜訊。
    if (base.photo_waived) continue;

    const push = (map: Map<string, Row>) => {
      const row: Row = map.get(l.case_id) ?? {
        caseId: l.case_id,
        researchId: c.research_id,
        mrn: c.mrn,
        patientName: c.patient_name,
        lesions: [],
      };
      row.lesions.push(base);
      map.set(l.case_id, row);
    };

    if (!isPhotographed(base)) {
      // 舊資料回溯建檔的個案沒有照片是必然的（那些病人當年就沒拍），全部列出來會把這一頁灌爆，
      // 而且回溯也拍不到。所以不進 A 組，只在頁尾報一個數字——不列出來，但也不假裝不存在。
      // 他們如果之後回診，照樣會從 B 組出現（B 組是看今日門診名單，不分資料來源）。
      if (c.data_source === "legacy_import") legacyMissing++;
      else push(groupA);
      continue;
    }
    // 拍過但今天還沒拍，且今天門診名單上有他 → 人還在，補得到
    if (todayCaseIds.has(l.case_id) && (todayCount.get(l.id) ?? 0) === 0) push(groupB);
  }

  const sortRows = (m: Map<string, Row>) =>
    [...m.values()].sort((a, b) => a.researchId.localeCompare(b.researchId));
  const a = sortRows(groupA);
  const b = sortRows(groupB);
  const total = a.reduce((n, r) => n + r.lesions.length, 0) + b.reduce((n, r) => n + r.lesions.length, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-16">
      <div>
        <h1 className="text-2xl font-semibold text-ink">補拍照</h1>
        <p className="mt-1 text-base text-ink/55">
          {total === 0 ? "目前沒有需要補拍的部位。" : `還有 ${total} 個部位需要拍照。點部位直接進相機。`}
        </p>
      </div>

      <Group
        title="從來沒拍過"
        tone="urgent"
        note="術前尺寸與照片是 baseline——病灶開刀切掉之後就沒有東西可拍了，這一組補不回來。"
        rows={a}
      />

      <Group
        title="今日門診名單，今天還沒拍"
        tone="normal"
        note={`來源跟「今日門診」同一份（到期或已逾期的待辦時程）。人還在就補得到。`}
        rows={b}
      />

      {legacyMissing > 0 && (
        <p className="rounded-lg border border-brand-100 bg-paper-sunken px-3 py-2 text-sm text-ink/50">
          另有 {legacyMissing} 個舊資料匯入的部位沒有照片，未列在上面——那些病人當年就沒拍，回溯補不到。
          他們如果之後回診，會從「今日門診名單」那一組出現。
        </p>
      )}

      <p className="rounded-lg border border-brand-100 bg-paper-sunken px-3 py-2 text-sm text-ink/45">
        「今日門診」頁面上<b className="font-medium text-ink/60">手動加進去</b>的病人只存在那台裝置上，
        這支手機看不到。要讓他出現在這裡，請先在他的個案頁登記回診或時程。
      </p>
    </div>
  );
}

function Group({
  title,
  note,
  tone,
  rows,
}: {
  title: string;
  note: string;
  tone: "urgent" | "normal";
  rows: Row[];
}) {
  const urgent = tone === "urgent";
  return (
    <section
      className={`rounded-xl border-2 p-3 ${
        urgent ? "border-amber-300 bg-amber-50/50" : "border-brand-200 bg-white"
      }`}
    >
      <h2 className={`text-lg font-semibold ${urgent ? "text-amber-900" : "text-ink"}`}>
        {urgent && "⚠️ "}
        {title}
        <span className="ml-2 font-data text-sm font-normal text-ink/40">
          {rows.reduce((n, r) => n + r.lesions.length, 0)} 個部位
        </span>
      </h2>
      <p className={`mt-0.5 text-sm ${urgent ? "text-amber-800/80" : "text-ink/45"}`}>{note}</p>

      {rows.length === 0 ? (
        <p className="mt-3 text-base text-ink/35">沒有。</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.caseId} className="rounded-lg border border-brand-100 bg-white p-3">
              {/* 研究編號是主鍵，病歷號與姓名是給人對人的——手機上要一眼認得出是誰。
                  姓名走 PatientName，會跟著「顯示姓名」開關走（診間有訪客時可一鍵藏起來）。 */}
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <Link href={`/cases/${r.caseId}`} className="font-data text-base font-medium text-brand-800 underline">
                  {r.researchId}
                </Link>
                {r.mrn && <span className="font-data text-sm text-ink/50">{r.mrn}</span>}
                <PatientName name={r.patientName} className="text-base text-ink/70" />
              </div>

              <ul className="mt-2 space-y-2">
                {r.lesions.map((l) => (
                  <li key={l.id}>
                    {/* 手機單手操作：整列就是按鈕，min-h-14 是拇指按得準的高度 */}
                    <Link
                      href={`/patient/${r.caseId}/photo?lesion_id=${l.id}&next=${encodeURIComponent("/photo-todo")}`}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-brand-700 px-4 text-lg font-medium text-white hover:bg-brand-800"
                    >
                      <span>{lesionLabel(l)}</span>
                      <span className="shrink-0 text-base font-normal">拍照 →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
