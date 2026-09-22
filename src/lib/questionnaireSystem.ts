// 程式裡「用問卷名稱」寫死抓取的問卷（病人自填、診間收案、回診動線、計分）。
// 這幾份在問卷產生器裡不能改名——改了流程就找不到它；也不能刪題、改選項值——
// SF-36／PSQI 計分依 order_no 與選項 value 取值（見 lib/scoring.ts）。
import { SEGMENT_QUESTIONNAIRE_NAME } from "./patientIntake";
import { CLINICIAN_SCALE_NAMES } from "./clinicFlow";
import { FOLLOWUP_SCALE_NAMES } from "./visitFlow";

export const SYSTEM_QUESTIONNAIRE_NAMES: ReadonlySet<string> = new Set([
  ...(Object.values(SEGMENT_QUESTIONNAIRE_NAME) as string[]),
  ...CLINICIAN_SCALE_NAMES,
  ...FOLLOWUP_SCALE_NAMES,
]);

export const isSystemQuestionnaire = (name: string) => SYSTEM_QUESTIONNAIRE_NAMES.has(name);
