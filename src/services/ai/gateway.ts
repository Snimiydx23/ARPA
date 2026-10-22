// ARPA AI Gateway — single entry point for text generation.
// route → try candidate (retry once if retryable) → fall back to next candidate → safe error.
// Streams are only "committed" once the provider accepted the request, so a fallback never
// produces a half-answer from two models.
import type { ChatRequest, ModelInfo, StreamEvent } from "./types";
import { ProviderError } from "./types";
import { providerFor } from "./providers";
import { route, type RouteInput, type RouteDecision } from "./router";

const MAX_ATTEMPTS = Number(process.env.AI_MAX_ATTEMPTS || 3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Attempt = { model: string; ok: boolean; error?: string; ms: number };

export class GatewayError extends Error {
  constructor(message: string, public attempts: Attempt[]) { super(message); this.name = "GatewayError"; }
}

export async function streamChat(
  input: RouteInput,
  req: ChatRequest,
): Promise<{ model: ModelInfo; decision: RouteDecision; stream: AsyncIterable<StreamEvent>; attempts: Attempt[] }> {
  const decision = route(input);
  if (!decision.candidates.length) {
    throw new GatewayError(
      input.hasImage ? "No vision-capable AI model is configured." : "No AI model is configured. Set NVIDIA_API_KEY (or another provider key).",
      [],
    );
  }
  const attempts: Attempt[] = [];
  const tried = new Set<string>();
  for (const model of decision.candidates) {
    if (attempts.length >= MAX_ATTEMPTS) break;
    const provider = providerFor(model);
    if (!provider || tried.has(model.id)) continue;
    tried.add(model.id);
    for (let retry = 0; retry < 2 && attempts.length < MAX_ATTEMPTS; retry++) {
      const t0 = Date.now();
      try {
        const stream = await provider.stream(model, req);
        attempts.push({ model: model.id, ok: true, ms: Date.now() - t0 });
        return { model, decision, stream, attempts };
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        const pe = e instanceof ProviderError ? e : null;
        attempts.push({ model: model.id, ok: false, error: e?.message || String(e), ms: Date.now() - t0 });
        // retry the same model once only for transient errors (not 404 / auth)
        if (pe && pe.retryable && pe.status !== 404 && retry === 0) { await sleep(700); continue; }
        break; // next candidate
      }
    }
  }
  const last = attempts[attempts.length - 1]?.error || "AI service unavailable";
  throw new GatewayError(`The AI service is temporarily unavailable. ${last}`, attempts);
}

/** Non-streaming helper with the same routing + fallback (titles, prompt rewrites, summaries). */
export async function complete(input: RouteInput, req: ChatRequest): Promise<{ text: string; model: ModelInfo }> {
  const decision = route(input);
  let lastErr = "No AI model is configured.";
  for (const model of decision.candidates.slice(0, MAX_ATTEMPTS)) {
    const provider = providerFor(model);
    if (!provider) continue;
    try {
      const r = await provider.chat(model, req);
      return { text: r.text, model };
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      lastErr = e?.message || String(e);
    }
  }
  throw new GatewayError(lastErr, []);
}
