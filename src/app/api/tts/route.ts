// POST /api/tts — text-to-speech (V3.1 read-aloud).
// Body: { text, voice?, speed? } → audio/wav blob (binary)
// Text capped at 1000 chars per the TTS API limit; client splits longer text.
import ZAI from "z-ai-web-dev-sdk";
import { bearerUid, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const text = String(body?.text || "").slice(0, 1000);
  if (!text.trim()) return json({ error: "Text is empty" }, 400);
  const voice = String(body?.voice || "tongtong");
  const speed = Math.min(2, Math.max(0.5, Number(body?.speed) || 1));
  try {
    const zai = await ZAI.create();
    const res = await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });
    const ab = await res.arrayBuffer();
    return new Response(ab, {
      headers: {
        "content-type": "audio/wav",
        "cache-control": "no-store",
        "content-length": String(ab.byteLength),
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "TTS error" }, 502);
  }
}
