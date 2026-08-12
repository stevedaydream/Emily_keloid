"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { getConfiguredHandle, requestHandlePermission, readAllRows, type MrnMappingRow } from "@/lib/localMrnStore";
import { decryptRows } from "@/lib/mrnVault";
import { loadVaultAction } from "@/app/local-tools/mrn-mapping/vaultActions";

// 匯出檔為了去識別化，「受試者」與「病歷號」兩欄是空的——但部長要對照病人時就需要它們。
//
// 這個功能在**瀏覽器端**把姓名補回去：先照常抓伺服器產生的匯出檔（裡面沒有姓名），
// 再用對照表逐列填入，最後在本機重新產生一個 xlsx。
//
// 姓名來源有兩個，都在瀏覽器端解出來：
// - 本機對照表：診間電腦掛著的 CSV（正本）
// - 雲端加密保管庫：輸入通行碼在瀏覽器解密（手機／平板、或沒掛檔案的電腦可用）
//
// 伺服器兩邊都幫不上忙：它沒有本機檔案，而保管庫的通行碼從不離開瀏覽器（見 lib/mrnVault.ts），
// 所以「在伺服器解密後一起匯出」不是沒做，是這個架構下做不到——也正因如此才要在這裡補。
//
// 產出的檔案是**可還原身分的完整個資**，所以檔名刻意標示，畫面上也警告。

type Phase = "idle" | "reading" | "downloading" | "filling" | "done" | "error";
type Source = "local" | "vault";

