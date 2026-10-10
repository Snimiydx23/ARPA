// POST /api/chat-title — auto-generate a chat title from the first message (V3.6).
// Body: { text } → { ok, title } — uses z-ai for a short 3-5 word title.
import ZAI from "z-ai-web-dev-sdk";
import { bearerUid, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const text = String(body?.text || "").trim().slice(0, 500);
  if (!text) return json({ error: "Text is empty" }, 400);
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "You generate a very short chat title (3-6 words max, no quotes, no punctuation at end) from the user's first message. Reply with ONLY the title text, nothing else. Use English." },
        { role: "user", content: text },
      ],
      thinking: { type: "disabled" },
    });
    const title = (completion?.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "").slice(0, 80);
    if (!title) return json({ ok: false, error: "Title could not be generated" }, 422);
    return json({ ok: true, title });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Title error" }, 502);
  }
}
