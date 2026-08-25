"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { createCaseAction } from "./actions";

type Doctor = { id: string; code: string; name: string };

/**
 * 收案表單只有三格：負責醫師、病歷號、姓名（決策 2026-08-20，見 pending.md F-B）。
 *
 * 部長退出收案後，收案由診間護理師執行，其餘資料一律由病人在平板自填。
 * ICD 診斷、追蹤時程、同意書日期都是事後補：
 *   · 追蹤時程改以**手術日**起算，登記手術後才產生（F-D1），收案當下排不了
 *   · 同意書實務上是病人填完平板才補簽（F-C1）
 * 負責醫師留著是硬需求——研究編號 [醫師碼]-[年]-[序] 靠它產生。
 *
 * **2026-08-25 重大改動**：病歷號與姓名改為**明文存雲端**（`cases.mrn` / `cases.patient_name`），
 * 廢除本機 CSV 對照表與零知識加密保管庫。
 *
 * 為什麼廢除：那套設計要求每台裝置各自掛檔案、或先建立並解鎖保管庫，實測一路出問題——
 * 手機宣稱支援 File System Access 卻寫不進去、保管庫沒建立就靜默降級成「不檢查也不記錄」、
 * 重複收案完全擋不住、收了案對照表卻是空的。診間沒辦法用。
 *
 * 換來的好處：多裝置同步是天然的（就是同一張表），重複檢查在伺服器端做、真的擋得住
 * （DB 還有 unique index 當最後一道）。代價是雲端存了可識別資料——保護改成
 * **匯出時要金鑰才帶得出病歷號與姓名**（見 /admin/export-key 與匯出頁）。
 * 這推翻了決策 #1，Phase 1 送 IRB 必須據實說明。
 *
 * variant 只剩「建檔成功後去哪裡」：
 * - "full"（/cases/new）：跳進剛建好的個案頁
 * - "intake"（/intake）：留在原頁、清空表單、焦點回病歷號，醫師欄刻意不清空
 */
export type NewCaseFormVariant = "full" | "intake";

