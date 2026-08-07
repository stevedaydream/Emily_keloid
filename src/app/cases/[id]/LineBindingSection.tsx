import QRCode from "qrcode";
import SubmitButton from "@/components/ui/SubmitButton";
import { bindDeepLink, bindMessageFor } from "@/lib/line";
import { generateLineBindCodeAction, unbindLineAction } from "./actions";

type Props = {
  caseId: string;
  lineBound: boolean;
  lineBoundAt: string | null;
  bindCode: string | null;
  bindCodeExpiresAt: string | null;
};

// 擺在頁首研究編號旁邊（2026-07-29 使用者要求），跟收案一條龍在同一個視野裡——
// 綁定狀態是「這個個案的整體狀態」，不是某個要填的區塊。
// 但 QR code 有 160px 高，常駐會把頁首撐開，所以收在 <details> 裡：
// 平常只有一顆狀態徽章，要給病人掃的時候才展開。用 <details> 而不是 client component，
// 是因為這裡不需要任何互動狀態，瀏覽器原生就做得到。
export default async function LineBindingSection({
  caseId,
  lineBound,
  lineBoundAt,
  bindCode,
  bindCodeExpiresAt,
}: Props) {
  const basicId = process.env.LINE_OA_BASIC_ID;
  const deepLink = bindCode ? bindDeepLink(bindCode, basicId) : null;
  // QR 在伺服器端產生，不呼叫任何外部服務（綁定碼不會離開這台伺服器）
  const qrDataUrl = deepLink
    ? await QRCode.toDataURL(deepLink, { width: 320, margin: 1, errorCorrectionLevel: "M" })
    : null;

  const expired = bindCodeExpiresAt ? new Date(bindCodeExpiresAt) < new Date() : false;
  const hasUsableCode = !!bindCode && !expired;

  return (
    <details id="section-line" className="scroll-mt-4">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
          lineBound
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : hasUsableCode
              ? "border-accent-300 bg-accent-50 text-accent-800"
              : "border-brand-200 bg-white text-ink/50"
        }`}
      >
        <span aria-hidden>{lineBound ? "✓" : hasUsableCode ? "◔" : "○"}</span>
        LINE 提醒：{lineBound ? "已綁定" : hasUsableCode ? "待病人掃碼" : "未綁定"}
        <span className="text-ink/30">▾</span>
      </summary>

      <div className="mt-2 rounded-lg border border-brand-100 bg-white p-3">
        {lineBound ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-ink/60">
              綁定後，回診追蹤與放射治療的提醒會透過 LINE 自動通知病人；訊息不含研究編號、部位等可識別資訊。
            </span>
            {lineBoundAt && (
              <span className="text-ink/40">綁定於 {new Date(lineBoundAt).toLocaleString("zh-TW")}</span>
            )}
            <form action={unbindLineAction}>
              <input type="hidden" name="case_id" value={caseId} />
              <SubmitButton variant="ghost" size="sm" className="text-xs text-red-500 underline" pendingText="解除中…">
                解除綁定
              </SubmitButton>
            </form>
            <p className="w-full text-xs text-ink/40">病人換手機或綁錯人時才需要解除；解除後那支 LINE 可以重新綁定。</p>
          </div>
        ) : hasUsableCode ? (
          <div className="flex flex-wrap items-start gap-4">
            {qrDataUrl ? (
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="LINE 綁定 QR code" className="h-36 w-36 rounded border border-brand-100" />
                <p className="mt-1 text-xs text-ink/50">請病人用 LINE 掃描</p>
              </div>
            ) : (
              <p className="max-w-xs rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                尚未設定官方帳號 ID（環境變數 <code>LINE_OA_BASIC_ID</code>），無法產生掃碼連結。
                病人仍可加好友後手動輸入右側綁定碼。
              </p>
            )}

            <div className="space-y-1">
              <p className="text-xs text-ink/50">綁定碼（請病人在 LINE 對話框輸入）</p>
              <p className="font-data text-2xl font-medium tracking-widest text-brand-900">{bindCode}</p>
              <p className="text-xs text-ink/50">
                病人輸入內容：<code className="rounded bg-brand-50 px-1">{bindMessageFor(bindCode!)}</code>
              </p>
              {bindCodeExpiresAt && (
                <p className="text-xs text-ink/40">有效至 {new Date(bindCodeExpiresAt).toLocaleString("zh-TW")}</p>
              )}
              <form action={generateLineBindCodeAction} className="pt-1">
                <input type="hidden" name="case_id" value={caseId} />
                <SubmitButton variant="outline" size="sm" pendingText="產生中…">
                  重新產生綁定碼
                </SubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-ink/60">
              綁定後，回診追蹤與放射治療的提醒會透過 LINE 自動通知病人。
            </span>
            {expired && <span className="text-xs text-amber-700">先前的綁定碼已逾期</span>}
            <form action={generateLineBindCodeAction}>
              <input type="hidden" name="case_id" value={caseId} />
              <SubmitButton size="sm" pendingText="產生中…">
                產生綁定碼與 QR code
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
    </details>
  );
}
