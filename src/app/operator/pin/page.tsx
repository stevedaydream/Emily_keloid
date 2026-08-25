import Link from "next/link";
import { redirect } from "next/navigation";
import { adminPinIsSet } from "@/lib/adminPin";
import BrandMark from "@/components/ui/BrandMark";
import PinForm from "./PinForm";

export default async function AdminPinGatePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; next?: string }>;
}) {
  const { name = "", next = "/" } = await searchParams;
  // 沒設定 PIN（或直接開這個網址）就沒有東西要驗，回選單重來一次
  if (!name || !(await adminPinIsSet())) redirect("/operator");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-brand-100 bg-paper-raised p-8 shadow-[0_1px_2px_rgba(27,35,24,0.06),0_12px_32px_-16px_rgba(27,35,24,0.25)]">
        <div className="flex flex-col items-center text-center">
          <BrandMark />
          <h1 className="mt-3 font-heading text-lg font-medium text-brand-900">{name}</h1>
          <p className="mt-1 text-sm text-ink/60">
            這個身分可以使用維運工具（測試模式、清除測試個案、匯出金鑰），需要 PIN
          </p>
        </div>
        <PinForm name={name} next={next} />
        <Link href="/operator" className="block text-center text-xs text-ink/40 underline">
          換一個操作者
        </Link>
      </div>
    </div>
  );
}
