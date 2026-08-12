"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { createCaseAction } from "./actions";
import DiagnosisPicker, { type IcdOption } from "./DiagnosisPicker";
import {
  isFileSystemAccessSupported,
  getConfiguredHandle,
  pickMappingFile,
  openExistingMappingFile,
  requestHandlePermission,
  appendMappingRow,
  readAllRows,
} from "@/lib/localMrnStore";
import { syncVaultIfUnlocked } from "@/lib/vaultSession";
import { loadVaultAction } from "@/app/local-tools/mrn-mapping/vaultActions";

type Doctor = { id: string; code: string; name: string };
type Template = { id: string; name: string };

/**
 * variant 決定建檔成功後的動線（決策 2026-07-29）：
 * - "full"（/cases/new）：跳進剛建好的個案頁，維持原本行為
 * - "intake"（/intake，連續收案的醫師）：留在原頁、清空表單、焦點回病歷號，
 *   醫師/時程範本這種「整診都一樣」的欄位刻意不清空。性別/年齡/手機收進折疊區
 *   （主要由病人在自填頁填），沒用平板的病人才展開代填。
 */
export type NewCaseFormVariant = "full" | "intake";

export default function NewCaseForm({
  doctors,
  templates,
  icdCodes,
  variant = "full",
  onCreated,
}: {
  doctors: Doctor[];
  templates: Template[];
  icdCodes: IcdOption[];
  variant?: NewCaseFormVariant;
  onCreated?: (created: { caseId: string; researchId: string }) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mrnRef = useRef<HTMLInputElement>(null);
  const isIntake = variant === "intake";
  // 整診不會變的欄位做成受控，表單 reset 後才留得住
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [scheduleTemplateId, setScheduleTemplateId] = useState("");
  const [sex, setSex] = useState("");
  const [mrn, setMrn] = useState("");
  // 姓名跟病歷號一樣只寫進本機對照表，送出前會從 FormData 移除，絕不進伺服器。
  const [patientName, setPatientName] = useState("");
  const [supported, setSupported] = useState(true);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ICD 選擇器有自己的內部 state，換 key 讓它整組重新掛載＝清空
  const [resetKey, setResetKey] = useState(0);
  const [lastCreated, setLastCreated] = useState<{ caseId: string; researchId: string } | null>(null);
  // 個案已成功建立但本機對照表寫入失敗時，保留這筆資訊讓使用者可以重試或手動記錄。
  const [pendingMapping, setPendingMapping] = useState<{
    caseId: string;
    researchId: string;
    mrn: string;
    name: string;
  } | null>(null);

  // 保管庫同步狀態：只有在雲端真的有保管庫時才提示，否則沒用過這功能的人會看到莫名其妙的警告
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultSync, setVaultSync] = useState<"syncing" | "synced" | "locked" | "failed" | null>(null);
  const [vaultSyncMsg, setVaultSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    getConfiguredHandle().then(setFileHandle);
    loadVaultAction()
      .then((v) => setVaultExists(!!v))
      .catch(() => setVaultExists(false));
  }, []);

  // 新的一筆對應寫進本機 CSV 之後，把整份對照表重新加密覆蓋雲端保管庫，
  // 讓手機／平板端查得到剛收的病人。沒解鎖就只留提示，不擋收案動線（決策 2026-07-29）。
  // 刻意不 await：保管庫同步失敗不該讓已經建好的個案卡在畫面上。
  function syncVaultInBackground(handle: FileSystemFileHandle) {
    setVaultSync("syncing");
    setVaultSyncMsg(null);
    void (async () => {
      try {
        const result = await syncVaultIfUnlocked(await readAllRows(handle));
        setVaultSync(result.status);
        setVaultSyncMsg(result.message ?? null);
      } catch (err) {
        setVaultSync("failed");
        setVaultSyncMsg(err instanceof Error ? err.message : "讀取本機對照表失敗");
      }
    })();
  }

  // 已經有一份對照表就直接選它（開檔對話框，不會跳「要取代嗎」）；沒有的話才用存檔對話框建立新的。
  async function handleChooseFile() {
    try {
      const handle = await openExistingMappingFile();
      setFileHandle(handle);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // 使用者取消
      setError(err instanceof Error ? err.message : "開啟本機對照表失敗");
    }
  }

  async function handleCreateFile() {
    try {
      const handle = await pickMappingFile();
      setFileHandle(handle);
      setError(null);
    } catch {
      // 使用者取消選擇視窗，不需顯示錯誤
    }
  }

  async function retryPendingMapping() {
    if (!pendingMapping || !fileHandle) return;
    try {
      const ok = await requestHandlePermission(fileHandle);
      if (!ok) throw new Error("本機檔案存取權限被拒絕");
      await appendMappingRow(fileHandle, {
        mrn: pendingMapping.mrn,
        research_id: pendingMapping.researchId,
        case_id: pendingMapping.caseId,
        created_at: new Date().toISOString(),
        name: pendingMapping.name,
      });
      syncVaultInBackground(fileHandle);
      const created = { caseId: pendingMapping.caseId, researchId: pendingMapping.researchId };
      setPendingMapping(null);
      setError(null);
      finishCreate(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "本機對照表寫入仍然失敗");
    }
  }

  // 建檔完成後的動線：連續收案模式留在原頁並清空，一般模式跳進個案頁。
  function finishCreate(created: { caseId: string; researchId: string }) {
    if (!isIntake) {
      router.push(`/cases/${created.caseId}`);
      return;
    }
    formRef.current?.reset();
    setMrn("");
    setPatientName("");
    setSex("");
    setResetKey((k) => k + 1);
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
      const trimmedMrn = mrn.trim();
      const trimmedName = patientName.trim();
      let handle = fileHandle;

      // 有填病歷號或姓名才需要本機檔案：先在這次點擊的使用者操作內取得檔案與寫入權限，
      // 避免這些資料真的送出前，本機儲存這一步就先失敗。
      if (trimmedMrn || trimmedName) {
        if (!supported) {
          throw new Error(
            "這台裝置沒辦法寫入本機對照表：病歷號/姓名要存到你電腦上的 CSV，需要桌機版 Chrome / Edge 的 File System Access API，手機與平板的瀏覽器（含 Android Chrome、iPad Safari）一律沒有這個功能。請改用診間電腦建檔，或先把病歷號與姓名留空、之後在電腦上補對照。"
          );
        }
        if (!handle) {
          handle = await pickMappingFile();
          setFileHandle(handle);
        }
        const ok = await requestHandlePermission(handle);
        if (!ok) throw new Error("本機對照表檔案的存取權限被拒絕，請重新選擇檔案");
      }

      const formData = new FormData(formRef.current);
      formData.delete("mrn"); // 病歷號絕不送到伺服器
      formData.delete("patient_name"); // 姓名同理

      const { caseId, researchId } = await createCaseAction(formData);

      if ((trimmedMrn || trimmedName) && handle) {
        try {
          await appendMappingRow(handle, {
            mrn: trimmedMrn,
            research_id: researchId,
            case_id: caseId,
            created_at: new Date().toISOString(),
            name: trimmedName,
          });
          syncVaultInBackground(handle);
        } catch (err) {
          // 個案已經建立成功，只是本機寫入失敗——保留下來讓使用者重試，不要憑空遺失這筆對應。
          setPendingMapping({ caseId, researchId, mrn: trimmedMrn, name: trimmedName });
          setError(
            `個案已建立成功（研究編號：${researchId}），但病歷號對照表寫入失敗：${
              err instanceof Error ? err.message : "未知錯誤"
            }。請按下方「重試寫入」，或自行手動記錄這筆對應。`
          );
          return;
        }
      }

      finishCreate({ caseId, researchId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立個案失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-brand-100 bg-paper-raised p-6">
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
        <label className="block text-sm font-medium text-ink/80">病歷號與姓名（僅存本機，不上雲端）</label>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
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
            placeholder="姓名（僅寫入本機對照表）"
            className="w-full rounded-md border border-accent-300 px-3 py-2 text-sm outline-none focus:border-accent-500"
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
          <span>
            {!supported
              ? "手機／平板無法寫入本機對照表（需桌機版 Chrome/Edge）。這兩欄請留空，改在診間電腦補。"
              : fileHandle
              ? "已設定本機對照表檔案"
              : "尚未設定本機對照表檔案（送出時會請你選擇）"}
          </span>
          {supported && (
            <span className="flex gap-3">
              <button type="button" onClick={handleChooseFile} className="whitespace-nowrap text-xs text-accent-700 underline">
                {fileHandle ? "改選其他對照表" : "選擇既有對照表"}
              </button>
              <button type="button" onClick={handleCreateFile} className="whitespace-nowrap text-xs text-ink/40 underline">
                建立新的
              </button>
            </span>
          )}
        </div>

        {/* 保管庫同步：手機／平板端要靠它才查得到剛收的病人 */}
        {vaultExists && vaultSync && (
          <p
            className={`mt-2 rounded border px-2 py-1.5 text-xs ${
              vaultSync === "synced"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : vaultSync === "syncing"
                ? "border-brand-200 bg-brand-50 text-brand-800"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {vaultSync === "syncing" && "同步保管庫中…"}
            {vaultSync === "synced" && "✓ 已同步至雲端保管庫，手機／平板端查得到這位病人了"}
            {vaultSync === "locked" && (
              <>
                保管庫未解鎖，這筆對應<b>還沒同步到雲端</b>——手機／平板端目前查不到這位病人。{" "}
                <Link href="/local-tools/mrn-mapping" className="underline">
                  前往解鎖並同步
                </Link>
                （解鎖一次可管到分頁關閉）
              </>
            )}
            {vaultSync === "failed" && `保管庫同步失敗：${vaultSyncMsg ?? "未知錯誤"}。本機對照表已寫入，可稍後到對照表頁重新上傳。`}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-ink/80">診斷（ICD-9/10）</label>
        <DiagnosisPicker key={resetKey} codes={icdCodes} />
      </div>

      {/* 性別／年齡／手機主要由病人在自填頁填（決策 2026-07-29）。這裡收成折疊區，
          沒用平板的病人（長輩、趕時間）才展開由人員代填。 */}
      <PatientBasicFields collapsed={isIntake} sex={sex} onSexChange={setSex} />

      <div>
        <label className="block text-sm font-medium text-ink/80">套用追蹤時程範本</label>
        <select
          name="schedule_template_id"
          value={scheduleTemplateId}
          onChange={(e) => setScheduleTemplateId(e.target.value)}
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">不套用（之後再手動設定）</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {isIntake && <p className="mt-1 text-xs text-ink/40">連續收案時這一欄不會被清空。</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-ink/80">知情同意書已簽署日期</label>
        <input
          type="date"
          name="consent_signed_at"
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <p className="mt-1 text-xs text-ink/40">紙本簽署流程不變，此欄位僅記錄狀態；未填代表尚未簽署。</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          {pendingMapping && (
            <button
              type="button"
              onClick={retryPendingMapping}
              className="mt-2 block whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
            >
              重試寫入本機對照表
            </button>
          )}
        </div>
      )}

      {/* 連續收案模式：建完留在原頁，這條橫幅是唯一的「真的存進去了」回饋 */}
      {lastCreated && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>
            ✓ 已建立 <b className="font-data">{lastCreated.researchId}</b>
          </span>
          <Link
            href={`/patient/${lastCreated.caseId}/intake`}
            className="whitespace-nowrap rounded-md bg-brand-700 px-3 py-1.5 text-xs text-white hover:bg-brand-800"
          >
            交給病人填
          </Link>
          <Link href={`/cases/${lastCreated.caseId}`} className="whitespace-nowrap text-xs text-brand-800 underline">
            開個案頁
          </Link>
        </div>
      )}

      <Button type="submit" pending={submitting} pendingText="建立中…" className="w-full">
        {isIntake ? "建立並繼續收下一位" : "建立個案"}
      </Button>
    </form>
  );
}

// 性別／年齡／手機：病人自填頁的主要欄位，收案頁只當備援（可折疊）。
function PatientBasicFields({
  collapsed,
  sex,
  onSexChange,
}: {
  collapsed: boolean;
  sex: string;
  onSexChange: (v: string) => void;
}) {
  const fields = (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="block text-sm font-medium text-ink/80">性別</label>
        <select
          name="sex"
          value={sex}
          onChange={(e) => onSexChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">未填</option>
          <option value="F">女</option>
          <option value="M">男</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink/80">年齡</label>
        <input
          type="number"
          name="age_at_enrollment"
          min={0}
          max={130}
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink/80">出生日期</label>
        <input
          type="date"
          name="birth_date"
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink/80">手機號碼</label>
        <input
          name="phone_number"
          type="tel"
          inputMode="tel"
          placeholder="不存姓名/病歷號"
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
    </div>
  );

  if (!collapsed) return fields;

  return (
    <details className="rounded-md border border-brand-100 p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink/70">
        性別／年齡／手機（選填）
        <span className="ml-2 text-xs font-normal text-ink/40">病人自填頁會問，這裡只在不用平板時代填</span>
      </summary>
      <div className="mt-3">{fields}</div>
    </details>
  );
}
