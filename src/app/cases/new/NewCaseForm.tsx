"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/lib/localMrnStore";

type Doctor = { id: string; code: string; name: string };
type Template = { id: string; name: string };

export default function NewCaseForm({
  doctors,
  templates,
  icdCodes,
}: {
  doctors: Doctor[];
  templates: Template[];
  icdCodes: IcdOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [sex, setSex] = useState("");
  const [mrn, setMrn] = useState("");
  // 姓名跟病歷號一樣只寫進本機對照表，送出前會從 FormData 移除，絕不進伺服器。
  const [patientName, setPatientName] = useState("");
  const [supported, setSupported] = useState(true);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 個案已成功建立但本機對照表寫入失敗時，保留這筆資訊讓使用者可以重試或手動記錄。
  const [pendingMapping, setPendingMapping] = useState<{
    caseId: string;
    researchId: string;
    mrn: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    getConfiguredHandle().then(setFileHandle);
  }, []);

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
      const { caseId } = pendingMapping;
      setPendingMapping(null);
      router.push(`/cases/${caseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "本機對照表寫入仍然失敗");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setError(null);
    setSubmitting(true);

    try {
      const trimmedMrn = mrn.trim();
      const trimmedName = patientName.trim();
      let handle = fileHandle;

      // 有填病歷號或姓名才需要本機檔案：先在這次點擊的使用者操作內取得檔案與寫入權限，
      // 避免這些資料真的送出前，本機儲存這一步就先失敗。
      if (trimmedMrn || trimmedName) {
        if (!supported) {
          throw new Error("此瀏覽器不支援本機檔案存取（需使用 Chrome 或 Edge），請改用不需病歷號對照的方式建立個案，或更換瀏覽器");
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

      router.push(`/cases/${caseId}`);
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
        <select name="doctor_id" required className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500">
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-accent-200 bg-accent-50 p-3">
        <label className="block text-sm font-medium text-ink/80">病歷號與姓名（僅存本機，不上雲端）</label>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <input
            name="mrn"
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
              ? "此瀏覽器不支援本機檔案存取，需使用 Chrome 或 Edge"
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink/80">性別</label>
          <select
            name="sex"
            value={sex}
            onChange={(e) => setSex(e.target.value)}
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
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-ink/80">診斷（ICD-9/10）</label>
        <DiagnosisPicker codes={icdCodes} />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink/80">病人手機號碼</label>
        <input
          name="phone_number"
          placeholder="供 LINE 綁定通知使用（不存姓名/病歷號）"
          className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink/80">套用追蹤時程範本</label>
        <select name="schedule_template_id" className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">不套用（之後再手動設定）</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
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

      <Button type="submit" pending={submitting} pendingText="建立中…" className="w-full">
        建立個案
      </Button>
    </form>
  );
}
