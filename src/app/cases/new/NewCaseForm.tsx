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
  findByMrn,
  type MrnMappingRow,
} from "@/lib/localMrnStore";
import { syncVaultIfUnlocked, appendRowToVault, getVaultKey, subscribeVaultSession, readVaultRows } from "@/lib/vaultSession";
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

  /**
   * 病歷號撞號時擋下來的那一筆（2026-08-20）。**硬擋，沒有「再收一次」的出口。**
   *
   * 撞號原本完全不會報錯：伺服器看不到病歷號（決策 #1，送出前就從 FormData 刪掉了），
   * 本機 CSV 是純 append 不檢查，保管庫的去重依據是 research_id 而不是 mrn。
   * 結果是同一個病人被收案兩次、拿到兩個研究編號、對照表多一列——
   * 比當場報錯難救得多，因為要等到分析時才發現，那時已經分不清哪筆該刪。
   *
   * 為什麼硬擋而不是「確認後仍可建立」：一個病歷號就是一個人，一個人在這個研究裡
   * 只該有一筆個案。同一個病人身上又長了新的蟹足腫，那是**在既有個案上加一顆病灶**
   * （系統支援一個個案 20 顆，見 pending.md D4），不是重新收一次案。
   * 留一個「仍要建立」的按鈕，等於把這條規則交給門診當下最忙的那個人判斷。
   */
  const [duplicate, setDuplicate] = useState<{ mrn: string; rows: MrnMappingRow[] } | null>(null);

  // 保管庫同步狀態：只有在雲端真的有保管庫時才提示，否則沒用過這功能的人會看到莫名其妙的警告
  const [vaultExists, setVaultExists] = useState(false);
  // 平板沒有 File System Access，改用保管庫當寫入目標（決策 2026-08-20）。
  // 解鎖狀態會變（面板上可鎖定／解鎖），所以要訂閱而不是只讀一次。
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultSync, setVaultSync] = useState<"syncing" | "synced" | "locked" | "failed" | null>(null);
  const [vaultSyncMsg, setVaultSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    getConfiguredHandle().then(setFileHandle);
    loadVaultAction()
      .then((v) => setVaultExists(!!v))
      .catch(() => setVaultExists(false));
    const refreshUnlocked = () => void getVaultKey().then((k) => setVaultUnlocked(!!k));
    refreshUnlocked();
    return subscribeVaultSession(refreshUnlocked);
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
    if (!pendingMapping) return;
    // 保管庫是正本：只要解鎖就先寫它，跟這台裝置支不支援本機檔案無關
    // （2026-08-25 修正，理由同 handleSubmit 裡那段註解）。
    if (vaultUnlocked) {
      const r = await appendRowToVault({
        mrn: pendingMapping.mrn,
        research_id: pendingMapping.researchId,
        case_id: pendingMapping.caseId,
        created_at: new Date().toISOString(),
        name: pendingMapping.name,
      });
      if (r.status !== "saved") {
        setError(r.message ?? "寫入保管庫失敗");
        return;
      }
      const created = { caseId: pendingMapping.caseId, researchId: pendingMapping.researchId };
      setVaultSync("synced");
      setPendingMapping(null);
      setError(null);
      finishCreate(created);
      return;
    }
    if (!supported) {
      setError("保管庫未解鎖，且這台裝置沒有本機對照表可寫。請先到「病歷號對照維護」解鎖保管庫。");
      return;
    }
    if (!fileHandle) return;
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

      // 有填病歷號或姓名時要先確定寫得進去。桌機走本機 CSV（需在這次點擊的使用者操作內
      // 取得檔案與寫入權限）；平板沒有 File System Access，改把對照寫進雲端保管庫
      // （決策 2026-08-20：收案動線移到平板，保管庫取代 CSV 當權威來源）。
      if (trimmedMrn || trimmedName) {
        if (!supported && !vaultUnlocked) {
          throw new Error(
            "這台裝置沒有 File System Access，要記錄病歷號/姓名得改用雲端保管庫，但它目前是鎖住的。請到「病歷號對照維護」輸入通行碼解鎖（解鎖後 30 天內不用再打），或先把這兩格留空、之後再補對照。"
          );
        }
        if (supported && !vaultUnlocked) {
          // 只有本機檔案這一條路，所以檔案與權限一定要先拿到，拿不到就不能往下走
          if (!handle) {
            handle = await pickMappingFile();
            setFileHandle(handle);
          }
          const ok = await requestHandlePermission(handle);
          if (!ok) throw new Error("本機對照表檔案的存取權限被拒絕，請重新選擇檔案");
        } else if (supported) {
          // 保管庫已解鎖＝正本有地方放，本機 CSV 只是備份。
          // 這時候**不要**跳檔案選擇器、也不要因為權限被拒就整筆擋下來
          // （2026-08-25：使用者的 Android Chrome 宣稱支援 File System Access，
          //  但權限與寫入都不穩，原本會讓整個收案卡在這裡）。
          if (handle) {
            const ok = await requestHandlePermission(handle).catch(() => false);
            if (!ok) handle = null;
          }
        }
      }

      // ── 病歷號重複檢查（2026-08-20）────────────────────────────
      // 一定要在 createCaseAction 之前：個案一旦建立就拿到研究編號、佔掉一個流水號，
      // 事後刪除還得回頭處理編號空洞。
      // 檢查只能在瀏覽器端做——病歷號永遠不上伺服器，但這裡手上剛好有整份對照表。
      if (trimmedMrn) {
        const known = supported
          ? handle
            ? await readAllRows(handle)
            : null
          : await readVaultRows();
        if (known === null) {
          // 讀不到對照表就不能宣稱「沒撞到」。與其放行造成重複收案，不如擋下來講清楚。
          throw new Error(
            supported
              ? "還沒掛上本機對照表，無法確認這個病歷號是不是收過案了。請先按下方「選擇既有對照表」。"
              : "保管庫鎖定中，無法確認這個病歷號是不是收過案了。請先到「病歷號對照維護」解鎖。"
          );
        }
        const hits = findByMrn(known, trimmedMrn);
        if (hits.length > 0) {
          setDuplicate({ mrn: trimmedMrn, rows: hits });
          return;
        }
      }

      const formData = new FormData(formRef.current);
      formData.delete("mrn"); // 病歷號絕不送到伺服器
      formData.delete("patient_name"); // 姓名同理

      const { caseId, researchId } = await createCaseAction(formData);

      // ── 對照要寫到哪裡（2026-08-25 修正）────────────────────────
      //
      // 原本是二選一：`!supported` 才寫保管庫，`supported` 就只寫本機 CSV，保管庫靠背景
      // 把整份 CSV 重傳上去。這在「瀏覽器說支援 File System Access、實際上寫不進去」的
      // 裝置上會整組落空——使用者的 Android Chrome 正是這種：`isFileSystemAccessSupported()`
      // 回 true，於是走本機那條，而背景同步再把（空的）CSV 整份蓋回雲端，
      // 結果保管庫被寫成 0 筆，收案收了三筆對照表還是空的。
      //
      // 改成：**保管庫是正本（決策 2026-08-20），只要解鎖就一定直接寫進去**，
      // 跟這台裝置支不支援本機檔案無關；本機 CSV 有就順便寫一份當備份，寫不進去也不擋。
      let mappingSaved = false;
      const mappingRow = {
        mrn: trimmedMrn,
        research_id: researchId,
        case_id: caseId,
        created_at: new Date().toISOString(),
        name: trimmedName,
      };
      let vaultMessage: string | null = null;

      if (trimmedMrn || trimmedName) {
        if (vaultUnlocked) {
          const r = await appendRowToVault(mappingRow);
          if (r.status === "saved") {
            setVaultSync("synced");
            mappingSaved = true;
          } else {
            vaultMessage = r.message ?? "保管庫已鎖定";
            setVaultSync(r.status === "locked" ? "locked" : "failed");
            setVaultSyncMsg(vaultMessage);
          }
        }

        if (supported && handle) {
          try {
            await appendMappingRow(handle, mappingRow);
            mappingSaved = true;
          } catch (err) {
            // 本機寫不進去不再是致命錯誤——保管庫才是正本。只有兩邊都失敗才擋。
            vaultMessage = vaultMessage ?? (err instanceof Error ? err.message : "本機對照表寫入失敗");
          }
        }

        if (!mappingSaved) {
          setPendingMapping({ caseId, researchId, mrn: trimmedMrn, name: trimmedName });
          setError(
            `個案已建立成功（研究編號：${researchId}），但病歷號對照沒有寫進任何地方：${
              vaultMessage ?? "保管庫未解鎖，且這台裝置沒有可寫入的本機對照表"
            }。請到「病歷號對照維護」解鎖保管庫後按下方「重試寫入」，或先自行記下這筆對應。`
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

  // 第 2 步：建檔完成，唯一該做的事是把平板交給病人（決策 2026-08-20）。
  // 刻意整頁換掉而不是在表單下面加一條橫幅——護理師手上拿著平板，
  // 這一刻要按的東西必須大到不可能按錯，也不該和上一位的表單混在同一個畫面。
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
        <label className="block text-sm font-medium text-ink/80">病歷號與姓名（僅存本機，不上雲端）</label>
        {/* 平板／手機沒有 File System Access API，寫不了本機對照表。與其等到送出才擋，
            不如一開始就停用這兩格並講清楚後續怎麼補（2026-08-20：未來會用平板收案）。 */}
        {!supported && !vaultUnlocked && (
          <p className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <b>保管庫鎖定中，這兩格停用。</b>
            這台裝置沒有 File System Access（手機／平板一律沒有），病歷號與姓名要寫進雲端保管庫，
            但它目前鎖著。請到<b>「病歷號對照維護」</b>輸入通行碼解鎖——解鎖後 30 天內不用再打。
            也可以先留空照常建檔並交給病人填，之後再補對照。
          </p>
        )}
        {!supported && vaultUnlocked && (
          <p className="mt-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
            保管庫已解鎖，這兩格會<b>加密後寫進雲端保管庫</b>（不經過伺服器解密，也不會存進這台裝置）。
          </p>
        )}
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <input
            name="mrn"
            ref={mrnRef}
            autoFocus={isIntake && (supported || vaultUnlocked)}
            disabled={!supported && !vaultUnlocked}
            value={mrn}
            onChange={(e) => {
              setMrn(e.target.value);
              if (duplicate) setDuplicate(null);
            }}
            placeholder={supported || vaultUnlocked ? "病歷號（留空則不建立對照）" : "保管庫鎖定中"}
            className="w-full rounded-md border border-accent-300 px-3 py-2 text-sm outline-none focus:border-accent-500 disabled:cursor-not-allowed disabled:border-brand-100 disabled:bg-paper-sunken disabled:text-ink/30"
          />
          <input
            name="patient_name"
            disabled={!supported && !vaultUnlocked}
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder={supported || vaultUnlocked ? "姓名" : "保管庫鎖定中"}
            className="w-full rounded-md border border-accent-300 px-3 py-2 text-sm outline-none focus:border-accent-500 disabled:cursor-not-allowed disabled:border-brand-100 disabled:bg-paper-sunken disabled:text-ink/30"
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
          <span>
            {!supported
              ? vaultUnlocked
                ? "寫入目標：雲端保管庫（已解鎖）"
                : "寫入目標：雲端保管庫（鎖定中）"
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

      {/* 撞號：擋下來、指出是哪一筆，並說清楚正確的做法是加病灶而不是重收一次。
          刻意沒有「仍要建立」的按鈕——見上方 duplicate state 的說明。 */}
      {duplicate && (
        <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm">
          <p className="font-semibold text-red-800">
            病歷號 {duplicate.mrn} 已經收過案了，不能重複建檔。
          </p>
          <ul className="mt-2 space-y-1">
            {duplicate.rows.map((r, i) => (
              <li key={`${r.research_id}-${i}`} className="flex flex-wrap items-center gap-2 rounded bg-white px-2 py-1.5">
                <span className="font-data font-medium text-ink">{r.research_id}</span>
                {r.name && <span className="text-ink/60">{r.name}</span>}
                {r.created_at && (
                  <span className="text-xs text-ink/40">收案於 {String(r.created_at).slice(0, 10)}</span>
                )}
                {r.case_id ? (
                  <Link
                    href={`/cases/${r.case_id}`}
                    className="ml-auto whitespace-nowrap rounded border border-brand-300 bg-white px-2 py-1 text-xs text-brand-800 hover:bg-brand-50"
                  >
                    開啟這筆個案 →
                  </Link>
                ) : (
                  <span className="ml-auto text-xs text-ink/40">（舊資料，對照表沒有個案連結）</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-red-800">
            同一位病人身上又長了新的蟹足腫，請到那筆個案<b>加一顆病灶</b>，不要重新收案——
            一個病歷號在這個研究裡只該有一筆個案，重複收案會讓匯出時同一個人被算成兩位受試者。
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          {pendingMapping && (
            <button
              type="button"
              onClick={retryPendingMapping}
              className="mt-2 block whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
            >
              {supported ? "重試寫入本機對照表" : "重試寫入保管庫"}
            </button>
          )}
        </div>
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
              <span
                className={`block text-sm font-medium ${state === "todo" ? "text-ink/40" : "text-ink/80"}`}
              >
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
