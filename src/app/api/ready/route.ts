// GET /api/ready — readiness: database reachable + AI providers configured.
// Returns 503 when the app cannot serve chats. Never exposes secrets — only booleans/counts.
import { db } from "@/lib/db";
import { availableModels, providerConfigs } from "@/services/ai/registry";
import { payMode } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  let dbOk = false;
  try { await db.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  const providers = providerConfigs().map((p) => p.id);
  const models = availableModels().length;
  const checks = {
    database: { ok: dbOk, ms: Date.now() - t0 },
    ai: { ok: models > 0, providers, models },
    auth: { ok: true, google: !!process.env.GOOGLE_CLIENT_ID, strongSecret: (process.env.ARPA_AUTH_SECRET || "").length >= 32 },
    payments: { mode: payMode() },
    rateLimit: { backend: process.env.UPSTASH_REDIS_REST_URL ? "redis" : "memory" },
  };
  const ok = dbOk && models > 0;
  return new Response(JSON.stringify({ ok, checks }), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
