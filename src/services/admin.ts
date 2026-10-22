// ARPA — admin service: who is an admin, platform stats, user management, audit log.
// Admin = User.role "admin" OR email listed in ADMIN_EMAILS (comma separated). Every write is audited.
import { db } from "@/lib/db";
import { status, clearBlockCache } from "@/lib/arpa";

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export function isAdmin(u: { email?: string | null; role?: string | null } | null | undefined): boolean {
  if (!u) return false;
  return u.role === "admin" || (!!u.email && adminEmails().includes(u.email.toLowerCase()));
}

const IST = "Asia/Kolkata";
export const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });

/** Last `days` IST calendar days, oldest first (YYYY-MM-DD). */
export function dayRange(days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(istDay(new Date(now.getTime() - i * 86400000)));
  return [...new Set(out)];
}

export type DailyPoint = { day: string; messages: number; activeUsers: number; signups: number; costUsd: number; tokens: number; errors: number; aiCalls: number };

const num = (v: unknown) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0)) || 0;

export async function getStats(days: number) {
  const range = dayRange(days);
  const since = new Date(`${range[0]}T00:00:00+05:30`);
  const [
    totalUsers, newUsers, blockedUsers, usageRows, eventDaily, signupDaily, byModel, byKind, payAgg, payCount, usersForPlans,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.user.count({ where: { blocked: true } }),
    db.usage.findMany({ where: { day: { in: range } }, select: { day: true, userId: true, count: true } }),
    db.$queryRawUnsafe(
      `SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${IST}', 'YYYY-MM-DD') AS day,
              COUNT(*) AS calls, COALESCE(SUM("costUsd"),0) AS cost,
              COALESCE(SUM("inputTokens" + "outputTokens"),0) AS tokens,
              COUNT(*) FILTER (WHERE NOT ok) AS errors
         FROM "UsageEvent" WHERE "createdAt" >= $1 GROUP BY 1 ORDER BY 1`, since,
    ).catch(() => []),
    db.$queryRawUnsafe(
      `SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${IST}', 'YYYY-MM-DD') AS day, COUNT(*) AS n
         FROM "User" WHERE "createdAt" >= $1 GROUP BY 1`, since,
    ).catch(() => []),
    db.usageEvent.groupBy({
      by: ["model"], where: { createdAt: { gte: since } },
      _count: { _all: true }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _avg: { latencyMs: true },
    }).catch(() => []),
    db.usageEvent.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }).catch(() => []),
    db.payment.aggregate({ where: { at: { gte: since } }, _sum: { amount: true } }).catch(() => null),
    db.payment.count({ where: { at: { gte: since } } }).catch(() => 0),
    db.user.findMany({ select: { paidUntil: true, trialEnds: true, plan: true } }).catch(() => []),
  ]);

  const usage = (usageRows || []) as { day: string; userId: string; count: number }[];
  const ev = new Map(((eventDaily || []) as any[]).map((r) => [String(r.day), r]));
  const su = new Map(((signupDaily || []) as any[]).map((r) => [String(r.day), num(r.n)]));
  const daily: DailyPoint[] = range.map((day) => {
    const u = usage.filter((r) => r.day === day && r.count > 0);
    const e = ev.get(day);
    return {
      day,
      messages: u.reduce((a, r) => a + r.count, 0),
      activeUsers: new Set(u.map((r) => r.userId)).size,
      signups: su.get(day) || 0,
      costUsd: num(e?.cost),
      tokens: num(e?.tokens),
      errors: num(e?.errors),
      aiCalls: num(e?.calls),
    };
  });

  const plans = { paid: 0, trial: 0, expired: 0 };
  for (const u of (usersForPlans || []) as any[]) plans[status(u).state]++;

  const totals = {
    users: totalUsers || 0,
    newUsers: newUsers || 0,
    blockedUsers: blockedUsers || 0,
    activeUsers: new Set(usage.filter((r) => r.count > 0).map((r) => r.userId)).size,
    messages: daily.reduce((a, d) => a + d.messages, 0),
    aiCalls: daily.reduce((a, d) => a + d.aiCalls, 0),
    costUsd: daily.reduce((a, d) => a + d.costUsd, 0),
    tokens: daily.reduce((a, d) => a + d.tokens, 0),
    errors: daily.reduce((a, d) => a + d.errors, 0),
    revenuePaise: num((payAgg as any)?._sum?.amount),
    payments: payCount || 0,
    plans,
  };

  const models = ((byModel || []) as any[])
    .map((r) => ({
      model: r.model || "(unknown)",
      calls: r._count?._all || 0,
      costUsd: r._sum?.costUsd || 0,
      tokens: (r._sum?.inputTokens || 0) + (r._sum?.outputTokens || 0),
      avgLatencyMs: Math.round(r._avg?.latencyMs || 0),
    }))
    .sort((a, b) => b.calls - a.calls);
  const kinds = ((byKind || []) as any[]).map((r) => ({ kind: r.kind, calls: r._count?._all || 0 })).sort((a, b) => b.calls - a.calls);

  return { days, range: { from: range[0], to: range[range.length - 1] }, totals, daily, models, kinds, usdInr: Number(process.env.USD_INR || 88) };
}

export type UserFilter = "all" | "paid" | "trial" | "expired" | "blocked" | "admin";

