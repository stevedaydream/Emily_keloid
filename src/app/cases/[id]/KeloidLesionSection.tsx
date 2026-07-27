"use client";

import SubmitButton from "@/components/ui/SubmitButton";
import { addKeloidLesionAction, deleteKeloidLesionAction } from "./actions";

type Lesion = {
  id: string;
  site_no: number | null;
  body_site: string;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  note: string | null;
};

function formatSize(l: Lesion) {
  const dims = [l.length_cm, l.width_cm, l.height_cm].filter((v) => v !== null);
  if (dims.length === 0) return "尺寸未填";
  return `${l.length_cm ?? "—"} x ${l.width_cm ?? "—"} x ${l.height_cm ?? "—"} cm`;
}

export default function KeloidLesionSection({ caseId, lesions }: { caseId: string; lesions: Lesion[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink/70">
        蟹足腫部位（可多處，依序編號 1、2…，各自可填描述與尺寸；拍照時可直接點選對應部位）
      </label>

      <ul className="mt-1 space-y-1">
        {lesions.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-100 px-3 py-1.5 text-sm">
            <span>
              <b className="mr-1 text-brand-700">部位{l.site_no}</b>
              <b>{l.body_site}</b>
              <span className="ml-2 font-data text-ink/60">{formatSize(l)}</span>
              {l.note && <span className="ml-2 text-xs text-ink/40">（{l.note}）</span>}
            </span>
            <form
              action={deleteKeloidLesionAction}
              onSubmit={(e) => {
                if (!confirm("確定要刪除這筆病灶測量嗎？")) e.preventDefault();
              }}
            >
              <input type="hidden" name="case_id" value={caseId} />
              <input type="hidden" name="lesion_id" value={l.id} />
              <SubmitButton variant="ghost" size="sm" className="!px-0 !py-0 text-xs text-red-500 underline hover:!bg-transparent" pendingText="刪除中…">
                刪除
              </SubmitButton>
            </form>
          </li>
        ))}
        {lesions.length === 0 && <li className="text-xs text-ink/40">尚無病灶測量紀錄</li>}
      </ul>

      <form action={addKeloidLesionAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-brand-100 p-2">
        <input type="hidden" name="case_id" value={caseId} />
        <div>
          <label className="block text-[11px] text-ink/50">部位</label>
          <input name="body_site" required placeholder="例：右耳垂" className="mt-0.5 w-28 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
        </div>
        <div>
          <label className="block text-[11px] text-ink/50">長 cm</label>
          <input name="length_cm" type="number" step="0.1" className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
        </div>
        <div>
          <label className="block text-[11px] text-ink/50">寬 cm</label>
          <input name="width_cm" type="number" step="0.1" className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
        </div>
        <div>
          <label className="block text-[11px] text-ink/50">高 cm</label>
          <input name="height_cm" type="number" step="0.1" className="mt-0.5 w-16 rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="block text-[11px] text-ink/50">備註</label>
          <input name="note" className="mt-0.5 w-full rounded-md border border-brand-200 px-1.5 py-1 text-xs" />
        </div>
        <SubmitButton variant="outline" size="sm" pendingText="新增中…">
          ＋ 新增病灶
        </SubmitButton>
      </form>
    </div>
  );
}
