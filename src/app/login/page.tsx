import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        action={loginAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            蟹足腫研究資料收集平台
          </h1>
          <p className="mt-1 text-sm text-slate-500">請輸入診間共用密碼登入</p>
        </div>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          placeholder="密碼"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          autoFocus
        />
        {error && (
          <p className="text-sm text-red-600">密碼錯誤，請再試一次</p>
        )}
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          登入
        </button>
      </form>
    </div>
  );
}
