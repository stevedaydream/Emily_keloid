import { supabaseServer } from "@/lib/supabase";
import { setOperatorAction } from "./actions";

export default async function OperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "/" } = await searchParams;
  const supabase = supabaseServer();
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name, role")
    .eq("active", true)
    .order("name");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            請選擇目前操作者
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            用於稽核紀錄，不需輸入密碼
          </p>
        </div>
        <div className="space-y-2">
          {(operators ?? []).map((op) => (
            <form action={setOperatorAction} key={op.id}>
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="name" value={op.name} />
              <button
                type="submit"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm hover:border-slate-500 hover:bg-slate-50"
              >
                {op.name}
                {op.role ? (
                  <span className="ml-2 text-xs text-slate-400">
                    {op.role}
                  </span>
                ) : null}
              </button>
            </form>
          ))}
          {(!operators || operators.length === 0) && (
            <p className="text-sm text-slate-400">
              尚未設定操作者清單，請先至後台新增
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
