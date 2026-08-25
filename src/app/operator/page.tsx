import { supabaseServer } from "@/lib/supabase";
import { LANDING_LABEL, toLandingMode } from "@/lib/operator";
import { adminPinIsSet } from "@/lib/adminPin";
import { setOperatorAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import BrandMark from "@/components/ui/BrandMark";

export default async function OperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "/" } = await searchParams;
  const supabase = supabaseServer();
  // 設了 PIN 之後這一頁的說明就不再是「不需輸入密碼」——系統管理者那一列會要 PIN。
  const pinOn = await adminPinIsSet();
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name, role, landing_mode, sort_order, is_system_admin")
    .eq("active", true)
    // 這是每天每個人的第一個畫面，最常被點的排最上面（順序在後台可調）
    .order("sort_order")
    .order("name");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-brand-100 bg-paper-raised p-8 shadow-[0_1px_2px_rgba(27,35,24,0.06),0_12px_32px_-16px_rgba(27,35,24,0.25)]">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-3 font-heading text-lg font-medium text-brand-900">請選擇目前操作者</h1>
          <p className="mt-1 text-sm text-ink/60">
            用於稽核紀錄，不需輸入密碼{pinOn ? "（系統管理者除外，需要 PIN）" : ""}
          </p>
        </div>
        <div className="space-y-2">
          {(operators ?? []).map((op) => (
            <form action={setOperatorAction} key={op.id}>
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="name" value={op.name} />
              <SubmitButton variant="outline" justify="start" pendingText="切換中…" className="w-full text-left">
                {op.name}
                {op.role ? <span className="ml-2 text-xs text-ink/40">{op.role}</span> : null}
                {pinOn && op.is_system_admin && <span className="ml-2 text-xs text-ink/40">🔒 需 PIN</span>}
                {/* 選了會落在哪一頁，先講清楚，免得以為功能不見了 */}
                <span className="ml-auto whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-xs text-accent-800">
                  → {LANDING_LABEL[toLandingMode(op.landing_mode)]}
                </span>
              </SubmitButton>
            </form>
          ))}
          {(!operators || operators.length === 0) && (
            <p className="text-sm text-ink/40">尚未設定操作者清單，請先至後台新增</p>
          )}
        </div>
      </div>
    </div>
  );
}
