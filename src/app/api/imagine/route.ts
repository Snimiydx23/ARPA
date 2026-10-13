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
import { nvChat, noThinking } from "@/lib/llm";

export const maxDuration = 300;

const ENHANCE_TIMEOUT_MS = Number(process.env.IMAGE_ENHANCE_TIMEOUT_MS || 12000); // prompt rewrite budget
const GEN_DEADLINE_MS = 240_000; // total time we wait for FLUX (incl. NVCF polling)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FAST = process.env.IMAGE_MODEL_FAST || "black-forest-labs/flux.1-schnell";
const HD = process.env.IMAGE_MODEL_HD || "black-forest-labs/flux.1-dev";
const BACKUP = process.env.IMAGE_MODEL_BACKUP || "stabilityai/stable-diffusion-3-medium";
const MAX_PROMPT_CHARS = 600; // image APIs reject / truncate very long prompts
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
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENHANCE_TIMEOUT_MS);
  try {
    const resp = await nvChat({
      stream: false,
      model: process.env.TITLE_MODEL || models()[0].id,
      temperature: 0.4,
      max_tokens: 300,
      ...noThinking,
      messages: [
        {
          role: "system",
          content:
            "You convert a user's image request (may be Hindi, Hinglish or English) into ONE detailed English prompt for a text-to-image model (FLUX). " +
            "Keep every subject, text, colour, style and detail the user asked for; add a few useful details about composition, lighting and style. Keep it UNDER 70 words. " +
            "If the user wants text/words in the image (logo name, poster title), keep that exact text in double quotes. " +
            "Choose aspect: square (logos, icons, avatars, general), portrait (posters, phone wallpapers, stories), landscape (banners, thumbnails, scenery, desktop wallpapers). " +
            'Reply ONLY with JSON: {"prompt":"...","aspect":"square|portrait|landscape"}',
        },
        { role: "user", content: text },
      ],
    }, ac.signal);
    const raw = String(((await resp.json()) as any)?.choices?.[0]?.message?.content || "");
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const prompt = String(j.prompt || "").trim();
    const aspect = SIZES[j.aspect] ? j.aspect : guessAspect;
    if (prompt.length > 3) return { prompt: prompt.slice(0, MAX_PROMPT_CHARS), aspect: guessAspect !== "square" ? guessAspect : aspect };
  } catch {
    // slow / failed rewrite → just use the user's own words
  } finally {
    clearTimeout(timer);
  }
  return { prompt: text.slice(0, MAX_PROMPT_CHARS), aspect: guessAspect };
}

async function generate(model: string, prompt: string, w: number, h: number, seed: number) {
  const key = process.env.IMAGE_API_KEY || process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set on the server.");
  const isSchnell = /schnell/i.test(model);
  const isSD = /stable-diffusion|sdxl|sd3/i.test(model);
  const body: Record<string, unknown> = isSD
    ? { prompt, cfg_scale: 5, aspect_ratio: w === h ? "1:1" : w > h ? "16:9" : "9:16", seed, steps: 40, negative_prompt: "blurry, low quality, distorted, watermark" }
    : isSchnell
      ? { prompt, width: w, height: h, seed, steps: 4 }
      : { prompt, mode: "base", cfg_scale: 3.5, width: w, height: h, seed, steps: 30 };
  const started = Date.now();
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", "NVCF-POLL-SECONDS": "30" };
  let r = await fetch(`https://ai.api.nvidia.com/v1/genai/${model}`, { method: "POST", headers, body: JSON.stringify(body) });
  // NVIDIA cloud functions answer 202 + NVCF-REQID when the job is queued → poll until it is done
  while (r.status === 202) {
    const reqId = r.headers.get("nvcf-reqid");
    if (!reqId) break;
    if (Date.now() - started > GEN_DEADLINE_MS) throw new Error("The image service is very busy right now. Please try again in a minute.");
    await sleep(1500);
    r = await fetch(`https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${reqId}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "NVCF-POLL-SECONDS": "30" },
    });
  }
  const txt = await r.text();
  let j: any = {};
  try { j = JSON.parse(txt); } catch {}
  if (!r.ok) {
    console.error(`[imagine] ${model} → HTTP ${r.status}: ${txt.slice(0, 500)}`);
    if (r.status === 401 || r.status === 403) throw new Error(`Image model ${model} is not enabled for your NVIDIA key (HTTP ${r.status}).`);
    if (r.status === 429) throw new Error("Image service is busy (rate limit). Please try again in a minute.");
    const detail = typeof j?.detail === "string" ? j.detail : j?.detail ? JSON.stringify(j.detail).slice(0, 200) : "";
    throw new Error(`${model.split("/").pop()}: ${detail || j?.title || j?.error?.message || `HTTP ${r.status}`}`);
  }
  // NIM visual-genai returns { artifacts: [{ base64, finishReason, seed }] } (older: { image })
  const art = Array.isArray(j?.artifacts) ? j.artifacts[0] : null;
  const reason = String(art?.finishReason || j?.finish_reason || "");
  if (/filter/i.test(reason)) {
    const e: any = new Error("This prompt was blocked by the image safety filter. Please try a different description.");
    e.filtered = true;
    throw e;
  }
  const b64: string = art?.base64 || j?.image || j?.data?.[0]?.b64_json || "";
  if (!b64) {
    console.error(`[imagine] ${model} → no image in response: ${txt.slice(0, 300)}`);
    throw new Error(`${model.split("/").pop()}: no image returned`);
  }
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
    const chain = [...new Set(body?.quality === "hd" ? [HD, FAST, BACKUP] : [FAST, HD, BACKUP])];
    const seed = Number.isInteger(body?.seed) ? body.seed : Math.floor(Math.random() * 2_147_483_647);
    // try each image model in turn (a model may be disabled for the key, busy, or renamed)
    let g: Awaited<ReturnType<typeof generate>> | null = null;
    let model = chain[0];
    const errors: string[] = [];
    for (const m of chain) {
      try { g = await generate(m, prompt, w, h, seed); model = m; break; }
      catch (e: any) {
        errors.push(e?.message || String(e));
        if (e?.filtered) throw e; // safety block → don't retry with another model
      }
    }
    if (!g) throw new Error(errors.length > 1 ? `All image models failed — ${errors.join(" | ")}` : errors[0] || "Image generation failed");
    const row = await db.generatedImage.create({
      data: { userId: dbUser.id, prompt, userText: text, data: g.b64, mime: g.mime, width: w, height: h, seed: g.seed, model },
      select: { id: true },
    });
    return json({ ok: true, id: row.id, url: `/api/imagine/${row.id}`, prompt, width: w, height: h, seed: g.seed, model, used: q.used, limit: st.limit });
  } catch (e: any) {
    console.error("[imagine] failed:", e?.message || e);
    return json({ ok: false, error: e?.message || "Image generation failed" }, 502);
  }
}
