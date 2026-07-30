// Gemini API 免費層呼叫（決策 2026-07-26：僅能依後台衛教資料庫內容回答，不帶入病人個資）。
import {
  AI_SAFETY_RULES,
  DEFAULT_LINE_TEMPLATES,
  type LineTemplates,
} from "./lineTemplates";

const GEMINI_MODEL = "gemini-flash-latest";

export type KbEntry = {
  id?: string;
  topic: string;
  content: string;
  category?: string | null;
  pdf_url?: string | null;
  video_url?: string | null;
};

/** 把醫院衛教單張／影片連結接在回覆後面（參考 CGH_spine 專案的呈現方式）。 */
function withAttachments(answer: string, entry: KbEntry | null): string {
  if (!entry) return answer;
  let out = answer;
  if (entry.video_url?.trim()) out += `\n\n🎬 衛教影片：\n${entry.video_url.trim()}`;
  if (entry.pdf_url?.trim()) out += `\n\n📄 醫院衛教單張：\n${entry.pdf_url.trim()}`;
  return out;
}

/**
 * 呼叫失敗要跟「模型說沒有」分得開，所以不再用 null 表示兩種意思。
 *
 * 429（免費層額度用完／限流）跟網路錯誤都算 error：前者 res.ok 為 false，
 * 後者 fetch 會直接 reject——**沒包 try/catch 的話會一路往上拋成 500，病人會完全收不到回覆**，
 * 比回一句「暫時無法回答」糟得多。
 */
type GeminiResult = { ok: true; text: string } | { ok: false; reason: string };

async function callGemini(
  systemInstruction: string,
  userText: string,
  apiKey: string
): Promise<GeminiResult> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
        }),
      }
    );
  } catch (err) {
    return { ok: false, reason: `連線失敗：${String(err).slice(0, 200)}` };
  }

  if (!res.ok) {
    // 429 是免費層最常見的狀況（每分鐘/每日額度），錯誤訊息留短一點就好
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: `HTTP ${res.status}${detail ? `：${detail.slice(0, 200)}` : ""}` };
  }

  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
  // 回 200 但沒有內容（被安全過濾擋掉等）也算失敗，不要當成「沒有相關主題」
  return text ? { ok: true, text } : { ok: false, reason: "回應沒有內容（可能被安全過濾擋下）" };
}

/**
 * 病人的問題對應到哪一則衛教。
 *
 * 為什麼要先比對、而不是把整個資料庫丟給模型讓它自由回答（原本的作法）：
 *  ① 只有知道「用了哪一則」，才能附上那一則對應的醫院衛教單張連結
 *  ② 回覆內容就是後台審核過的文字，模型不會在改寫時把劑量、天數這類細節說錯
 * 這也是 CGH_spine 專案的作法。
 *
 * "none" 代表資料庫沒有相關內容——照決策 2026-07-26 請病人洽詢診間，不要讓模型自由發揮。
 * "error" 代表呼叫本身失敗（額度、限流、斷線），要回不同的文案，否則跟「沒這題」混在一起沒人查得出來。
 */
type MatchResult =
  | { status: "matched"; entry: KbEntry }
  | { status: "none" }
  | { status: "error"; reason: string };

async function matchKbEntry(question: string, entries: KbEntry[], apiKey: string): Promise<MatchResult> {
  if (entries.length === 0) return { status: "none" };

  const catalog = entries.map((e, i) => `${i + 1}. ${e.category ? `[${e.category}] ` : ""}${e.topic}`).join("\n");
  const systemInstruction = `你是衛教問題比對助理。以下是衛教主題清單：

${catalog}

請判斷病人的問題與哪一個主題最相關（主題要高度吻合，不能勉強配對）。
若相關，只回傳該主題的編號數字（例如 3），不要有其他文字。
若沒有任何主題相關，只回傳 none。`;

  const raw = await callGemini(systemInstruction, `病人的問題：${question}`, apiKey);
  if (!raw.ok) return { status: "error", reason: raw.reason };

  const cleaned = raw.text.trim().replace(/[^0-9a-z]/gi, "");
  if (!cleaned || cleaned.toLowerCase() === "none") return { status: "none" };
  const index = Number(cleaned);
  // 回了看不懂的東西：當成沒對到（而不是錯誤），因為模型確實可能亂答，這不是服務故障
  if (!Number.isInteger(index) || index < 1 || index > entries.length) return { status: "none" };
  return { status: "matched", entry: entries[index - 1] };
}

export async function askGeminiWithKb(
  question: string,
  kbEntries: KbEntry[],
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false as const, answer: t.text("ai.no_api_key"), entry: null, failure: null };
  }

  const matched = await matchKbEntry(question, kbEntries, apiKey);

  // 比對階段失敗＝服務暫時不通。回專用文案，並把失敗原因交給呼叫端寫進錯誤紀錄，
  // 否則額度爆掉時每個提問都會被推去診間，後台完全看不出來。
  if (matched.status === "error") {
    return {
      ok: false as const,
      answer: t.text("ai.error"),
      entry: null,
      failure: { stage: "gemini_match" as const, reason: matched.reason },
    };
  }

  if (matched.status === "none") {
    return { ok: true as const, answer: t.text("ai.no_match"), entry: null, failure: null };
  }

  const entry = matched.entry;

  // 比對到之後才改寫語氣，而且只餵那一則——模型看不到其他主題，就不會把別則的內容混進來。
  // 語氣（ai.tone）後台可改，AI_SAFETY_RULES 一律接在後面且不開放修改——
  // 「只依資料庫回答、不得更動數字、不得索取個資」是決策 2026-07-26 的 IRB 前提，
  // 不能因為有人在後台改了語氣就一起被改掉。
  const systemInstruction = `${t.text("ai.tone")}

${AI_SAFETY_RULES}

衛教主題：${entry.topic}
衛教內容：
${entry.content}`;

  const rewritten = await callGemini(systemInstruction, `病人的問題：${question}`, apiKey);
  // 改寫失敗**不算服務不通**：內容已經比對到了，直接給後台審過的原文，病人拿到的資訊一樣正確。
  // 但仍然記一筆，因為連續發生代表額度快見底了。
  const answer = rewritten.ok ? rewritten.text.trim() : `【${entry.topic}】\n${entry.content}`;

  return {
    ok: true as const,
    answer: withAttachments(answer, entry),
    entry,
    failure: rewritten.ok ? null : { stage: "gemini_rewrite" as const, reason: rewritten.reason },
  };
}