export async function listUsers(opts: { q?: string; filter?: UserFilter; page?: number; pageSize?: number }) {
  const pageSize = Math.min(100, Math.max(5, opts.pageSize || 25));
  const page = Math.max(1, opts.page || 1);
  const q = (opts.q || "").trim().slice(0, 100);
  const now = new Date();
  const where: any = {};
  if (q) where.OR = [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }];
  switch (opts.filter) {
    case "paid": where.paidUntil = { gt: now }; break;
    case "trial": where.AND = [{ OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] }, { trialEnds: { gt: now } }]; break;
    case "expired": where.AND = [{ OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] }, { trialEnds: { lte: now } }]; break;
    case "blocked": where.blocked = true; break;
    case "admin": {
      const adminOr = [{ role: "admin" }, ...(adminEmails().length ? [{ email: { in: adminEmails() } }] : [])];
      if (where.OR) { where.AND = [{ OR: where.OR }, { OR: adminOr }]; delete where.OR; } else where.OR = adminOr;
      break;
    }
  }
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, email: true, name: true, picture: true, plan: true, role: true, blocked: true, blockedReason: true, createdAt: true, lastSeen: true, trialEnds: true, paidUntil: true },
    }),
  ]);
  const ids = (rows || []).map((r: any) => r.id);
  const since30 = istDay(new Date(Date.now() - 29 * 86400000));
  const [msgs, cost] = ids.length
    ? await Promise.all([
        db.usage.groupBy({ by: ["userId"], where: { userId: { in: ids }, day: { gte: since30 } }, _sum: { count: true } }).catch(() => []),
        db.usageEvent.groupBy({ by: ["userId"], where: { userId: { in: ids }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _sum: { costUsd: true } }).catch(() => []),
      ])
    : [[], []];
  const m = new Map((msgs as any[]).map((r) => [r.userId, r._sum?.count || 0]));
  const c = new Map((cost as any[]).map((r) => [r.userId, r._sum?.costUsd || 0]));
  return {
    total: total || 0, page, pageSize,
    users: (rows || []).map((u: any) => ({
      id: u.id, email: u.email, name: u.name, picture: u.picture, plan: u.plan,
      admin: isAdmin(u), role: u.role, blocked: u.blocked, blockedReason: u.blockedReason,
      createdAt: u.createdAt.getTime(), lastSeen: u.lastSeen.getTime(),
      sub: status(u), messages30d: m.get(u.id) || 0, costUsd30d: c.get(u.id) || 0,
    })),
  };
}

export class AdminError extends Error { constructor(m: string, public status = 400) { super(m); this.name = "AdminError"; } }

export type AdminAction =
  | { action: "extend"; days: number; reason?: string }
  | { action: "block"; reason?: string }
  | { action: "unblock" }
  | { action: "role"; role: "user" | "admin" };

export async function updateUser(admin: { id: string; email: string }, targetId: string, a: AdminAction) {
  const t = await db.user.findUnique({ where: { id: targetId } });
  if (!t) throw new AdminError("User not found", 404);
  if (t.id === admin.id && (a.action === "block" || (a.action === "role" && a.role !== "admin"))) {
    throw new AdminError("You cannot block yourself or remove your own admin role.");
  }
  let data: any;
  let details: Record<string, unknown> = {};
  switch (a.action) {
    case "extend": {
      const days = Math.round(a.days);
      if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 3650) throw new AdminError("Days must be between -3650 and 3650 (not 0).");
      const now = Date.now();
      const st = status(t);
      if (st.state === "paid") {
        const until = new Date(Math.max(now, t.paidUntil!.getTime()) + days * 86400000);
        data = { paidUntil: until };
        details = { field: "paidUntil", days, from: t.paidUntil, to: until };
      } else {
        const until = new Date(Math.max(now, t.trialEnds.getTime()) + days * 86400000);
        data = { trialEnds: until };
        details = { field: "trialEnds", days, from: t.trialEnds, to: until };
      }
      if (a.reason) details.reason = a.reason.slice(0, 300);
      break;
    }
    case "block":
      data = { blocked: true, blockedReason: (a.reason || "").slice(0, 300) };
      details = { reason: a.reason || "" };
      break;
    case "unblock":
      data = { blocked: false, blockedReason: "" };
      break;
    case "role":
      data = { role: a.role };
      details = { from: t.role, to: a.role };
      break;
  }
  const [u] = await db.$transaction([
    db.user.update({ where: { id: t.id }, data }),
    db.adminAudit.create({
      data: { adminId: admin.id, adminEmail: admin.email, action: a.action, targetId: t.id, targetEmail: t.email, details: JSON.stringify(details) },
    }),
  ]);
  clearBlockCache(t.uid);
  return { id: u.id, blocked: u.blocked, role: u.role, sub: status(u) };
}

export async function recentErrors(limit = 50) {
  const rows: any[] = (await db.usageEvent.findMany({
    where: { ok: false }, orderBy: { createdAt: "desc" }, take: Math.min(200, limit),
    select: { id: true, kind: true, model: true, error: true, latencyMs: true, createdAt: true, user: { select: { email: true } } },
  })) || [];
  return rows.map((r) => ({ id: r.id, kind: r.kind, model: r.model, error: String(r.error || "").slice(0, 300), latencyMs: r.latencyMs, at: r.createdAt.getTime(), email: r.user?.email || "" }));
}

export async function auditLog(limit = 50) {
  const rows: any[] = (await db.adminAudit.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(200, limit) })) || [];
  return rows.map((r) => ({ id: r.id, admin: r.adminEmail, action: r.action, target: r.targetEmail, details: safeJson(r.details), at: r.createdAt.getTime() }));
}

const safeJson = (s: string) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
