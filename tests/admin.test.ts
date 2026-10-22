import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
const A = await import("../src/services/admin");
const { issueToken } = await import("../src/lib/arpa");
const { AdminActionSchema } = await import("../src/lib/validate");
const { __resetRateMemory } = await import("../src/lib/rate-limit");
const statsRoute = await import("../src/app/api/admin/stats/route");
const userRoute = await import("../src/app/api/admin/users/[id]/route");
const meRoute = await import("../src/app/api/me/route");
const chatRoute = await import("../src/app/api/chat/route");

const ADMIN = { id: "a1", uid: "u_aaaaaaaaaaaaaaaa", email: "owner@rma.in", name: "Owner", role: "user", blocked: false, memoryEnabled: true, picture: "", plan: "trial", trialEnds: new Date(Date.now() + 5 * 864e5), paidUntil: null as Date | null, createdAt: new Date(), lastSeen: new Date() };
const USER = { ...ADMIN, id: "b1", uid: "u_bbbbbbbbbbbbbbbb", email: "client@x.com", name: "Client" };
let users: any[] = [];
let audits: any[] = [];

beforeEach(() => {
  process.env.ARPA_AUTH_SECRET = "test-secret-0123456789";
  process.env.ADMIN_EMAILS = "Owner@RMA.in, other@rma.in";
  __resetRateMemory();
  users = [structuredClone(ADMIN), structuredClone(USER)];
  audits = [];
  const find = (w: any) => users.find((u) => (w.uid ? u.uid === w.uid : u.id === w.id));
  (globalThis as any).__db = {
    user: {
      findUnique: async ({ where }: any) => find(where) || null,
      update: async ({ where, data }: any) => Object.assign(find(where), data),
      count: async () => users.length,
      findMany: async () => users,
    },
    adminAudit: { create: async ({ data }: any) => { audits.push(data); return data; } },
    usage: { findMany: async () => [{ day: A.dayRange(1)[0], userId: "b1", count: 5 }, { day: A.dayRange(1)[0], userId: "a1", count: 2 }], findUnique: async () => null },
    usageEvent: { groupBy: async () => [{ model: "m1", _count: { _all: 3 }, _sum: { costUsd: 0.5, inputTokens: 10, outputTokens: 5 }, _avg: { latencyMs: 1200 } }] },
    payment: { aggregate: async () => ({ _sum: { amount: 49900 } }), count: async () => 1 },
    $queryRawUnsafe: async (sql: string) => sql.includes('"UsageEvent"')
      ? [{ day: A.dayRange(1)[0], calls: BigInt(4), cost: 0.5, tokens: BigInt(15), errors: BigInt(1) }]
      : [{ day: A.dayRange(1)[0], n: BigInt(2) }],
    $transaction: async (x: any[]) => Promise.all(x),
  };
});

const req = (uid: string, method = "GET", body?: unknown, url = "http://x/api/admin/stats?days=7") =>
  new Request(url, { method, headers: { authorization: `Bearer ${issueToken(uid, 3600)}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

test("isAdmin: role or ADMIN_EMAILS (case-insensitive)", () => {
  assert.ok(A.isAdmin({ email: "owner@rma.in" }));
  assert.ok(A.isAdmin({ email: "x@y.com", role: "admin" }));
  assert.ok(!A.isAdmin({ email: "client@x.com", role: "user" }));
  assert.ok(!A.isAdmin(null));
});

test("dayRange: IST calendar days, oldest first", () => {
  const r = A.dayRange(3, new Date("2026-10-13T20:00:00Z")); // 14 Oct 01:30 IST
  assert.deepEqual(r, ["2026-10-12", "2026-10-13", "2026-10-14"]);
});

test("getStats merges usage, events (bigint) and signups", async () => {
  const s = await A.getStats(7);
  const today = s.daily.at(-1)!;
  assert.equal(s.daily.length, 7);
  assert.deepEqual([today.messages, today.activeUsers, today.aiCalls, today.errors, today.tokens, today.signups], [7, 2, 4, 1, 15, 2]);
  assert.equal(s.totals.revenuePaise, 49900);
  assert.equal(s.totals.plans.trial, 2);
  assert.equal(s.models[0].tokens, 15);
});

test("admin API: non-admin 403, admin 200", async () => {
  assert.equal((await statsRoute.GET(req(USER.uid))).status, 403);
  const ok = await statsRoute.GET(req(ADMIN.uid));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).days, 7);
});

test("extend trial / paid plan, with audit", async () => {
  const before = users[1].trialEnds.getTime();
  const r = await userRoute.PATCH(req(ADMIN.uid, "PATCH", { action: "extend", days: 10 }, "http://x/api/admin/users/b1"), { params: Promise.resolve({ id: "b1" }) });
  assert.equal(r.status, 200);
  assert.ok(Math.abs(users[1].trialEnds.getTime() - (before + 10 * 864e5)) < 1000);
  assert.equal(audits[0].action, "extend");
  assert.equal(audits[0].adminEmail, "owner@rma.in");
  users[1].paidUntil = new Date(Date.now() + 864e5);
  await A.updateUser({ id: "a1", email: "owner@rma.in" }, "b1", { action: "extend", days: 30 });
  assert.ok(users[1].paidUntil.getTime() > Date.now() + 30 * 864e5);
  assert.match(audits[1].details, /paidUntil/);
});

test("block / unblock, self-protection, validation", async () => {
  await A.updateUser({ id: "a1", email: "owner@rma.in" }, "b1", { action: "block", reason: "spam" });
  assert.equal(users[1].blocked, true);
  await assert.rejects(A.updateUser({ id: "a1", email: "owner@rma.in" }, "a1", { action: "block" }), /cannot block yourself/);
  await assert.rejects(A.updateUser({ id: "a1", email: "owner@rma.in" }, "zz", { action: "unblock" }), /not found/);
  assert.ok(!AdminActionSchema.safeParse({ action: "extend", days: 0 }).success);
  assert.ok(!AdminActionSchema.safeParse({ action: "role", role: "root" }).success);
  assert.ok(!AdminActionSchema.safeParse({ action: "delete" }).success);
  const bad = await userRoute.PATCH(req(ADMIN.uid, "PATCH", { action: "extend", days: 99999 }, "http://x/api/admin/users/b1"), { params: Promise.resolve({ id: "b1" }) });
  assert.equal(bad.status, 400);
});

test("blocked users are refused by /api/me and /api/chat", async () => {
  users[1].blocked = true;
  const me = await meRoute.GET(req(USER.uid, "GET", undefined, "http://x/api/me"));
  assert.equal(me.status, 403);
  assert.equal((await me.json()).code, "BLOCKED");
  const chat = await chatRoute.POST(req(USER.uid, "POST", { messages: [{ role: "user", content: "hi" }] }, "http://x/api/chat"));
  assert.equal(chat.status, 403);
  const meAdmin = await meRoute.GET(req(ADMIN.uid, "GET", undefined, "http://x/api/me"));
  assert.equal((await meAdmin.json()).isAdmin, true);
});
