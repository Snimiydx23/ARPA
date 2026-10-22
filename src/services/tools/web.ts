// ARPA — web tools backed by Tavily (search API built for LLM agents).
// Env: TAVILY_API_KEY (required to enable), TAVILY_BASE_URL (optional, default https://api.tavily.com)
import { z } from "zod";
import type { Tool } from "./types";
import { ToolError } from "./types";

export type WebSource = {
  n: number;           // citation number [n]
  title: string;
  url: string;
  domain: string;
  snippet: string;     // short text shown on the source card
  content: string;     // text given to the model (bounded)
  published?: string;
  score?: number;
};

const base = () => (process.env.TAVILY_BASE_URL || "https://api.tavily.com").replace(/\/+$/, "");
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const SAFE_URL = /^https?:\/\//i;

async function tavily(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new ToolError("Web search is not configured (TAVILY_API_KEY).", "UNAVAILABLE");
  const r = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ToolError(j?.detail?.error || j?.error || `Search error ${r.status}`, "FAILED");
  return j;
}

export const webSearchInput = z.object({
  query: z.string().trim().min(2).max(400),
  maxResults: z.number().int().min(1).max(10).default(5),
  depth: z.enum(["basic", "advanced"]).default("basic"),
  topic: z.enum(["general", "news"]).default("general"),
  contentChars: z.number().int().min(200).max(8000).default(1500),
});

export const webSearchTool: Tool<typeof webSearchInput, Omit<WebSource, "n">[]> = {
  name: "web_search",
  description: "Search the live web and return the most relevant pages with extracted text.",
  inputSchema: webSearchInput,
  permissions: ["network:search"],
  available: () => !!process.env.TAVILY_API_KEY,
  async execute(input, ctx) {
    const j = await tavily("/search", {
      query: input.query,
      max_results: input.maxResults,
      search_depth: input.depth,
      topic: input.topic,
      include_raw_content: input.depth === "advanced",
    }, ctx.signal);
    const results: any[] = Array.isArray(j?.results) ? j.results : [];
    return results
      .filter((x) => typeof x?.url === "string" && SAFE_URL.test(x.url))
      .map((x) => {
        const text = String(x.raw_content || x.content || "").replace(/\s+/g, " ").trim();
        return {
          title: String(x.title || domainOf(x.url)).slice(0, 200),
          url: x.url,
          domain: domainOf(x.url),
          snippet: String(x.content || "").replace(/\s+/g, " ").trim().slice(0, 280),
          content: text.slice(0, input.contentChars),
          published: x.published_date || undefined,
          score: typeof x.score === "number" ? x.score : undefined,
        };
      });
  },
};

export const webReadInput = z.object({
  url: z.string().trim().url().max(2000).refine((u) => SAFE_URL.test(u), "only http(s) URLs"),
  maxChars: z.number().int().min(500).max(12000).default(6000),
});

/** Read one public web page. The page is fetched by Tavily (not by our server), so there is no SSRF risk. */
export const webReadTool: Tool<typeof webReadInput, { url: string; title: string; domain: string; content: string }> = {
  name: "web_read",
  description: "Read the main text of one public web page (e.g. an official notification or article found by web_search).",
  inputSchema: webReadInput,
  permissions: ["network:read"],
  available: () => !!process.env.TAVILY_API_KEY,
  async execute(input, ctx) {
    const j = await tavily("/extract", { urls: [input.url], extract_depth: "basic" }, ctx.signal);
    const r = Array.isArray(j?.results) ? j.results[0] : null;
    if (!r?.raw_content) throw new ToolError("Could not read that page.", "FAILED");
    const text = String(r.raw_content).replace(/\s+/g, " ").trim();
    const title = (/^#\s+(.+)$/m.exec(String(r.raw_content))?.[1] || domainOf(input.url)).slice(0, 200);
    return { url: input.url, title, domain: domainOf(input.url), content: text.slice(0, input.maxChars) };
  },
};

export const toolsList: Tool<any, any>[] = [webSearchTool, webReadTool];
