// POST /api/imagine — AI image generation (NVIDIA FLUX.1 via ai.api.nvidia.com).
// Body: { prompt, quality?: "fast" | "hd", aspect?: "square" | "portrait" | "landscape", seed? }
// → { ok, id, url, prompt, width, height, seed }
// Flow: user text (any language) → Nemotron rewrites it into a detailed English image prompt
//       → FLUX generates → image saved in GeneratedImage table → served at /api/imagine/[id]
// Env (optional):
//   IMAGE_MODEL_FAST  default black-forest-labs/flux.1-schnell
//   IMAGE_MODEL_HD    default black-forest-labs/flux.1-dev
//   IMAGE_API_KEY     separate nvapi key for image models (falls back to NVIDIA_API_KEY)
import { db } from "@/lib/db";
import { bearerUid, json, status, takeQuota, models } from "@/lib/arpa";
import { nvComplete, noThinking } from "@/lib/llm";

export const maxDuration = 120;

const FAST = process.env.IMAGE_MODEL_FAST || "black-forest-labs/flux.1-schnell";
const HD = process.env.IMAGE_MODEL_HD || "black-forest-labs/flux.1-dev";
const SIZES: Record<string, [number, number]> = {
  square: [1024, 1024],
  portrait: [768, 1344],
  landscape: [1344, 768],
};

/** Turn the user's request (Hinglish/Hindi/English) into a detailed English prompt + aspect. */
async function enhance(text: string): Promise<{ prompt: string; aspect: string }> {
  const guessAspect = /\b(portrait|vertical|story|reel|poster|mobile wallpaper|phone wallpaper|9:16)\b/i.test(text)
    ? "portrait"
    : /\b(landscape|wide|banner|thumbnail|youtube|cover|header|16:9|desktop wallpaper)\b/i.test(text)
      ? "landscape"
      : "square";
  try {
    const raw = await nvComplete({
      model: process.env.TITLE_MODEL || models()[0].id,
      temperature: 0.4,
      max_tokens: 300,
      ...noThinking,
      messages: [
        {
          role: "system",
          content:
            "You convert a user's image request (may be Hindi, Hinglish or English) into ONE detailed English prompt for a text-to-image model (FLUX). " +
            "Keep every subject, text, colour, style and detail the user asked for; add useful details about composition, lighting, style and quality. " +
            "If the user wants text/words in the image (logo name, poster title), keep that exact text in double quotes. " +
            "Choose aspect: square (logos, icons, avatars, general), portrait (posters, phone wallpapers, stories), landscape (banners, thumbnails, scenery, desktop wallpapers). " +
            'Reply ONLY with JSON: {"prompt":"...","aspect":"square|portrait|landscape"}',
        },
        { role: "user", content: text },
      ],
    });
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const prompt = String(j.prompt || "").trim();
    const aspect = SIZES[j.aspect] ? j.aspect : guessAspect;
    if (prompt.length > 3) return { prompt: prompt.slice(0, 1500), aspect: guessAspect !== "square" ? guessAspect : aspect };
  } catch {}
  return { prompt: text.slice(0, 1500), aspect: guessAspect };
}

async function generate(model: string, prompt: string, w: number, h: number, seed: number) {
  const key = process.env.IMAGE_API_KEY || process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set on the server.");
  const isSchnell = /schnell/i.test(model);
  const body: Record<string, unknown> = isSchnell
    ? { prompt, width: w, height: h, seed, steps: 4 }
    : { prompt, mode: "base", cfg_scale: 3.5, width: w, height: h, seed, steps: 30 };
  const r = await fetch(`https://ai.api.nvidia.com/v1/genai/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j: any = {};
  try { j = JSON.parse(txt); } catch {}
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error("Image API key invalid or this model is not enabled for your NVIDIA key.");
    if (r.status === 429) throw new Error("Image service is busy (rate limit). Please try again in a minute.");
    throw new Error(j?.detail || j?.title || j?.error?.message || `Image API error ${r.status}`);
  }
  // NIM visual-genai returns { artifacts: [{ base64, finishReason, seed }] } (older: { image })
  const art = Array.isArray(j?.artifacts) ? j.artifacts[0] : null;
  if (art?.finishReason && /filter/i.test(String(art.finishReason))) {
    throw new Error("This prompt was blocked by the image safety filter. Please try a different description.");
  }
  const b64: string = art?.base64 || j?.image || j?.data?.[0]?.b64_json || "";
  if (!b64) throw new Error("No image was returned. Please try again.");
  const mime = b64.startsWith("iVBOR") ? "image/png" : b64.startsWith("UklGR") ? "image/webp" : "image/jpeg";
  return { b64, mime, seed: Number(art?.seed ?? seed) || seed };
}

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Session expired, please log in again." }, 401);
  const dbUser = await db.user.findUnique({ where: { uid } });
  if (!dbUser) return json({ error: "User record not found. Please log in again." }, 401);

  const st = status(dbUser);
  if (st.state === "expired") return json({ error: "Your free trial has ended. Please pick a plan to keep using ARPA.", code: "EXPIRED" }, 402);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const text = String(body?.prompt || "").trim().slice(0, 2000);
  if (!text) return json({ error: "Please describe the image you want." }, 400);

  const q = await takeQuota(dbUser.id, st.limit);
  if (!q.ok) return json({ error: `Today's limit (${st.limit}) has been reached. Please try again tomorrow.`, code: "LIMIT" }, 429);

  try {
    const { prompt, aspect: autoAspect } = await enhance(text);
    const aspect = SIZES[body?.aspect] ? body.aspect : autoAspect;
    const [w, h] = SIZES[aspect];
    const model = body?.quality === "hd" ? HD : FAST;
    const seed = Number.isInteger(body?.seed) ? body.seed : Math.floor(Math.random() * 2_147_483_647);
    const g = await generate(model, prompt, w, h, seed);
    const row = await db.generatedImage.create({
      data: { userId: dbUser.id, prompt, userText: text, data: g.b64, mime: g.mime, width: w, height: h, seed: g.seed, model },
      select: { id: true },
    });
    return json({ ok: true, id: row.id, url: `/api/imagine/${row.id}`, prompt, width: w, height: h, seed: g.seed, model, used: q.used, limit: st.limit });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Image generation failed" }, 502);
  }
}
