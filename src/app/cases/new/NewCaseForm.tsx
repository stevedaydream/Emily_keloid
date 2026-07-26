"use client";

import { useState } from "react";
import BodyDiagram from "@/components/BodyDiagram";
import { createCaseAction } from "./actions";

type Zone = { id: string; zone_key: string; view: "front" | "back"; display_name: string; dose_category: string };
type Doctor = { id: string; code: string; name: string };
type Template = { id: string; name: string };

export default function NewCaseForm({
  doctors,
  templates,
  zones,
}: {
  doctors: Doctor[];
  templates: Template[];
  zones: Zone[];
}) {
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);

  return (
    <form action={createCaseAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <input type="hidden" name="body_part_zone_id" value={selectedZone?.id ?? ""} />

      <div>
        <label className="block text-sm font-medium text-slate-700">負責醫師</label>
        <select name="doctor_id" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">蟹足腫部位</label>
        <BodyDiagram zones={zones} currentZoneKey={selectedZone?.zone_key} onSelect={setSelectedZone} />
        <p className="mt-1 text-xs text-slate-500">
          {selectedZone
            ? `已選擇：${selectedZone.display_name}`
            : "點選人形圖上的部位（可之後在個案頁面或拍照時變更）"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">性別</label>
          <select name="sex" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">未填</option>
            <option value="F">女</option>
            <option value="M">男</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">年齡</label>
          <input
            type="number"
            name="age_at_enrollment"
            min={0}
            max={130}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">病人手機號碼</label>
        <input
          name="phone_number"
          placeholder="供 LINE 綁定通知使用（不存姓名/病歷號）"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">套用追蹤時程範本</label>
        <select name="schedule_template_id" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">不套用（之後再手動設定）</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">知情同意書已簽署日期</label>
        <input
          type="date"
          name="consent_signed_at"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-400">紙本簽署流程不變，此欄位僅記錄狀態；未填代表尚未簽署。</p>
      </div>

      <button
        type="submit"
        className="w-full whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        建立個案
      </button>
    </form>
  );
}
