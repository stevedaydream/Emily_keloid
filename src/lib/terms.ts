// 術語庫的用語一律寫成「【子分類】原文 中文」（例：`【切除】Excision 蟹足腫切除術`）。
// 【】裡的子分類是主任舊表本來就有的分群，同一階段底下常有 40 幾則，
// 平鋪很難找，所以介面上把它拆出來當篩選器（決策 2026-07-29）。
const TERM_GROUP_RE = /^【([^】]+)】\s*/;

export type ParsedTerm = { group: string | null; label: string };

export function parseTerm(term: string): ParsedTerm {
  const m = term.match(TERM_GROUP_RE);
  return m ? { group: m[1], label: term.slice(m[0].length) } : { group: null, label: term };
}

/** 沒有【】前綴的用語（例如「其他」自填進來的）統一歸到這一組。 */
export const UNGROUPED_LABEL = "未分類";

export function termGroupLabel(term: string): string {
  return parseTerm(term).group ?? UNGROUPED_LABEL;
}

/** 依術語清單取出出現過的子分類，維持清單原本的順序（sort_order）。 */
export function termGroupsOf(terms: { term: string }[]): string[] {
  const seen: string[] = [];
  for (const t of terms) {
    const g = termGroupLabel(t.term);
    if (!seen.includes(g)) seen.push(g);
  }
  return seen;
}

/** 把「其他」自填的用語補上子分類前綴，讓它跟同組的既有用語排在一起。 */
export function withTermGroup(term: string, group: string | null): string {
  const t = term.trim();
  if (!t || !group || group === UNGROUPED_LABEL) return t;
  if (TERM_GROUP_RE.test(t)) return t; // 使用者自己打了【】就照他的
  return `【${group}】${t}`;
}
