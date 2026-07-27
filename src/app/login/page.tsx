import { loginAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import BrandMark from "@/components/ui/BrandMark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        action={loginAction}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-brand-100 bg-paper-raised p-8 shadow-[0_1px_2px_rgba(27,35,24,0.06),0_12px_32px_-16px_rgba(27,35,24,0.25)]"
      >
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-3 font-heading text-lg font-medium text-brand-900">
            蟹足腫研究資料收集平台
          </h1>
          <p className="mt-1 text-sm text-ink/60">請輸入診間共用密碼登入</p>
        </div>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          placeholder="密碼"
          className="w-full rounded-md border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">密碼錯誤，請再試一次</p>}
        <SubmitButton className="w-full" pendingText="登入中…">
          登入
        </SubmitButton>
      </form>
    </div>
  );
}
