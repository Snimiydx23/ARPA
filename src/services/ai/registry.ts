// ARPA AI Gateway — provider + model registry.
// Providers switch on automatically when their API key / URL is present in env.
// Models come from (in order): AI_MODELS (JSON) → legacy MODELS ("id|Label,…", NVIDIA) → built-in defaults.
// Nothing outside this file should hard-code model names.
import type { ModelInfo, Policy, ProviderConfig, ProviderId } from "./types";
import { POLICIES } from "./types";

/* ---------------- providers ---------------- */
// Every provider below speaks the OpenAI /chat/completions format, so just setting its API key in env turns it on.
// Optional per provider:  <PREFIX>_BASE_URL  (own endpoint / proxy)   <PREFIX>_MODELS = "modelId|Label,modelId2|Label2"
// Any other OpenAI-compatible API:  AI_PROVIDER_1_URL, AI_PROVIDER_1_KEY, AI_PROVIDER_1_MODELS, AI_PROVIDER_1_NAME  (… up to _10)
// Limit which providers are used:   AI_ONLY_PROVIDERS=openai,groq
type KnownDef = { id: ProviderId; label: string; prefix: string; keyEnv: string; baseUrl: string; streamUsage: boolean };
const KNOWN: KnownDef[] = [
  { id: "nvidia", label: "NVIDIA NIM", prefix: "NVIDIA", keyEnv: "NVIDIA_API_KEY", baseUrl: "https://integrate.api.nvidia.com/v1", streamUsage: false },
  { id: "openai", label: "OpenAI", prefix: "OPENAI", keyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", streamUsage: true },
  { id: "anthropic", label: "Anthropic", prefix: "ANTHROPIC", keyEnv: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1", streamUsage: false },
  { id: "google", label: "Google Gemini", prefix: "GEMINI", keyEnv: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", streamUsage: true },
  { id: "groq", label: "Groq", prefix: "GROQ", keyEnv: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", streamUsage: true },
  { id: "openrouter", label: "OpenRouter", prefix: "OPENROUTER", keyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", streamUsage: true },
  { id: "deepseek", label: "DeepSeek", prefix: "DEEPSEEK", keyEnv: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1", streamUsage: true },
  { id: "mistral", label: "Mistral", prefix: "MISTRAL", keyEnv: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", streamUsage: false },
  { id: "xai", label: "xAI Grok", prefix: "XAI", keyEnv: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1", streamUsage: true },
  { id: "together", label: "Together AI", prefix: "TOGETHER", keyEnv: "TOGETHER_API_KEY", baseUrl: "https://api.together.xyz/v1", streamUsage: true },
  { id: "fireworks", label: "Fireworks AI", prefix: "FIREWORKS", keyEnv: "FIREWORKS_API_KEY", baseUrl: "https://api.fireworks.ai/inference/v1", streamUsage: true },
  { id: "cerebras", label: "Cerebras", prefix: "CEREBRAS", keyEnv: "CEREBRAS_API_KEY", baseUrl: "https://api.cerebras.ai/v1", streamUsage: false },
  { id: "perplexity", label: "Perplexity", prefix: "PERPLEXITY", keyEnv: "PERPLEXITY_API_KEY", baseUrl: "https://api.perplexity.ai", streamUsage: false },
];
const MAX_CUSTOM = 10;

function onlyFilter(): Set<string> | null {
  const raw = (process.env.AI_ONLY_PROVIDERS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return raw.length ? new Set(raw) : null;
}

export function providerConfigs(): ProviderConfig[] {
  const e = process.env;
  const list: ProviderConfig[] = [];
  for (const k of KNOWN) {
    const key = e[k.keyEnv];
    if (!key) continue;
    list.push({ id: k.id, label: k.label, baseUrl: e[`${k.prefix}_BASE_URL`] || k.baseUrl, apiKey: key, streamUsage: k.streamUsage });
  }
  if (e.OLLAMA_BASE_URL) list.push({ id: "ollama", label: "Ollama (local)", baseUrl: e.OLLAMA_BASE_URL, apiKey: "ollama", streamUsage: false });
  if (e.CUSTOM_AI_BASE_URL) list.push({ id: "custom", label: e.CUSTOM_AI_LABEL || "Custom", baseUrl: e.CUSTOM_AI_BASE_URL, apiKey: e.CUSTOM_AI_API_KEY, streamUsage: false });
  for (let n = 1; n <= MAX_CUSTOM; n++) {
    const url = e[`AI_PROVIDER_${n}_URL`];
    if (!url) continue;
    list.push({
      id: `p${n}`, label: e[`AI_PROVIDER_${n}_NAME`] || `Provider ${n}`, baseUrl: url,
      apiKey: e[`AI_PROVIDER_${n}_KEY`] || undefined, streamUsage: e[`AI_PROVIDER_${n}_STREAM_USAGE`] === "true",
    });
  }
  const only = onlyFilter();
  return only ? list.filter((p) => only.has(String(p.id).toLowerCase())) : list;
}

export function providerConfig(id: ProviderId): ProviderConfig | undefined {
  return providerConfigs().find((p) => p.id === id);
}

/* ---------------- models ---------------- */
const NEMOTRON_EXTRA = { chat_template_kwargs: { enable_thinking: false } };

function m(p: Partial<ModelInfo> & Pick<ModelInfo, "id" | "label" | "provider" | "providerModel">): ModelInfo {
  return {
    type: "chat", contextTokens: 128_000, reasoning: false, vision: false, tools: false,
    speed: 3, quality: 3, costIn: 0, costOut: 0, ...p,
  };
}

/** Built-in defaults per provider (only used when the provider is configured). Override with AI_MODELS. */
function defaults(): ModelInfo[] {
  const visionEffort = process.env.VISION_REASONING_EFFORT ? { reasoning_effort: process.env.VISION_REASONING_EFFORT } : undefined;
  return [
    m({ id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron Ultra", provider: "nvidia", providerModel: "nvidia/nemotron-3-ultra-550b-a55b",
        contextTokens: 128_000, reasoning: true, tools: true, speed: 2, quality: 5, extraBody: NEMOTRON_EXTRA }),
    m({ id: process.env.VISION_MODEL || "moonshotai/kimi-k3", label: "Kimi K3 (vision)", provider: "nvidia", providerModel: process.env.VISION_MODEL || "moonshotai/kimi-k3",
        contextTokens: 1_000_000, reasoning: true, vision: true, tools: true, speed: 2, quality: 5, extraBody: visionEffort,
        apiKey: process.env.VISION_API_KEY || undefined }),
    m({ id: "openai:gpt-4o-mini", label: "GPT-4o mini", provider: "openai", providerModel: "gpt-4o-mini", vision: true, tools: true, speed: 5, quality: 3, costIn: 0.15, costOut: 0.6 }),
    m({ id: "openai:gpt-4o", label: "GPT-4o", provider: "openai", providerModel: "gpt-4o", vision: true, tools: true, speed: 4, quality: 4, costIn: 2.5, costOut: 10 }),
    m({ id: "google:gemini-2.5-flash", label: "Gemini Flash", provider: "google", providerModel: "gemini-2.5-flash", contextTokens: 1_000_000, vision: true, tools: true, speed: 5, quality: 4 }),
    m({ id: "groq:llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", provider: "groq", providerModel: "llama-3.3-70b-versatile", tools: true, speed: 5, quality: 3 }),
    m({ id: "anthropic:claude-sonnet", label: "Claude Sonnet", provider: "anthropic", providerModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", contextTokens: 200_000, reasoning: true, vision: true, tools: true, speed: 3, quality: 5, costIn: 3, costOut: 15 }),
    m({ id: "ollama:local", label: "Local (Ollama)", provider: "ollama", providerModel: process.env.OLLAMA_MODEL || "llama3.1", speed: 3, quality: 2 }),
    m({ id: "custom:default", label: process.env.CUSTOM_AI_LABEL || "Custom model", provider: "custom", providerModel: process.env.CUSTOM_AI_MODEL || "default", speed: 3, quality: 3 }),
  ];
}

/** "modelId|Label,modelId2|Label2" → models for one provider */
function parseModelList(raw: string, provider: ProviderId, idPrefix: string): ModelInfo[] {
  return raw.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [mid, label] = x.split("|").map((y) => y.trim());
    return m({ id: idPrefix ? `${idPrefix}:${mid}` : mid, label: label || mid, provider, providerModel: mid, tools: true });
  });
}

/** Built-in defaults for the providers that have none above (used when <PREFIX>_MODELS is not set). */
const EXTRA_DEFAULTS: Record<string, string> = {
  deepseek: "deepseek-chat|DeepSeek Chat",
  mistral: "mistral-large-latest|Mistral Large",
  xai: "grok-3-mini|Grok",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo|Llama 3.3 70B (Together)",
  fireworks: "accounts/fireworks/models/llama-v3p3-70b-instruct|Llama 3.3 70B (Fireworks)",
  cerebras: "llama-3.3-70b|Llama 3.3 70B (Cerebras)",
  perplexity: "sonar|Perplexity Sonar",
};

/** Apply <PREFIX>_MODELS overrides + add models of providers without built-in defaults + numbered providers. */
function withEnvModels(base: ModelInfo[]): ModelInfo[] {
  const e = process.env;
  let out = [...base];
  for (const k of KNOWN) {
    const raw = e[`${k.prefix}_MODELS`];
    // NVIDIA keeps using the legacy MODELS env (handled in fromLegacy)
    if (k.id === "nvidia") continue;
    if (raw) {
      out = out.filter((x) => x.provider !== k.id);
      out.push(...parseModelList(raw, k.id, k.id));
    } else if (EXTRA_DEFAULTS[k.id] && !out.some((x) => x.provider === k.id)) {
      out.push(...parseModelList(EXTRA_DEFAULTS[k.id], k.id, k.id));
    }
  }
  if (e.OLLAMA_MODELS) { out = out.filter((x) => x.provider !== "ollama"); out.push(...parseModelList(e.OLLAMA_MODELS, "ollama", "ollama")); }
  if (e.CUSTOM_AI_MODELS) { out = out.filter((x) => x.provider !== "custom"); out.push(...parseModelList(e.CUSTOM_AI_MODELS, "custom", "custom")); }
  for (let n = 1; n <= MAX_CUSTOM; n++) {
    if (!e[`AI_PROVIDER_${n}_URL`]) continue;
    const raw = e[`AI_PROVIDER_${n}_MODELS`] || e[`AI_PROVIDER_${n}_MODEL`] || "";
    if (raw) out.push(...parseModelList(raw, `p${n}`, `p${n}`));
  }
  return out;
}

function fromEnvJson(): ModelInfo[] | null {
  const raw = process.env.AI_MODELS;
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((x) => x && typeof x.id === "string" && typeof x.provider === "string")
      .map((x) => m({ ...x, providerModel: x.providerModel || x.id, label: x.label || x.id }));
  } catch {
    console.error(JSON.stringify({ level: "error", scope: "ai.registry", event: "AI_MODELS invalid JSON" }));
    return null;
  }
}

/** Legacy MODELS env ("nvidiaId|Label,…") — kept for backward compatibility. */
function fromLegacy(): ModelInfo[] | null {
  const raw = process.env.MODELS;
  if (!raw) return null;
  const base = defaults();
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [id, label] = s.split("|").map((x) => x.trim());
    const known = base.find((d) => d.id === id);
    return known ? { ...known, label: label || known.label } : m({ id, label: label || id, provider: "nvidia", providerModel: id });
  });
}

let cache: { key: string; models: ModelInfo[] } | null = null;

/** All models whose provider is configured. */
export function availableModels(): ModelInfo[] {
  const active = new Set(providerConfigs().map((p) => p.id));
  const modelEnv = Object.keys(process.env).filter((k) => k.endsWith("_MODELS") || k.endsWith("_MODEL")).sort().map((k) => `${k}=${process.env[k]}`).join(";");
  const key = [...active].join(",") + "|" + (process.env.AI_MODELS || "") + "|" + modelEnv;
  if (cache?.key === key) return cache.models;
  const legacy = fromLegacy();
  // legacy MODELS replaces only the NVIDIA defaults; other providers keep their defaults
  // AI_MODELS (JSON) = full manual control; otherwise defaults + per-provider *_MODELS env
  const list = fromEnvJson() || withEnvModels(legacy ? [...legacy, ...defaults().filter((d) => d.provider !== "nvidia" || d.vision)] : defaults());
  const seen = new Set<string>();
  const models = list.filter((x) => active.has(x.provider) && !seen.has(x.id) && seen.add(x.id));
  cache = { key, models };
  return models;
}

export function getModel(id: string): ModelInfo | undefined {
  return availableModels().find((x) => x.id === id);
}

/** DEFAULT_MODEL env (registry id, e.g. "openai:gpt-4o-mini" or "p1:my-model") — used first when the user picks "Auto". */
export function defaultModel(): ModelInfo | undefined {
  const id = (process.env.DEFAULT_MODEL || "").trim();
  if (!id) return undefined;
  const all = availableModels();
  return all.find((x) => x.id === id) || all.find((x) => x.providerModel === id);
}

export function isPolicy(v: unknown): v is Policy {
  return typeof v === "string" && (POLICIES as string[]).includes(v);
}

/** Fastest available text model (titles, prompt rewrites). */
export function fastModel(): ModelInfo | undefined {
  return [...availableModels()].sort((a, b) => b.speed - a.speed || b.quality - a.quality)[0];
}

const POLICY_LABEL: Record<Policy, string> = { auto: "Auto", fast: "Fast", balanced: "Balanced", quality: "Best quality" };

/** What the UI model picker shows: routing policies first, then concrete models. */
export function publicModelList(): { id: string; label: string; kind: "policy" | "model"; provider?: string; vision?: boolean; reasoning?: boolean }[] {
  const models = availableModels();
  if (!models.length) return [{ id: "auto", label: "Auto", kind: "policy" }];
  return [
    ...POLICIES.map((p) => ({ id: p, label: POLICY_LABEL[p], kind: "policy" as const })),
    { id: "agent", label: "Agent", kind: "policy" as const }, // plan → use tools → answer (services/agent.ts)
    ...models.map((x) => ({ id: x.id, label: x.label, kind: "model" as const, provider: x.provider, vision: x.vision, reasoning: x.reasoning })),
  ];
}

export function __clearRegistryCache() { cache = null; }
