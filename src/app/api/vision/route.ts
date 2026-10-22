// POST /api/vision — image understanding (V3.2 VLM).
// Body: { image: "<data-url or base64 or http url>", prompt? } → { ok, text }
// Uses an NVIDIA NIM vision model (VISION_MODEL env, default moonshotai/kimi-k3).
import { bearerUid, json, isBlockedUid, blockedResponse } from "@/lib/arpa";
import { enforceRate } from "@/lib/rate-limit";
import { complete } from "@/services/ai/gateway";

export const maxDuration = 120;

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const limited = await enforceRate("tool", uid);
  if (limited) return limited;
  if (await isBlockedUid(uid)) return blockedResponse();
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const image = String(body?.image || "").trim();
  if (!image) return json({ error: "Image missing" }, 400);
  const prompt = String(body?.prompt || "Describe this image in detail. If it contains text, perform OCR. Mention objects, the scene, and important details in English.").slice(0, 2000);

  // normalize to a usable image_url (data: URL or http URL)
  let url = image;
  if (!url.startsWith("data:") && !url.startsWith("http")) {
    url = "data:image/jpeg;base64," + url;
  }

  try {
    const r = await complete(
      { requested: "quality", hasImage: true, totalChars: prompt.length, lastUserText: prompt },
      {
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "You are ARPA, a helpful vision assistant. Always reply in English. Be concise but complete.\n\n" + prompt },
            { type: "image_url", image_url: { url } },
          ],
        }],
        temperature: 0.2,
        maxTokens: 1024,
      },
    );
    const text = r.text;
    if (!text) return json({ ok: false, error: "No answer was returned for this image." }, 422);
    return json({ ok: true, text });
  } catch (e: any) {
    return json({ ok: false, error: "Image could not be analysed right now. Please try again." }, 502);
  }
}
