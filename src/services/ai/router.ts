// ARPA AI Gateway — intelligent model router.
// Input: what the user asked for (a concrete model id or a policy) + facts about the request.
// Output: an ordered candidate list — first = chosen model, the rest = fallbacks with the same capabilities.
import type { ModelInfo, Policy } from "./types";
import { availableModels, getModel, isPolicy } from "./registry";

export type RouteInput = {
  requested?: string;      // model id or policy; default "auto"
  hasImage: boolean;
  totalChars: number;      // size of the context being sent
  lastUserText: string;
};

export type RouteDecision = {
  candidates: ModelInfo[];
  policy: Policy | "manual";
  reason: string;          // human-readable, for logs / debugging
};

const REASONING_RE = /\b(code|coding|bug|error|stack ?trace|function|algorithm|sql|regex|python|javascript|typescript|prove|derive|equation|calculate|calculation|dscr|irr|npv|emi|cma|mpbf|tandon|financial|analy[sz]e|analysis|compare|strategy|step by step|reason|why does|optimi[sz]e|architecture|legal|section \d+|tax)\b/i;
const CREATIVE_RE = /\b(story|poem|kavita|shayari|song|lyrics|creative|slogan|tagline|caption)\b/i;

/** AUTO: classify the request into a policy. */
export function classify(input: RouteInput): { policy: Exclude<Policy, "auto">; reason: string } {
  const t = input.lastUserText;
  if (input.totalChars > 60_000) return { policy: "quality", reason: "long context" };
  if (REASONING_RE.test(t) || t.length > 1200) return { policy: "quality", reason: "reasoning / analysis" };
  if (CREATIVE_RE.test(t)) return { policy: "balanced", reason: "creative writing" };
  if (t.length < 160) return { policy: "fast", reason: "short question" };
  return { policy: "balanced", reason: "general" };
}

function score(mo: ModelInfo, p: Exclude<Policy, "auto">) {
  if (p === "fast") return mo.speed * 10 + mo.quality;
  if (p === "quality") return mo.quality * 10 + mo.speed + (mo.reasoning ? 3 : 0);
  return (mo.speed + mo.quality) * 10 + (mo.reasoning ? 1 : 0);
}

export function route(input: RouteInput): RouteDecision {
  const all = availableModels();
  const needTokens = Math.ceil(input.totalChars / 4) + 2000;
  // hard requirements
  const capable = all.filter((mo) => (!input.hasImage || mo.vision) && mo.contextTokens >= needTokens);
  // if nothing fits the context, still try the largest-context capable models (server trims history anyway)
  const pool = capable.length
    ? capable
    : all.filter((mo) => !input.hasImage || mo.vision).sort((a, b) => b.contextTokens - a.contextTokens);

  const req = input.requested || "auto";
  const manual = !isPolicy(req) ? getModel(req) : undefined;

  let policy: Exclude<Policy, "auto">;
  let reason: string;
  if (manual && pool.includes(manual)) {
    policy = "balanced";
    reason = "user selected model";
  } else if (isPolicy(req) && req !== "auto") {
    policy = req;
    reason = `policy ${req}`;
  } else {
    ({ policy, reason } = classify(input));
    if (manual) reason = `selected model can't handle this request (${input.hasImage ? "needs vision" : "context too large"}) → ${reason}`;
  }
  if (input.hasImage) reason += " + image → vision model";

  const ranked = [...pool].sort((a, b) => score(b, policy) - score(a, policy));
  const candidates = manual && pool.includes(manual) ? [manual, ...ranked.filter((x) => x !== manual)] : ranked;
  return { candidates, policy: manual && pool.includes(manual) ? "manual" : policy, reason };
}
