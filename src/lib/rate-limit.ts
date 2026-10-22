// ARPA — rate limiting (sliding fixed-window counters).
// Backend:
//   • Upstash Redis REST (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) → shared across all
//     serverless instances — recommended for production.
//   • Otherwise an in-memory map per server instance (best-effort; still blocks bursts/brute force).
// The daily message quota (takeQuota in lib/arpa.ts) is separate and DB-backed.

type Rule = { limit: number; windowSec: number };

/** Central policy table — tune here, not in routes. */
export const RATE_RULES = {
  auth: { limit: 10, windowSec: 60 },        // login attempts per IP
  chat: { limit: 20, windowSec: 60 },        // chat messages per user
  image: { limit: 6, windowSec: 60 },        // image generations per user
  tool: { limit: 30, windowSec: 60 },        // search / vision / asr / images per user
  write: { limit: 60, windowSec: 60 },       // chat saves etc. per user
  payment: { limit: 10, windowSec: 300 },    // order / verify per user
} satisfies Record<string, Rule>;
export type RateRule = keyof typeof RATE_RULES;

const mem = new Map<string, { n: number; reset: number }>();

async function hitMemory(key: string, r: Rule): Promise<{ n: number; reset: number }> {
  const now = Date.now();
  let e = mem.get(key);
  if (!e || e.reset <= now) {
    e = { n: 0, reset: now + r.windowSec * 1000 };
    mem.set(key, e);
  }
  e.n++;
  if (mem.size > 50_000) for (const [k, v] of mem) if (v.reset <= now) mem.delete(k); // housekeeping
  return e;
}

async function hitRedis(key: string, r: Rule): Promise<{ n: number; reset: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(r.windowSec), "NX"], ["PTTL", key]]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result: number }[];
    const n = Number(out[0]?.result || 0);
    const ttl = Math.max(0, Number(out[2]?.result || r.windowSec * 1000));
    return { n, reset: Date.now() + ttl };
  } catch {
    return null; // Redis down → fall back to memory rather than blocking everyone
  }
}

export type RateResult = { ok: boolean; remaining: number; retryAfter: number; limit: number };

/** Count one hit for `id` under `rule`. */
export async function rateLimit(rule: RateRule, id: string): Promise<RateResult> {
  const r = RATE_RULES[rule];
  const bucket = Math.floor(Date.now() / (r.windowSec * 1000));
  const key = `rl:${rule}:${id}:${bucket}`;
  const hit = (await hitRedis(key, r)) || (await hitMemory(key, r));
  const remaining = Math.max(0, r.limit - hit.n);
  return { ok: hit.n <= r.limit, remaining, retryAfter: Math.max(1, Math.ceil((hit.reset - Date.now()) / 1000)), limit: r.limit };
}

/** Best-effort client IP (Vercel / proxies). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** Returns a 429 Response when the limit is exceeded, otherwise null. */
export async function enforceRate(rule: RateRule, id: string): Promise<Response | null> {
  const r = await rateLimit(rule, id);
  if (r.ok) return null;
  return new Response(
    JSON.stringify({ ok: false, error: `Too many requests. Please wait ${r.retryAfter}s and try again.`, code: "RATE_LIMIT" }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(r.retryAfter),
        "x-ratelimit-limit": String(r.limit),
        "x-ratelimit-remaining": "0",
      },
    },
  );
}

/** test helper */
export function __resetRateMemory() { mem.clear(); }
