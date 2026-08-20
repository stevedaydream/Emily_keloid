"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { createCaseAction } from "./actions";
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

/**
 * 收案表單只有三格：負責醫師、病歷號、姓名（決策 2026-08-20，見 pending.md F-B）。
 *
 * 部長退出收案後，收案由診間護理師執行，其餘資料一律由病人在平板自填。
 * 原本表單上的性別／年齡／出生日期／手機與病人自填的 basic 段重複，已移除；
 * ICD 診斷、追蹤時程、同意書日期則改成事後補：
 *   · 追蹤時程改以**手術日**起算，登記手術後才產生（F-D1），收案當下排不了
 *   · 同意書實務上是病人填完平板才補簽（F-C1），收案當下也填不了
 * 負責醫師留著是硬需求——研究編號 [醫師碼]-[年]-[序] 靠它產生。
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
  // 姓名跟病歷號一樣只寫進本機對照表，送出前會從 FormData 移除，絕不進伺服器。
  const [patientName, setPatientName] = useState("");
  const [supported, setSupported] = useState(true);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

      {/* 診斷、追蹤時程、同意書日期都不在這裡（決策 2026-08-20，見本檔頂端註解）。 */}
      <p className="rounded-md border border-brand-100 bg-paper-sunken px-3 py-2 text-xs text-ink/50">
        建檔後把平板交給病人自填基本資料、病史、就診資訊與兩份量表。
        診斷與同意書日期在個案頁補；追蹤時程會在登記手術後自動產生（術後每月一次、共 24 次）。
      </p>

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
