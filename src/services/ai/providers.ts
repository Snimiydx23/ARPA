// ARPA AI Gateway — provider adapters.
// Every supported provider exposes an OpenAI-compatible /chat/completions endpoint
// (NVIDIA NIM, OpenAI, Gemini, Groq, OpenRouter, Anthropic's compatibility layer, Ollama),
// so one adapter covers them; provider quirks live in ProviderConfig / ModelInfo.extraBody.
import type { AIProvider, ChatRequest, ModelInfo, ProviderConfig, StreamEvent, Usage } from "./types";
import { ProviderError } from "./types";
import { providerConfig } from "./registry";

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

function inputChars(req: ChatRequest) {
  return req.messages.reduce((n, msg) => {
    if (typeof msg.content === "string") return n + msg.content.length;
    return n + msg.content.reduce((k, p) => k + (p.type === "text" ? p.text.length : 1000), 0);
  }, 0);
}

async function failure(r: Response, provider: string): Promise<ProviderError> {
  let msg = `${provider} error ${r.status}`;
  try {
    const t = await r.text();
    const j = JSON.parse(t);
    msg = j?.error?.message || j?.detail || j?.title || msg;
    if (typeof msg !== "string") msg = JSON.stringify(msg).slice(0, 200);
  } catch {}
  if (r.status === 401 || r.status === 403) msg = `${provider}: API key invalid or model not enabled.`;
  if (r.status === 429) msg = `${provider}: rate limit reached.`;
  const retryable = r.status === 408 || r.status === 409 || r.status === 429 || r.status >= 500 || r.status === 404;
  return new ProviderError(msg, r.status, provider, retryable);
}

export class OpenAICompatibleProvider implements AIProvider {
  constructor(readonly config: ProviderConfig) {}

  private body(model: ModelInfo, req: ChatRequest, stream: boolean) {
    return {
      model: model.providerModel,
      messages: req.messages,
      stream,
      temperature: req.temperature ?? 0.3,
      top_p: 0.95,
      max_tokens: req.maxTokens ?? 4096,
      ...(stream && this.config.streamUsage ? { stream_options: { include_usage: true } } : {}),
      ...(model.extraBody || {}),
    };
  }

  private async post(model: ModelInfo, req: ChatRequest, stream: boolean): Promise<Response> {
    let r: Response;
    try {
      r = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          ...((model.apiKey || this.config.apiKey) ? { Authorization: `Bearer ${model.apiKey || this.config.apiKey}` } : {}),
          "Content-Type": "application/json",
          Accept: stream ? "text/event-stream" : "application/json",
          ...(this.config.id === "openrouter" ? { "HTTP-Referer": process.env.APP_URL || "https://arpa.app", "X-Title": "ARPA" } : {}),
        },
        body: JSON.stringify(this.body(model, req, stream)),
        signal: req.signal,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      throw new ProviderError(`${this.config.label}: network error`, 0, this.config.id, true);
    }
    if (!r.ok) throw await failure(r, this.config.label);
    return r;
  }

  async chat(model: ModelInfo, req: ChatRequest) {
    const r = await this.post(model, req, false);
    const j: any = await r.json();
    const text = String(j?.choices?.[0]?.message?.content || "").trim();
    const usage: Usage = j?.usage
      ? { inputTokens: j.usage.prompt_tokens || 0, outputTokens: j.usage.completion_tokens || 0, estimated: false }
      : { inputTokens: estimateTokens("x".repeat(inputChars(req))), outputTokens: estimateTokens(text), estimated: true };
    return { text, usage };
  }

  async stream(model: ModelInfo, req: ChatRequest): Promise<AsyncIterable<StreamEvent>> {
    const r = await this.post(model, req, true); // throws before streaming → caller may fall back
    const reader = r.body!.getReader();
    const inChars = inputChars(req);

    async function* iterate(): AsyncIterable<StreamEvent> {
      const dec = new TextDecoder();
      let buf = "";
      let outChars = 0;
      let usage: Usage | null = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const ln of lines) {
            const t = ln.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let j: any;
            try { j = JSON.parse(payload); } catch { continue; }
            if (j?.usage && (j.usage.prompt_tokens || j.usage.completion_tokens)) {
              usage = { inputTokens: j.usage.prompt_tokens || 0, outputTokens: j.usage.completion_tokens || 0, estimated: false };
            }
            const choice = j?.choices?.[0];
            const text = choice?.delta?.content;
            if (text) { outChars += text.length; yield { type: "text", text }; }
            if (choice?.finish_reason) yield { type: "finish", reason: choice.finish_reason };
          }
        }
      } finally {
        try { reader.releaseLock(); } catch {}
      }
      yield {
        type: "usage",
        usage: usage || { inputTokens: Math.ceil(inChars / 4), outputTokens: Math.ceil(outChars / 4), estimated: true },
      };
    }
    return iterate();
  }
}

const instances = new Map<string, AIProvider>();

/** Provider instance for a model (null if the provider is not configured). */
export function providerFor(model: ModelInfo): AIProvider | null {
  const cfg = providerConfig(model.provider);
  if (!cfg) return null;
  const key = `${cfg.id}|${cfg.baseUrl}|${cfg.apiKey?.slice(-6)}`;
  let p = instances.get(key);
  if (!p) { p = new OpenAICompatibleProvider(cfg); instances.set(key, p); }
  return p;
}
