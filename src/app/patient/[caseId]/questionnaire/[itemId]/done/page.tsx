import Link from "next/link";

export default async function QuestionnaireDonePage({
  params,
}: {
  params: Promise<{ caseId: string; itemId: string }>;
}) {
  const { caseId } = await params;
  return (
    <div className="mx-auto max-w-sm text-center">
      <div className="rounded-2xl border border-slate-300 bg-white p-8 shadow-sm">
        <p className="text-lg font-semibold text-emerald-600">問卷已送出 ✓</p>
        <p className="mt-2 text-sm text-slate-500">感謝您的填寫，資料已同步至研究團隊。</p>
        <Link href={`/cases/${caseId}`} className="mt-4 inline-block text-sm text-blue-600 underline">
          回個案頁面（診間端視角）
        </Link>
      </div>
    </div>
  );
}
