import JSZip from "jszip";
import { supabaseServer } from "@/lib/supabase";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const supabase = supabaseServer();

  const [
    { data: cases },
    { data: diagnoses },
    { data: termRecords },
    { data: treatmentRecords },
    { data: scheduleItems },
    { data: responses },
    { data: answers },
  ] = await Promise.all([
    supabase.from("cases").select("research_id, enrollment_year, body_site, consent_signed_at, consent_confirmed_by, line_bound, data_source, created_by, created_at, doctors(code, name)"),
    supabase.from("case_diagnoses").select("is_primary, cases(research_id), icd_codes(code, system, description_full)"),
    supabase
      .from("case_term_records")
      .select("stage, recorded_at, recorded_by, cases(research_id), case_term_record_items(term_library(term))"),
    supabase.from("treatment_records").select("treatment_date, field_values, free_text, recorded_by, cases(research_id), treatment_types(name)"),
    supabase.from("case_schedule_items").select("label, due_date, status, completed_at, actions, cases(research_id)"),
    supabase.from("questionnaire_responses").select("id, submitted_at, submitted_via, cases(research_id), questionnaire_templates(name)"),
    supabase.from("questionnaire_answers").select("response_id, answer_value, questionnaire_questions(question_text)"),
  ]);

  const first = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

  const zip = new JSZip();

  zip.file(
    "cases.csv",
    toCsv(
      (cases ?? []).map((c) => {
        const d = first(c.doctors) as { code?: string; name?: string } | undefined;
        return {
          research_id: c.research_id,
          doctor_code: d?.code,
          doctor_name: d?.name,
          enrollment_year: c.enrollment_year,
          body_site: c.body_site,
          consent_signed_at: c.consent_signed_at,
          consent_confirmed_by: c.consent_confirmed_by,
          line_bound: c.line_bound,
          data_source: c.data_source,
          created_by: c.created_by,
          created_at: c.created_at,
        };
      })
    )
  );

  zip.file(
    "diagnoses.csv",
    toCsv(
      (diagnoses ?? []).map((d) => {
        const c = first(d.cases) as { research_id?: string } | undefined;
        const icd = first(d.icd_codes) as { code?: string; system?: string; description_full?: string } | undefined;
        return {
          research_id: c?.research_id,
          icd_system: icd?.system,
          icd_code: icd?.code,
          description: icd?.description_full,
          is_primary: d.is_primary,
        };
      })
    )
  );

  zip.file(
    "term_records.csv",
    toCsv(
      (termRecords ?? []).map((r) => {
        const c = first(r.cases) as { research_id?: string } | undefined;
        type Item = { term_library: { term: string } | { term: string }[] };
        const terms = ((r.case_term_record_items ?? []) as Item[])
          .map((it) => {
            const t = first(it.term_library) as { term?: string } | undefined;
            return t?.term;
          })
          .filter(Boolean)
          .join("; ");
        return {
          research_id: c?.research_id,
          stage: r.stage,
          recorded_at: r.recorded_at,
          recorded_by: r.recorded_by,
          terms,
        };
      })
    )
  );

  zip.file(
    "treatment_records.csv",
    toCsv(
      (treatmentRecords ?? []).map((r) => {
        const c = first(r.cases) as { research_id?: string } | undefined;
        const tt = first(r.treatment_types) as { name?: string } | undefined;
        return {
          research_id: c?.research_id,
          treatment_date: r.treatment_date,
          treatment_type: tt?.name,
          field_values: JSON.stringify(r.field_values ?? {}),
          free_text: r.free_text,
          recorded_by: r.recorded_by,
        };
      })
    )
  );

  zip.file(
    "schedule_items.csv",
    toCsv(
      (scheduleItems ?? []).map((s) => {
        const c = first(s.cases) as { research_id?: string } | undefined;
        return {
          research_id: c?.research_id,
          label: s.label,
          due_date: s.due_date,
          status: s.status,
          completed_at: s.completed_at,
          actions: (s.actions ?? []).join("; "),
        };
      })
    )
  );

  const answersByResponse = new Map<string, string[]>();
  for (const a of answers ?? []) {
    const q = first(a.questionnaire_questions) as { question_text?: string } | undefined;
    const arr = answersByResponse.get(a.response_id) ?? [];
    arr.push(`${q?.question_text}=${JSON.stringify(a.answer_value)}`);
    answersByResponse.set(a.response_id, arr);
  }

  zip.file(
    "questionnaire_responses.csv",
    toCsv(
      (responses ?? []).map((r) => {
        const c = first(r.cases) as { research_id?: string } | undefined;
        const q = first(r.questionnaire_templates) as { name?: string } | undefined;
        return {
          research_id: c?.research_id,
          questionnaire: q?.name,
          submitted_at: r.submitted_at,
          submitted_via: r.submitted_via,
          answers: (answersByResponse.get(r.id) ?? []).join(" | "),
        };
      })
    )
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="keloid-structured-data-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
