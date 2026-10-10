// POST /api/vision — image understanding (V3.2 VLM).
// Body: { image: "<data-url or base64 or http url>", prompt? } → { ok, text }
import ZAI, { type VisionMessage } from "z-ai-web-dev-sdk";
import { bearerUid, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
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
    const zai = await ZAI.create();
    const messages: VisionMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "You are ARPA, a helpful vision assistant. Always reply in English. Be concise but complete." }] },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url } },
        ],
      },
    ];
    const response = await zai.chat.completions.createVision({
      model: "glm-4.6v",
      messages,
      thinking: { type: "disabled" },
    });
    const text = (response?.choices?.[0]?.message?.content || "").trim();
    if (!text) return json({ ok: false, error: "No answer was returned for this image." }, 422);
    return json({ ok: true, text });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Vision error" }, 502);
  }
}
