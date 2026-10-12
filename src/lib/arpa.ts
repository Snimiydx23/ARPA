// ARPA V3 — shared server-side helpers
// Upgraded from V2 api/_lib.js (Firebase + Razorpay + NVIDIA) to Prisma + NVIDIA NIM (src/lib/llm.ts)
import crypto from "node:crypto";
import { db } from "@/lib/db";

/* ---------------- settings (env, with sensible defaults) ---------------- */
export const CFG = {
  appName: process.env.APP_NAME || "ARPA",
  trialDays: Number(process.env.TRIAL_DAYS || 90),
  limitTrial: Number(process.env.DAILY_LIMIT_TRIAL || 50),
  limitPaid: Number(process.env.DAILY_LIMIT_PAID || 300),
  maxTokens: Number(process.env.MAX_TOKENS || 4096),
  maxCtx: Number(process.env.MAX_CTX_CHARS || 60000),
  admins: (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean),
};

// MODELS — NVIDIA NIM model ids, shown with friendly labels.
// Format: "nvidiaModelId|Label,..."  (first = default). Override via MODELS env.
export function models() {
  const raw = process.env.MODELS ||
    "nvidia/nemotron-3-ultra-550b-a55b|ARPA Pro";
  return raw.split(",").map(s => s.trim()).filter(Boolean).map(s => {
    const [id, label] = s.split("|");
    return { id: id.trim(), label: (label || id).trim() };
  });
}

// PLANS — "id|Label|priceINR|days,..."  (same format as V2)
export function plans() {
  const raw = process.env.PLANS || "monthly|Monthly|299|30,yearly|Yearly|2999|365";
  return raw.split(",").map(s => s.trim()).filter(Boolean).map(s => {
    const [id, label, price, days] = s.split("|");
    return { id: id.trim(), label: (label || id).trim(), price: Number(price), days: Number(days) };
  }).filter(p => p.id && p.price > 0 && p.days > 0);
}

export const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// IST "today" as YYYY-MM-DD (matches V2 behaviour)
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/* ---------------- dev auth (HMAC token, replaces Firebase) ---------------- */
const SECRET = process.env.ARPA_AUTH_SECRET || "arpa-dev-secret-change-me";

// Build a uid from email (stable, like V2's md5 approach)
export function uidFromEmail(email: string) {
  return "u_" + crypto.createHash("md5").update(email.toLowerCase()).digest("hex").slice(0, 16);
}

// Issue a bearer token: base64(uid|hmac(uid))
export function issueToken(uid: string) {
  const sig = crypto.createHmac("sha256", SECRET).update(uid).digest("hex");
  return Buffer.from(uid + ":" + sig).toString("base64");
}

// Verify a bearer token → uid, or null
export function verifyToken(token: string): string | null {
  try {
    const dec = Buffer.from(token, "base64").toString("utf8");
    const [uid, sig] = dec.split(":");
    if (!uid || !sig) return null;
    const expected = crypto.createHmac("sha256", SECRET).update(uid).digest("hex");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return uid;
  } catch {
    return null;
  }
}

// Read bearer from Authorization header
export function bearerUid(req: Request): string | null {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) return null;
  return verifyToken(t);
}

/* ---------------- user record + subscription status ---------------- */
// V2: getOrCreateUser — ek email = ek trial
export async function getOrCreateUser(u: { uid: string; email: string; name: string; picture?: string }) {
  const now = Date.now();
  const trialEnds = new Date(now + CFG.trialDays * 86400000);

  // Look for existing user by uid
  const existing = await db.user.findUnique({ where: { uid: u.uid } });
  if (existing) {
    // refresh name/picture/lastSeen if changed
    if (existing.name !== u.name || existing.picture !== (u.picture || "")) {
      await db.user.update({
        where: { id: existing.id },
        data: { name: u.name, picture: u.picture || "", lastSeen: new Date() },
      });
    } else {
      await db.user.update({ where: { id: existing.id }, data: { lastSeen: new Date() } }).catch(() => {});
    }
    return existing;
  }

  // New user — check if email already used a trial (ek Gmail = ek trial)
  const usedTrial = await db.trial.findUnique({ where: { email: u.email.toLowerCase() } });
  const finalTrialEnds = usedTrial ? new Date(now) : trialEnds; // no trial if email seen before

  // create user + (if new email) record the trial
  const user = await db.user.create({
    data: {
      uid: u.uid,
      email: u.email,
      name: u.name,
      picture: u.picture || "",
      trialEnds: finalTrialEnds,
      paidUntil: null,
      plan: "trial",
    },
  });
  if (!usedTrial) {
    await db.trial.create({ data: { email: u.email.toLowerCase(), uid: u.uid } });
  }
  return user;
}

