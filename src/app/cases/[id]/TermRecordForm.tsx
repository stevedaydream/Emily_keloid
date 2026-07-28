"use client";

import { useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import { addTermRecordAction } from "./actions";
import { parseTerm, termGroupLabel, termGroupsOf, UNGROUPED_LABEL } from "@/lib/terms";

type Term = { id: string; stage: string; term: string };

const STAGE_OPTIONS = [
  { value: "pre", label: "術前" },
  { value: "intra", label: "術中" },
  { value: "post", label: "術後" },
] as const;

const ALL = "__all__";

// 術語清單依選取的階段過濾（先前是不分階段全部列出、只在前面加階段標籤，
// 清單一長就很難找到該階段要用的術語）。切換階段時 checkbox 會重新掛載，
// 已勾的自然清空，避免送出到跟階段不符的術語。
//
// 2026-07-29：術語文字的【】前綴（【症狀】【病史】【切除】…）本來就是主任舊表的分群，
// 拆出來當第二層篩選排在「階段」旁邊；同一階段動輒 40 幾則，先縮到一組再找快得多。
export default function TermRecordForm({ caseId, terms }: { caseId: string; terms: Term[] }) {
  const [stage, setStage] = useState<string>("pre");
  const [group, setGroup] = useState<string>(ALL);
  // 「其他」：清單沒有的用語自行輸入，送出時會一併寫進後台術語庫供之後直接勾選。
  const [showOther, setShowOther] = useState(false);

  const stageTerms = terms.filter((t) => t.stage === stage);
  const groups = termGroupsOf(stageTerms);
  // 切換階段後，前一個階段選的子分類多半不存在於新階段，這時視同「全部」
  const activeGroup = group !== ALL && groups.includes(group) ? group : ALL;
  const visibleTerms = activeGroup === ALL ? stageTerms : stageTerms.filter((t) => termGroupLabel(t.term) === activeGroup);
  const stageLabel = STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? "";

  return (
    <form action={addTermRecordAction} className="mb-4 space-y-2 rounded-md border border-brand-100 p-3">
      <input type="hidden" name="case_id" value={caseId} />
      {/* 選了子分類時，「其他」自填的用語也掛進同一組（見 lib/terms 的 withTermGroup） */}
      <input type="hidden" name="other_term_group" value={activeGroup === ALL ? "" : activeGroup} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <label className="text-xs font-medium text-ink/70">階段</label>
        <select
          name="stage"
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setGroup(ALL);
          }}
          className="rounded-md border border-brand-200 px-2 py-1 text-sm"
        >
          {STAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {groups.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="ml-1 text-xs text-ink/40">分類</span>
            <button
              type="button"
              onClick={() => setGroup(ALL)}
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${
                activeGroup === ALL
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-brand-200 bg-white text-ink/60 hover:border-brand-400"
              }`}
            >
              全部 {stageTerms.length}
            </button>
            {groups.map((g) => {
              const count = stageTerms.filter((t) => termGroupLabel(t.term) === g).length;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${
                    activeGroup === g
                      ? "border-brand-700 bg-brand-700 text-white"
                      : "border-brand-200 bg-white text-ink/60 hover:border-brand-400"
                  }`}
                >
                  {g} {count}
                </button>
              );
            })}
          </div>
        )}

        <span className="text-xs text-ink/40">
          {visibleTerms.length > 0 ? `${stageLabel}術語 ${visibleTerms.length} 則（可複選）` : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTerms.map((t) => {
          const { group: g, label } = parseTerm(t.term);
          return (
            <label key={t.id} className="flex items-center gap-1 rounded border border-brand-100 px-2 py-1 text-xs">
              <input type="checkbox" name="term_ids" value={t.id} />
              {/* 選了單一分類時就不再重複標分類名稱，省得每則前面都掛一樣的字 */}
              {activeGroup === ALL && g && <span className="text-ink/35">{g}</span>}
              {label}
            </label>
          );
        })}
        {visibleTerms.length === 0 && (
          <p className="text-xs text-ink/40">
            {stageTerms.length === 0
              ? "此階段尚無術語，請至後台「醫學術語庫」新增，或用下方「其他」自行輸入"
              : "此分類尚無術語"}
          </p>
        )}
        <label className="flex items-center gap-1 rounded border border-dashed border-brand-200 px-2 py-1 text-xs">
          <input type="checkbox" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} />
          其他（自行輸入）
        </label>
      </div>

      {showOther && (
        <div>
          <input
            name="other_terms"
            placeholder="輸入清單沒有的術語，多則可用「、」或逗號分隔"
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-xs"
          />
          <p className="mt-0.5 text-[11px] text-ink/40">
            送出後會一併寫入後台「醫學術語庫」的{stageLabel}
            {activeGroup === ALL ? `清單（不指定分類，歸為「${UNGROUPED_LABEL}」）` : `→「${activeGroup}」分類`}
            ，之後其他個案就能直接勾選。
          </p>
        </div>
      )}

      <SubmitButton pendingText="新增中…">新增紀錄</SubmitButton>
    </form>
  );
}
