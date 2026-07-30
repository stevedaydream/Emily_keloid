"use client";

import { useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  parseTemplateList,
  renderTemplate,
  type LineTemplateDef,
} from "@/lib/lineTemplates";
import { saveLineTemplateAction, resetLineTemplateAction } from "./actions";

// 提醒訊息帶變數（{{dueDate}} 之類），存檔後才看得到樣子太危險——
// 這裡邊打邊用範例值套出預覽，送出前就知道病人會收到什麼。

export default function TemplateEditor({
  def,
  value,
  overridden,
  updatedAt,
  updatedBy,
}: {
  def: LineTemplateDef;
  value: string;
  overridden: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;

  const sampleVars = Object.fromEntries((def.vars ?? []).map((v) => [v.name, v.sample]));
  const preview = renderTemplate(draft, sampleVars);
  const listItems = def.kind === "list" ? parseTemplateList(draft) : [];

  return (
    <li className="rounded-lg border border-brand-100 bg-paper-raised p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-heading text-sm font-semibold text-brand-900">{def.label}</h3>
        {overridden ? (
          <span className="rounded bg-accent-100 px-1.5 py-0.5 text-xs text-accent-800">已修改</span>
        ) : (
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-ink/40">預設</span>
        )}
        <code className="font-data text-[11px] text-ink/30">{def.key}</code>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink/55">{def.description}</p>

      <form action={saveLineTemplateAction} className="mt-3 space-y-2">
        <input type="hidden" name="key" value={def.key} />

        {def.kind === "multiline" ? (
          <textarea
            name="content"
            rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-md border border-brand-200 px-2 py-1.5 font-body text-sm leading-relaxed"
          />
        ) : (
          <input
            name="content"
            type={def.kind === "number" ? "number" : "text"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`rounded-md border border-brand-200 px-2 py-1.5 text-sm ${
              def.kind === "number" ? "w-24" : "w-full"
            }`}
          />
        )}

        {def.vars && def.vars.length > 0 && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/45">
            {def.vars.map((v) => (
              <span key={v.name}>
                <code className="font-data text-brand-700">{`{{${v.name}}}`}</code> {v.desc}
              </span>
            ))}
          </p>
        )}

        {/* 預覽：文字類套範例值、清單類列出實際會生效的關鍵字、數字類不必預覽 */}
        {def.kind === "list" ? (
          <div className="rounded-md bg-brand-50/50 p-2 text-xs">
            <span className="text-ink/45">實際生效的關鍵字：</span>
            {listItems.length === 0 ? (
              <span className="text-amber-700">（空的，會沿用預設值）</span>
            ) : (
              listItems.map((k) => (
                <span key={k} className="ml-1 rounded bg-paper-raised px-1.5 py-0.5 font-data text-ink/70">
                  {k}
                </span>
              ))
            )}
          </div>
        ) : def.kind === "number" ? null : (
          <div className="rounded-md bg-brand-50/50 p-2">
            <div className="text-xs text-ink/45">
              病人會看到{def.vars && def.vars.length > 0 ? "（變數套範例值）" : ""}：
            </div>
            {preview.trim() ? (
              <pre className="mt-1 whitespace-pre-wrap break-words font-body text-sm text-ink/80">{preview}</pre>
            ) : (
              <p className="mt-1 text-sm text-amber-700">（空白：這一段不會出現在訊息裡）</p>
            )}
          </div>
        )}

        {def.lockedSuffix && (
          <div className="rounded-md border border-dashed border-brand-200 bg-brand-50/30 p-2">
            <div className="text-xs font-medium text-ink/50">
              🔒 以下安全規則一律附加，不開放修改（決策 2026-07-26 的 IRB 前提）
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-words font-body text-xs text-ink/50">
              {def.lockedSuffix}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" pendingText="儲存中…" disabled={!dirty}>
            儲存
          </SubmitButton>
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft(value)}
              className="text-xs text-ink/40 underline"
            >
              取消變更
            </button>
          )}
          {(updatedAt || updatedBy) && (
            <span className="text-xs text-ink/35">
              {updatedBy && `${updatedBy} `}
              {updatedAt && `於 ${updatedAt.slice(0, 16).replace("T", " ")} 修改`}
            </span>
          )}
        </div>
      </form>

      {overridden && (
        <form action={resetLineTemplateAction} className="mt-2">
          <input type="hidden" name="key" value={def.key} />
          <SubmitButton
            variant="ghost"
            size="sm"
            className="!px-0 !py-0 text-xs text-ink/40 underline hover:!bg-transparent"
            pendingText="處理中…"
          >
            恢復預設內容
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