export type SubStatus = {
  state: "paid" | "trial" | "expired";
  until: number; // epoch ms
  daysLeft: number;
  plan: string;
  limit: number;
};

export function status(d: { paidUntil: Date | null; trialEnds: Date; plan: string }): SubStatus {
  const now = Date.now();
  const paidUntilMs = d.paidUntil ? d.paidUntil.getTime() : 0;
  const trialEndsMs = d.trialEnds.getTime();
  const paid = paidUntilMs > now;
  const trial = trialEndsMs > now;
  const state = paid ? "paid" : trial ? "trial" : "expired";
  const until = paid ? paidUntilMs : trial ? trialEndsMs : Math.max(paidUntilMs, trialEndsMs);
  return {
    state,
    until,
    daysLeft: state === "expired" ? 0 : Math.ceil((until - now) / 86400000),
    plan: paid ? (d.plan || "paid") : state,
    limit: paid ? CFG.limitPaid : CFG.limitTrial,
  };
}

// Daily message counter — V2 useQuota (idempotent per day)
export async function takeQuota(userId: string, limit: number): Promise<{ ok: boolean; used: number }> {
  const day = today();
  // upsert count
  const row = await db.usage.upsert({
    where: { userId_day: { userId, day } },
    update: { count: { increment: 1 } },
    create: { userId, day, count: 1 },
  });
  // Note: upsert increments then returns; if row.count > limit, this message exceeded.
  // We accept the slight over-count (same as V2's transaction approach is racy too).
  if (row.count > limit + 1) {
    // over limit — revert the increment we just did (best-effort)
    await db.usage.update({
      where: { id: row.id },
      data: { count: { decrement: 1 } },
    }).catch(() => {});
    return { ok: false, used: limit };
  }
  return { ok: row.count <= limit, used: Math.min(row.count, limit) };
}

export async function usageToday(userId: string): Promise<number> {
  const day = today();
  const row = await db.usage.findUnique({ where: { userId_day: { userId, day } } });
  return row?.count || 0;
}

// Apply a payment — idempotent (one paymentId counted once). V2 applyPayment.
export async function applyPayment(
  userId: string,
  plan: { id: string; days: number },
  paymentId: string,
  orderId: string | null,
  amount: number
) {
  const now = Date.now();
  // idempotency: if payment already recorded, just return current user
  const existingPay = await db.payment.findUnique({ where: { id: paymentId } });
  if (existingPay) {
    return await db.user.findUnique({ where: { id: userId } });
  }
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return null;

  const base = Math.max(
    now,
    u.paidUntil ? u.paidUntil.getTime() : 0,
    u.trialEnds.getTime()
  );
  const newPaidUntil = new Date(base + plan.days * 86400000);

  const [updated] = await Promise.all([
    db.user.update({
      where: { id: userId },
      data: { paidUntil: newPaidUntil, plan: plan.id, lastPaymentAt: new Date() },
    }),
    db.payment.create({
      data: { id: paymentId, userId, email: u.email, plan: plan.id, amount, orderId },
    }),
  ]);
  return updated;
}

/* ---------------- system prompt (V2, kept verbatim flavour) ---------------- */
export function systemPrompt(name: string) {
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
  const custom = process.env.SYSTEM_PROMPT ? "\n\nEXTRA INSTRUCTIONS:\n" + process.env.SYSTEM_PROMPT : "";
  return `You are ${CFG.appName}, a helpful, accurate and professional AI assistant.
Current date/time (India): ${now}. User's name: ${name}.

LANGUAGE: Reply in the same language the user writes in. If they write in Hindi (Devanagari), reply in Hindi. If they write in English, reply in English. If they write in Hinglish (Hindi in Roman script mixed with English), reply in Hinglish.

QUALITY:
- Give correct, complete, practical answers. Think step by step for calculations and show the working.
- If you are not sure, say so clearly. Never invent facts, numbers, laws, sections, rates or citations.
- You have NO live internet access. For things that change (live prices, today's news, current interest/tax rates, latest notifications), give your last known information, clearly say it may be outdated, and suggest checking the official source.
- Refuse clearly harmful or illegal requests politely.

FORMAT (Markdown):
- Start with a direct 1–2 line answer, then details.
- Use ### headings for sections, bullet points, and **bold** for key terms/numbers.
- Use markdown tables for comparisons or multi-row data.
- Code always in fenced code blocks with language name.
- Keep paragraphs short. No unnecessary filler or repeated disclaimers.
- For very large topics, give a structured overview first and ask which part to expand.${custom}`;
}
