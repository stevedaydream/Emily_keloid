"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BodyDiagram from "@/components/BodyDiagram";
import Button from "@/components/ui/Button";
import { createCaseAction } from "./actions";
import {
  isFileSystemAccessSupported,
  getConfiguredHandle,
  pickMappingFile,
  requestHandlePermission,
  appendMappingRow,
} from "@/lib/localMrnStore";

type Zone = { id: string; zone_key: string; view: "front" | "back"; display_name: string; dose_category: string };
type Doctor = { id: string; code: string; name: string };
type Template = { id: string; name: string };

export default function NewCaseForm({
  doctors,
  templates,
  zones,
}: {
  doctors: Doctor[];
  templates: Template[];
  zones: Zone[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [sex, setSex] = useState("");
  const [mrn, setMrn] = useState("");
  const [supported, setSupported] = useState(true);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 個案已成功建立但本機對照表寫入失敗時，保留這筆資訊讓使用者可以重試或手動記錄。
  const [pendingMapping, setPendingMapping] = useState<{ caseId: string; researchId: string; mrn: string } | null>(null);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    getConfiguredHandle().then(setFileHandle);
  }, []);

  async function handleChooseFile() {
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
      let handle = fileHandle;

      // 有填病歷號才需要本機檔案：先在這次點擊的使用者操作內取得檔案與寫入權限，
      // 避免病歷號真的送出前，本機儲存這一步就先失敗。
      if (trimmedMrn) {
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

      const { caseId, researchId } = await createCaseAction(formData);

      if (trimmedMrn && handle) {
        try {
          await appendMappingRow(handle, {
            mrn: trimmedMrn,
            research_id: researchId,
            case_id: caseId,
            created_at: new Date().toISOString(),
          });
        } catch (err) {
          // 個案已經建立成功，只是本機寫入失敗——保留下來讓使用者重試，不要憑空遺失這筆對應。
          setPendingMapping({ caseId, researchId, mrn: trimmedMrn });
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
      <input type="hidden" name="body_part_zone_id" value={selectedZone?.id ?? ""} />

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
        <label className="block text-sm font-medium text-ink/80">病歷號（僅存本機，不上雲端）</label>
        <input
          name="mrn"
          value={mrn}
          onChange={(e) => setMrn(e.target.value)}
          placeholder="留空則不建立病歷號對照"
          className="mt-1 w-full rounded-md border border-accent-300 px-3 py-2 text-sm outline-none focus:border-accent-500"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
          <span>
            {!supported
              ? "此瀏覽器不支援本機檔案存取，需使用 Chrome 或 Edge"
              : fileHandle
              ? "已設定本機對照表檔案"
              : "尚未設定本機對照表檔案（送出時會請你選擇）"}
          </span>
          {supported && (
            <button type="button" onClick={handleChooseFile} className="whitespace-nowrap text-xs text-accent-700 underline">
              {fileHandle ? "更換對照表位置" : "選擇對照表位置"}
            </button>
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
        <label className="mb-1 block text-sm font-medium text-ink/80">蟹足腫部位（第一處）</label>
        <BodyDiagram zones={zones} currentZoneKey={selectedZone?.zone_key} onSelect={setSelectedZone} sex={sex} />
        <p className="mt-1 text-xs text-ink/50">
          {selectedZone
            ? `已選擇：${selectedZone.display_name}（將建立為「部位1」，之後可在個案頁面新增其他部位並填尺寸）`
            : "點選人形圖上的部位，建檔後會成為此個案的「部位1」；多處病灶可在個案頁面陸續新增"}
        </p>
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
