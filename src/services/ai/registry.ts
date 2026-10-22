// ARPA AI Gateway — provider + model registry.
// Providers switch on automatically when their API key / URL is present in env.
// Models come from (in order): AI_MODELS (JSON) → legacy MODELS ("id|Label,…", NVIDIA) → built-in defaults.
// Nothing outside this file should hard-code model names.
import type { ModelInfo, Policy, ProviderConfig, ProviderId } from "./types";
import { POLICIES } from "./types";

/* ---------------- providers ---------------- */
export function providerConfigs(): ProviderConfig[] {
  const e = process.env;
  const list: (ProviderConfig | null)[] = [
    e.NVIDIA_API_KEY ? { id: "nvidia", label: "NVIDIA NIM", baseUrl: e.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1", apiKey: e.NVIDIA_API_KEY, streamUsage: false } : null,
    e.OPENAI_API_KEY ? { id: "openai", label: "OpenAI", baseUrl: e.OPENAI_BASE_URL || "https://api.openai.com/v1", apiKey: e.OPENAI_API_KEY, streamUsage: true } : null,
    e.ANTHROPIC_API_KEY ? { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: e.ANTHROPIC_API_KEY, streamUsage: false } : null,
    e.GEMINI_API_KEY ? { id: "google", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: e.GEMINI_API_KEY, streamUsage: true } : null,
    e.GROQ_API_KEY ? { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: e.GROQ_API_KEY, streamUsage: true } : null,
    e.OPENROUTER_API_KEY ? { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: e.OPENROUTER_API_KEY, streamUsage: true } : null,
    e.OLLAMA_BASE_URL ? { id: "ollama", label: "Ollama (local)", baseUrl: e.OLLAMA_BASE_URL, apiKey: "ollama", streamUsage: false } : null,
    e.CUSTOM_AI_BASE_URL ? { id: "custom", label: e.CUSTOM_AI_LABEL || "Custom", baseUrl: e.CUSTOM_AI_BASE_URL, apiKey: e.CUSTOM_AI_API_KEY, streamUsage: false } : null,
  ];
  return list.filter(Boolean) as ProviderConfig[];
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
  const key = [...active].join(",") + "|" + (process.env.AI_MODELS || "") + "|" + (process.env.MODELS || "");
  if (cache?.key === key) return cache.models;
  const legacy = fromLegacy();
  // legacy MODELS replaces only the NVIDIA defaults; other providers keep their defaults
  const list = fromEnvJson() || (legacy ? [...legacy, ...defaults().filter((d) => d.provider !== "nvidia" || d.vision)] : defaults());
  const seen = new Set<string>();
  const models = list.filter((x) => active.has(x.provider) && !seen.has(x.id) && seen.add(x.id));
  cache = { key, models };
  return models;
}

export function getModel(id: string): ModelInfo | undefined {
  return availableModels().find((x) => x.id === id);
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
