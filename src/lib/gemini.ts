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

async function callGemini(systemInstruction: string, userText: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
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
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined) ?? null;
}

/**
 * 病人的問題對應到哪一則衛教。
 *
 * 為什麼要先比對、而不是把整個資料庫丟給模型讓它自由回答（原本的作法）：
 *  ① 只有知道「用了哪一則」，才能附上那一則對應的醫院衛教單張連結
 *  ② 回覆內容就是後台審核過的文字，模型不會在改寫時把劑量、天數這類細節說錯
 * 這也是 CGH_spine 專案的作法。
 *
 * 回傳 null 代表資料庫沒有相關內容——那就照決策 2026-07-26 請病人洽詢診間，不要讓模型自由發揮。
 */
async function matchKbEntry(question: string, entries: KbEntry[], apiKey: string): Promise<KbEntry | null> {
  if (entries.length === 0) return null;

  const catalog = entries.map((e, i) => `${i + 1}. ${e.category ? `[${e.category}] ` : ""}${e.topic}`).join("\n");
  const systemInstruction = `你是衛教問題比對助理。以下是衛教主題清單：

${catalog}

請判斷病人的問題與哪一個主題最相關（主題要高度吻合，不能勉強配對）。
若相關，只回傳該主題的編號數字（例如 3），不要有其他文字。
若沒有任何主題相關，只回傳 none。`;

  const raw = await callGemini(systemInstruction, `病人的問題：${question}`, apiKey);
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[^0-9a-z]/gi, "");
  if (!cleaned || cleaned.toLowerCase() === "none") return null;
  const index = Number(cleaned);
  if (!Number.isInteger(index) || index < 1 || index > entries.length) return null;
  return entries[index - 1];
}

export async function askGeminiWithKb(
  question: string,
  kbEntries: KbEntry[],
  t: LineTemplates = DEFAULT_LINE_TEMPLATES
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false as const, answer: t.text("ai.no_api_key"), entry: null };
  }

  const matched = await matchKbEntry(question, kbEntries, apiKey);
  if (!matched) {
    return {
      ok: true as const,
      answer: t.text("ai.no_match"),
      entry: null,
    };
  }

  // 比對到之後才改寫語氣，而且只餵那一則——模型看不到其他主題，就不會把別則的內容混進來。
  // 語氣（ai.tone）後台可改，AI_SAFETY_RULES 一律接在後面且不開放修改——
  // 「只依資料庫回答、不得更動數字、不得索取個資」是決策 2026-07-26 的 IRB 前提，
  // 不能因為有人在後台改了語氣就一起被改掉。
  const systemInstruction = `${t.text("ai.tone")}

${AI_SAFETY_RULES}

衛教主題：${matched.topic}
衛教內容：
${matched.content}`;

  const rewritten = await callGemini(systemInstruction, `病人的問題：${question}`, apiKey);
  // 改寫失敗就直接給原文，總比沒有回應好
  const answer = rewritten?.trim() || `【${matched.topic}】\n${matched.content}`;

  return { ok: true as const, answer: withAttachments(answer, matched), entry: matched };
}