export default function IdentifiedExport({ query = "" }: { query?: string }) {
  const [linked, setLinked] = useState(false);
  const [vaultRows, setVaultRows] = useState<number | null>(null);
  const [source, setSource] = useState<Source>("local");
  const [passphrase, setPassphrase] = useState("");
  const [withMrn, setWithMrn] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const handle = await getConfiguredHandle().catch(() => null);
      const hasLocal = !!handle;
      setLinked(hasLocal);
      try {
        const v = await loadVaultAction();
        if (v) setVaultRows(v.row_count);
        // 沒掛本機檔案（例如手機）就預設走保管庫
        if (!hasLocal && v) setSource("vault");
      } catch {
        /* 讀不到就當作沒有保管庫 */
      }
    })();
  }, []);

  async function loadRows(): Promise<MrnMappingRow[]> {
    if (source === "local") {
      const handle = await getConfiguredHandle();
      if (!handle) throw new Error("尚未設定本機對照表，請先到「病歷號對照維護」選擇檔案");
      const ok = await requestHandlePermission(handle);
      if (!ok) throw new Error("本機對照表的存取權限被拒絕");
      return readAllRows(handle);
    }
    const vault = await loadVaultAction();
    if (!vault) throw new Error("雲端尚未建立保管庫，請先在診間電腦上傳一次");
    return decryptRows(vault, passphrase);
  }

  async function run() {
    setMessage(null);
    try {
      setPhase("reading");
      const rows = await loadRows();
      setPassphrase(""); // 用完就丟，不留在 state 裡
      const byResearchId = new Map(rows.map((r) => [r.research_id.trim(), r]));

      setPhase("downloading");
      const res = await fetch(`/api/export/structured-data${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error(`取得匯出檔失敗（${res.status}）`);
      const buffer = await res.arrayBuffer();

      setPhase("filling");
      // exceljs 只在按下按鈕時才載入（約 1MB），不拖慢整個頁面
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      // 2026-08-12 起匯出是部長編碼簿的 4 張主表，每張都有自己的 Subject_ID / Name / Chart No.，
      // 所以要逐張填（只填第一張的話另外三張仍然沒有姓名）。附表沒有姓名欄，跳過。
      const MAIN_SHEETS = ["Basic Info.", "Operation", "Year 1 follow-up", "Year 2 follow-up"];
      let filled = 0;
      const missingIds = new Set<string>();
      let sheetsDone = 0;

      for (const sheetName of MAIN_SHEETS) {
        const ws = wb.getWorksheet(sheetName);
        if (!ws) continue;
        // 第 1 列是編碼說明、第 2 列是欄名、第 3 列起才是資料
        const header = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? "").trim());
        const colOf = (name: string) => header.indexOf(name); // 0-based，含前置空元素所以剛好等於欄號
        const idCol = colOf("Subject_ID");
        const nameCol = colOf("Name");
        const mrnCol = colOf("Chart No.");
        if (idCol < 0 || nameCol < 0) continue;
        sheetsDone++;

        for (let r = 3; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const researchId = String(row.getCell(idCol).value ?? "").trim();
          if (!researchId) continue;
          const hit = byResearchId.get(researchId);
          if (!hit) {
            missingIds.add(researchId);
            continue;
          }
          if (hit.name) {
            row.getCell(nameCol).value = hit.name;
            filled++;
          }
          if (withMrn && mrnCol > 0 && hit.mrn) row.getCell(mrnCol).value = hit.mrn;
        }
      }
      if (sheetsDone === 0) throw new Error("匯出檔的欄位格式與預期不符（找不到 Subject_ID / Name 欄）");
      const missing = missingIds.size;

      const out = await wb.xlsx.writeBuffer();
      const blob = new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `keloid-data-含姓名${withMrn ? "病歷號" : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setPhase("done");
      setMessage(
        `已在 ${sheetsDone} 張工作表補上 ${filled} 格姓名${
          missing > 0 ? `；${missing} 個研究編號在對照表中查無資料（那些列維持空白）` : ""
        }。`
      );
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "產生失敗");
    }
  }

  const busy = phase === "reading" || phase === "downloading" || phase === "filling";
  const busyText =
    phase === "reading" ? "讀取對照表…" : phase === "downloading" ? "取得匯出檔…" : "填入姓名…";
  const ready = source === "local" ? linked : vaultRows !== null && passphrase.length > 0;

  return (
    <div className="mt-4 rounded-lg border border-accent-300 bg-accent-50/40 p-4">
      <h2 className="text-sm font-semibold text-accent-800">補上姓名的版本（本機產生）</h2>
      <p className="mt-1 text-xs text-ink/60">
        匯出檔 4 張主表的 <code>Name</code> 與 <code>Chart No.</code> 都是空的。這裡會在<b>你的瀏覽器裡</b>
        用對照表逐張填回去，再重新產生一個檔案——姓名與病歷號不會送到伺服器，保管庫的通行碼也不會。
        會沿用上方設定的篩選條件。
      </p>

      {!linked && vaultRows === null ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          這台裝置沒有掛上本機對照表，雲端也還沒有保管庫。請先到「病歷號對照維護」設定。
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/70">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={source === "local"} onChange={() => setSource("local")} disabled={!linked} />
              本機對照表{!linked && "（這台裝置未掛上）"}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={source === "vault"}
                onChange={() => setSource("vault")}
                disabled={vaultRows === null}
              />
              雲端保管庫{vaultRows !== null ? `（${vaultRows} 筆）` : "（尚未建立）"}
            </label>
          </div>

          {source === "vault" && (
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="保管庫通行碼"
              autoComplete="off"
              className="mt-2 w-full max-w-xs rounded-md border border-brand-200 px-2 py-1.5 text-sm"
            />
          )}

          <label className="mt-3 flex items-center gap-2 text-xs text-ink/70">
            <input type="checkbox" checked={withMrn} onChange={(e) => setWithMrn(e.target.checked)} />
            同時填入病歷號（要拿去 HIS 查資料時才需要）
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={!ready} pending={busy} pendingText={busyText} variant="accent">
              產生含姓名的匯出檔
            </Button>
            {message && (
              <span className={`text-xs ${phase === "error" ? "text-red-600" : "text-emerald-700"}`}>{message}</span>
            )}
          </div>

          <p className="mt-3 text-xs text-accent-800">
            ⚠️ 產生的檔案<b>可以還原病人身分</b>，等同於病歷資料。請存在診間電腦、不要放進會同步到雲端的資料夾，
            也不要用電子郵件傳送。只要研究分析用途，請用上面那份不含姓名的版本。
          </p>
        </>
      )}
    </div>
  );
}
