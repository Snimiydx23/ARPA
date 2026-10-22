// POST /api/tts — text-to-speech (V3.1 read-aloud).
// No server TTS provider is configured on Vercel; the client falls back to the
// browser's built-in speech (window.speechSynthesis) when this returns 501 + fallback.
import { enforceRate } from "@/lib/rate-limit";
import { bearerUid, json, isBlockedUid, blockedResponse } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  { const limited = await enforceRate("tool", uid); if (limited) return limited; }
  if (await isBlockedUid(uid)) return blockedResponse();
  return json({ ok: false, fallback: "browser", error: "Server TTS not configured" }, 501);
}
