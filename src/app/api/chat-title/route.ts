// POST /api/chat-title — auto-generate a short chat title from the first message.
// Body: { text } → { ok, title } — uses the fastest available model via the AI Gateway.
import { bearerUid, json, isBlockedUid, blockedResponse } from "@/lib/arpa";
import { enforceRate } from "@/lib/rate-limit";
import { complete } from "@/services/ai/gateway";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const limited = await enforceRate("tool", uid);
  if (limited) return limited;
  if (await isBlockedUid(uid)) return blockedResponse();
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const text = String(body?.text || "").trim().slice(0, 500);
  if (!text) return json({ error: "Text is empty" }, 400);
  try {
    const r = await complete(
      { requested: process.env.TITLE_MODEL || "fast", hasImage: false, totalChars: text.length, lastUserText: text },
      {
        messages: [
          { role: "system", content: "You generate a very short chat title (3-6 words max, no quotes, no punctuation at end) from the user's first message. Reply with ONLY the title text, nothing else. Use English." },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        maxTokens: 24,
      },
    );
    const title = r.text.split("\n")[0].trim().replace(/^["']|["']$/g, "").slice(0, 80);
    if (!title) return json({ ok: false, error: "Title could not be generated" }, 422);
    return json({ ok: true, title });
  } catch {
    return json({ ok: false, error: "Title could not be generated" }, 502);
  }
}
