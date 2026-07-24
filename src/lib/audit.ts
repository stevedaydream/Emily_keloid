import { supabaseServer } from "@/lib/supabase";

export async function logAudit(params: {
  caseId?: string | null;
  operatorName: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
}) {
  const supabase = supabaseServer();
  await supabase.from("audit_log").insert({
    case_id: params.caseId ?? null,
    operator_name: params.operatorName,
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId ?? null,
    detail: params.detail ?? {},
  });
}
