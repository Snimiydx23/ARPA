// GET /api/usage — the signed-in user's AI usage for the last 30 days (tokens, calls, by model).
import { db } from "@/lib/db";
import { bearerUid, json } from "@/lib/arpa";
import { enforceRate } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const limited = await enforceRate("tool", uid);
  if (limited) return limited;
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await db.usageEvent.groupBy({
    by: ["model", "kind"],
    where: { userId: u.id, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true },
    _avg: { latencyMs: true },
  });
  const byModel = rows.map((r) => ({
    model: r.model, kind: r.kind, calls: r._count._all,
    inputTokens: r._sum.inputTokens || 0, outputTokens: r._sum.outputTokens || 0,
    avgLatencyMs: Math.round(r._avg.latencyMs || 0),
  }));
  const totals = byModel.reduce((a, r) => ({ calls: a.calls + r.calls, inputTokens: a.inputTokens + r.inputTokens, outputTokens: a.outputTokens + r.outputTokens }), { calls: 0, inputTokens: 0, outputTokens: 0 });
  return json({ ok: true, since: since.toISOString(), totals, byModel });
}
