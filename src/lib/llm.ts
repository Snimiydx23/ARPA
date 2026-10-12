// ARPA — LLM provider helpers (replaces z-ai-web-dev-sdk, which only works inside the Z.ai sandbox).
// Uses NVIDIA NIM's OpenAI-compatible API: https://integrate.api.nvidia.com/v1
// Env:
//   NVIDIA_API_KEY   (required)  — from build.nvidia.com → "Get API Key"
//   NVIDIA_BASE_URL  (optional)  — default https://integrate.api.nvidia.com/v1
//   VISION_MODEL     (optional)  — multimodal model for image turns, default moonshotai/kimi-k3
//   VISION_REASONING_EFFORT (optional) — e.g. "low" to make image answers faster (sent as reasoning_effort)
//   TITLE_MODEL      (optional)  — model for auto chat titles (default = first model in MODELS)

export const NV_BASE = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
export const VISION_MODEL = process.env.VISION_MODEL || "moonshotai/kimi-k3";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: any };

function key() {
  const k = process.env.NVIDIA_API_KEY;
  if (!k) throw new Error("NVIDIA_API_KEY is not set on the server (Vercel → Settings → Environment Variables).");
  return k;
}

/** Raw POST to /chat/completions. Returns the fetch Response (caller handles stream / json). */
export async function nvChat(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const r = await fetch(`${NV_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Accept: body.stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    let msg = `AI API error ${r.status}`;
    try {
      const t = await r.text();
      const j = JSON.parse(t);
      msg = j?.error?.message || j?.detail || j?.title || msg;
    } catch {}
    if (r.status === 401 || r.status === 403) msg = "AI API key invalid or not authorised. Check NVIDIA_API_KEY.";
    if (r.status === 429) msg = "AI service is busy (rate limit). Please try again in a moment.";
    throw new Error(msg);
  }
  return r;
}

/** Non-streaming completion → assistant text. */
export async function nvComplete(body: Record<string, unknown>): Promise<string> {
  const r = await nvChat({ ...body, stream: false });
  const j: any = await r.json();
  return String(j?.choices?.[0]?.message?.content || "").trim();
}

/** Nemotron 3 reasoning toggle (ignored by models that don't support it). */
export const noThinking = { chat_template_kwargs: { enable_thinking: false } };
