// ARPA — route guard: auth + rate limit + user lookup in one call (keeps route handlers thin).
// const g = await guard(req, "write"); if (g.error) return g.error; const user = g.user;
import { db } from "@/lib/db";
import { bearerUid, json, blockedResponse } from "@/lib/arpa";
import { enforceRate, type RateRule } from "@/lib/rate-limit";

export type GuardUser = { id: string; uid: string; name: string; email: string; memoryEnabled: boolean };

export async function guard(req: Request, rule: RateRule): Promise<{ user: GuardUser; error?: undefined } | { user?: undefined; error: Response }> {
  const uid = bearerUid(req);
  if (!uid) return { error: json({ ok: false, error: "Please log in" }, 401) };
  const limited = await enforceRate(rule, uid);
  if (limited) return { error: limited };
  const u = await db.user.findUnique({ where: { uid }, select: { id: true, uid: true, name: true, email: true, memoryEnabled: true, blocked: true } });
  if (!u) return { error: json({ ok: false, error: "User not found" }, 401) };
  if (u.blocked) return { error: blockedResponse() };
  const { blocked: _b, ...user } = u;
  return { user };
}
