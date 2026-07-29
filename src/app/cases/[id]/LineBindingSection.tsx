import QRCode from "qrcode";
import InfoTooltip from "@/components/InfoTooltip";
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

// 綁定有兩條路（決策 2026-07-29 兩種都做）：
//  ① 診間拿螢幕給病人掃 QR → LINE 開啟對話並「預填」綁定訊息，病人按送出即可（不必打字）
//  ② 病人回家自己加好友時，照著唸的 6 碼綁定碼手動輸入
// 底層是同一組碼，所以不會有兩套狀態要維護。
export default async function LineBindingSection({ caseId, lineBound, lineBoundAt, bindCode, bindCodeExpiresAt }: Props) {
  const basicId = process.env.LINE_OA_BASIC_ID;
  const deepLink = bindCode ? bindDeepLink(bindCode, basicId) : null;
  // QR 在伺服器端產生，不呼叫任何外部服務（綁定碼不會離開這台伺服器）
  const qrDataUrl = deepLink
    ? await QRCode.toDataURL(deepLink, { width: 320, margin: 1, errorCorrectionLevel: "M" })
    : null;

  const expired = bindCodeExpiresAt ? new Date(bindCodeExpiresAt) < new Date() : false;

  return (
    <section
      id="section-line"
      data-nav-section
      data-nav-label="LINE 提醒綁定"
      className="scroll-mt-4 rounded-lg border border-brand-100 bg-white p-4"
    >
      <h2 className="mb-2 text-sm font-semibold text-ink/80">
        LINE 提醒綁定
        <InfoTooltip text="綁定後，回診追蹤與放射治療的提醒會透過 LINE 官方帳號自動通知病人。訊息內容不含研究編號、部位等可識別資訊。病人也可在同一個對話框詢問衛教問題。" />
      </h2>

      {lineBound ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-800">已綁定</span>
          {lineBoundAt && (
            <span className="text-xs text-ink/50">綁定於 {new Date(lineBoundAt).toLocaleString("zh-TW")}</span>
          )}
          <form action={unbindLineAction}>
            <input type="hidden" name="case_id" value={caseId} />
            <SubmitButton variant="ghost" size="sm" className="text-xs text-red-500 underline" pendingText="解除中…">
              解除綁定
            </SubmitButton>
          </form>
          <p className="w-full text-xs text-ink/40">
            病人換手機或綁錯人時才需要解除；解除後那支 LINE 帳號可以重新綁定。
          </p>
        </div>
      ) : bindCode && !expired ? (
        <div className="flex flex-wrap items-start gap-4">
          {qrDataUrl ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="LINE 綁定 QR code" className="h-40 w-40 rounded border border-brand-100" />
              <p className="mt-1 text-xs text-ink/50">請病人用 LINE 掃描</p>
            </div>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              尚未設定官方帳號 ID（環境變數 <code>LINE_OA_BASIC_ID</code>），無法產生掃碼連結。
              病人仍可加好友後手動輸入下方綁定碼。
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs text-ink/50">綁定碼（請病人在 LINE 對話框輸入）</p>
            <p className="font-data text-2xl font-medium tracking-widest text-brand-900">{bindCode}</p>
            <p className="text-xs text-ink/50">
              病人輸入內容：<code className="rounded bg-brand-50 px-1">{bindMessageFor(bindCode)}</code>
            </p>
            {bindCodeExpiresAt && (
              <p className="text-xs text-ink/40">
                有效至 {new Date(bindCodeExpiresAt).toLocaleString("zh-TW")}
              </p>
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
          <span className="rounded bg-ink/10 px-2 py-1 text-xs text-ink/50">未綁定</span>
          {expired && <span className="text-xs text-amber-700">先前的綁定碼已逾期</span>}
          <form action={generateLineBindCodeAction}>
            <input type="hidden" name="case_id" value={caseId} />
            <SubmitButton size="sm" pendingText="產生中…">
              產生綁定碼與 QR code
            </SubmitButton>
          </form>
        </div>
      )}
    </section>
  );
}
