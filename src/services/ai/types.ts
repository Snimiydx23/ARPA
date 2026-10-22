// ARPA AI Gateway — shared types (provider-independent)

export type Role = "system" | "user" | "assistant";
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export type AIMessage = { role: Role; content: string | ContentPart[] };

export type Policy = "auto" | "fast" | "balanced" | "quality";
export const POLICIES: Policy[] = ["auto", "fast", "balanced", "quality"];

export type ProviderId = "nvidia" | "openai" | "anthropic" | "google" | "groq" | "openrouter" | "ollama" | "custom";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  apiKey?: string;
  /** provider accepts stream_options.include_usage (OpenAI-style usage in the last chunk) */
  streamUsage: boolean;
}

export interface ModelInfo {
  /** registry id used by the UI / API (stable) */
  id: string;
  label: string;
  provider: ProviderId;
  /** id sent to the provider */
  providerModel: string;
  type: "chat";
  contextTokens: number;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  /** 1 (slow) … 5 (fastest) */
  speed: number;
  /** 1 (basic) … 5 (best) */
  quality: number;
  /** USD per 1M tokens (0 = free / unknown) */
  costIn: number;
  costOut: number;
  /** optional per-model API key (e.g. VISION_API_KEY); falls back to the provider key */
  apiKey?: string;
  /** extra provider-specific request fields (e.g. reasoning toggles) */
  extraBody?: Record<string, unknown>;
}

export type Usage = { inputTokens: number; outputTokens: number; estimated: boolean };

export interface ChatRequest {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** One streamed delta. */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "finish"; reason: string }
  | { type: "usage"; usage: Usage };

export interface AIProvider {
  readonly config: ProviderConfig;
  /** non-streaming completion → text + usage */
  chat(model: ModelInfo, req: ChatRequest): Promise<{ text: string; usage: Usage }>;
  /** streaming completion; throws BEFORE yielding when the request itself fails (so the router can fall back) */
  stream(model: ModelInfo, req: ChatRequest): Promise<AsyncIterable<StreamEvent>>;
}

export class ProviderError extends Error {
  constructor(message: string, public status: number, public provider: string, public retryable: boolean) {
    super(message);
    this.name = "ProviderError";
  }
}
