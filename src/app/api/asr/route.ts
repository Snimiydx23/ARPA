// POST /api/asr — speech-to-text (V3.1 voice input).
// Body: { audio: "<base64 webm/mp3/wav>" } → { ok, text }
// Provider: Groq Whisper (free tier, OpenAI-compatible) — set GROQ_API_KEY in env.
// Optional: ASR_BASE_URL (default https://api.groq.com/openai/v1), ASR_MODEL (default whisper-large-v3-turbo).
import { bearerUid, json } from "@/lib/arpa";

export const maxDuration = 60;

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const audio = String(body?.audio || "").trim();
  if (!audio) return json({ error: "Audio missing" }, 400);

  const key = process.env.GROQ_API_KEY || process.env.ASR_API_KEY;
  if (!key) return json({ ok: false, error: "Voice input is not configured yet (GROQ_API_KEY missing)." }, 501);
  const base = (process.env.ASR_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

  try {
    const bytes = Buffer.from(audio, "base64");
    // detect container from magic bytes (browser MediaRecorder usually gives webm)
    const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45;
    const isWav = bytes.slice(0, 4).toString() === "RIFF";
    const ext = isWebm ? "webm" : isWav ? "wav" : "mp3";
    const mime = isWebm ? "audio/webm" : isWav ? "audio/wav" : "audio/mpeg";

    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: mime }), `voice.${ext}`);
    fd.append("model", process.env.ASR_MODEL || "whisper-large-v3-turbo");
    fd.append("response_format", "json");

    const r = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `ASR error ${r.status}`);
    const text = String(j?.text || "").trim();
    if (!text) return json({ ok: false, error: "Could not hear anything. Please try again." }, 422);
    return json({ ok: true, text });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "ASR error" }, 502);
  }
}
