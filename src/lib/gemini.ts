// Gemini API 免費層呼叫（決策 2026-07-26：僅能依後台衛教資料庫內容回答，不帶入病人個資）。
const GEMINI_MODEL = "gemini-flash-latest";

export async function askGeminiWithKb(question: string, kbEntries: { topic: string; content: string }[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false as const, answer: "尚未設定 Gemini API 金鑰（環境變數 GEMINI_API_KEY），請聯繫系統管理者設定。" };
  }

  const kbText = kbEntries.map((e, i) => `[${i + 1}] ${e.topic}：${e.content}`).join("\n");
  const systemInstruction = `你是蟹足腫衛教機器人。你「只能」根據下方「衛教資料庫」的內容回答病人的問題，用親切、簡短的口吻重新描述，不要引用資料庫以外的醫學知識或自行推論。
如果病人的問題在資料庫中找不到相關內容，請回覆：「這個問題建議您洽詢診間人員，我們會盡快協助您。」
絕對不要編造資料庫沒有的內容，也不要要求或記錄病人的個人資料（姓名、病歷號、聯絡方式等）。

衛教資料庫：
${kbText}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false as const, answer: `衛教機器人暫時無法回應（${res.status}）：${errText.slice(0, 200)}` };
  }

  const data = await res.json();
  const answer: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return { ok: true as const, answer: answer ?? "抱歉，暫時無法產生回覆，請洽詢診間人員。" };
}