export default function NewCaseForm({
  doctors,
  variant = "full",
  onCreated,
}: {
  doctors: Doctor[];
  variant?: NewCaseFormVariant;
  onCreated?: (created: { caseId: string; researchId: string }) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mrnRef = useRef<HTMLInputElement>(null);
  const isIntake = variant === "intake";
  // 整診不會變的欄位做成受控，表單 reset 後才留得住
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [mrn, setMrn] = useState("");
  const [patientName, setPatientName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ caseId: string; researchId: string } | null>(null);

  function finishCreate(created: { caseId: string; researchId: string }) {
    if (!isIntake) {
      router.push(`/cases/${created.caseId}`);
      return;
    }
    formRef.current?.reset();
    setMrn("");
    setPatientName("");
    setLastCreated(created);
    onCreated?.(created);
    router.refresh(); // 讓右側「今日收案」清單長出這一筆
    mrnRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setError(null);
    setLastCreated(null);
    setSubmitting(true);
    try {
      // 病歷號撞號的檢查在 createCaseAction 裡做（伺服器端才看得到所有裝置收的案）。
      // 撞到會回 { ok:false, error }，不是 throw——Next 在正式環境會把 server action 丟出的
      // 訊息抹掉，使用者只會看到「Failed to fetch」。
      const result = await createCaseAction(new FormData(formRef.current));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      finishCreate({ caseId: result.caseId, researchId: result.researchId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立個案失敗");
    } finally {
      setSubmitting(false);
    }
  }

  if (isIntake && lastCreated) {
    return (
      <div className="space-y-4 rounded-lg border border-brand-100 bg-paper-raised p-6">
        <StepHeader step={2} />
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ 已建立 <b className="font-data">{lastCreated.researchId}</b>
        </div>

        <Link
          href={`/patient/${lastCreated.caseId}/intake`}
          className="flex flex-col items-center justify-center gap-1 rounded-xl bg-brand-700 px-6 py-8 text-center text-white shadow-[0_10px_24px_-12px_rgba(27,35,24,0.55)] transition hover:bg-brand-800"
        >
          <span className="text-2xl font-medium">交給病人填</span>
          <span className="text-xs text-white/70">基本資料・過去病史・就診資訊・SF-36・睡眠品質</span>
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setLastCreated(null);
              mrnRef.current?.focus();
            }}
            className="whitespace-nowrap rounded-md border border-brand-200 px-3 py-2 text-sm text-brand-800 hover:bg-brand-50"
          >
            ＋ 再收一位
          </button>
          <Link href={`/cases/${lastCreated.caseId}`} className="whitespace-nowrap text-sm text-brand-800 underline">
            直接開個案頁 →
          </Link>
        </div>

        <p className="text-xs text-ink/40">
          平板交出去之後這一頁可以按「再收一位」繼續。病人填到哪一段，右側「今日收案」看得到。
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-brand-100 bg-paper-raised p-6">
      {isIntake && <StepHeader step={1} />}
      <div>
        <label className="block text-sm font-medium text-ink/80">負責醫師</label>
        <select
          name="doctor_id"
          required
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
        {isIntake && <p className="mt-1 text-xs text-ink/40">連續收案時這一欄不會被清空。</p>}
      </div>

      <div className="rounded-md border border-accent-200 bg-accent-50 p-3">
        <label className="block text-sm font-medium text-ink/80">病歷號與姓名</label>
        <p className="mt-1 text-xs text-ink/60">
          會存進雲端資料庫，所有裝置都查得到（2026-08-25 起）。
          <b>匯出檔預設不含這兩欄</b>——要帶出來必須在匯出頁輸入金鑰。
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            name="mrn"
            ref={mrnRef}
            autoFocus={isIntake}
            value={mrn}
            onChange={(e) => setMrn(e.target.value)}
            placeholder="病歷號（留空則不建立對照）"
            className="w-full rounded-md border border-accent-300 px-3 py-2 text-sm outline-none focus:border-accent-500"
          />
          <input
            name="patient_name"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="姓名"
            className="w-full rounded-md border border-accent-300 px-3 py-2 text-sm outline-none focus:border-accent-500"
          />
        </div>
        <p className="mt-1 text-xs text-ink/40">
          同一個病歷號只能收一次案。已經收過的病人身上又長了新的蟹足腫，請到那筆個案加一顆病灶。
        </p>
      </div>

      {/* 診斷、追蹤時程、同意書日期都不在這裡（決策 2026-08-20，見本檔頂端註解）。 */}
      <p className="rounded-md border border-brand-100 bg-paper-sunken px-3 py-2 text-xs text-ink/50">
        建檔後把平板交給病人自填基本資料、病史、就診資訊與兩份量表。
        診斷與同意書日期在個案頁補；追蹤時程會在登記手術後自動產生（術後每月一次、共 24 次）。
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Button type="submit" pending={submitting} pendingText="建立中…" className="w-full">
        {isIntake ? "建立，下一步交給病人" : "建立個案"}
      </Button>
    </form>
  );
}

/** 收案只有兩步：填三格 → 交給病人。步數少，所以用一條橫的指示而不是側邊的進度條。 */
function StepHeader({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: "護理師填寫", hint: "病歷號・姓名・負責醫師" },
    { n: 2 as const, label: "交給病人", hint: "其餘資料由病人自填" },
  ];
  return (
    <ol className="flex items-stretch gap-2">
      {steps.map((s) => {
        const state = s.n === step ? "current" : s.n < step ? "done" : "todo";
        return (
          <li
            key={s.n}
            className={`flex flex-1 items-center gap-2 rounded-md border px-3 py-2 ${
              state === "current"
                ? "border-brand-300 bg-brand-50"
                : state === "done"
                ? "border-emerald-200 bg-emerald-50"
                : "border-brand-100 bg-paper-sunken"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                state === "current"
                  ? "bg-brand-700 text-white"
                  : state === "done"
                  ? "bg-emerald-600 text-white"
                  : "bg-brand-100 text-ink/40"
              }`}
            >
              {state === "done" ? "✓" : s.n}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${state === "todo" ? "text-ink/40" : "text-ink/80"}`}>
                {s.label}
              </span>
              <span className="block truncate text-xs text-ink/40">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
