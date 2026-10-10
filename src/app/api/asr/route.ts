// POST /api/asr — speech-to-text (V3.1 voice input).
// Body: { audio: "<base64 wav/mp3>" } → { ok, text }
import ZAI from "z-ai-web-dev-sdk";
import { bearerUid, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const audio = String(body?.audio || "").trim();
  if (!audio) return json({ error: "Audio missing" }, 400);
  try {
    const zai = await ZAI.create();
    const res = await zai.audio.asr.create({ file_base64: audio });
    const text = (res?.text || "").trim();
    if (!text) return json({ ok: false, error: "Could not hear anything. Please try again." }, 422);
    return json({ ok: true, text });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "ASR error" }, 502);
  }
}
