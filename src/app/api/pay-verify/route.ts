// POST /api/pay-verify — verify a (simulated) payment and activate the plan
// V3: with no Razorpay keys, we trust the client-supplied payment_id for the
// simulated order and just apply the plan (idempotent). Same shape as V2.
import { db } from "@/lib/db";
import { bearerUid, plans, applyPayment, status, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid } });
  if (!u) return json({ error: "User not found" }, 401);

  let b: any = {};
  try { b = await req.json(); } catch {}
  const { razorpay_order_id: oid, razorpay_payment_id: pid, plan: planId } = b;
  if (!pid || !planId) return json({ error: "Payment details are incomplete" }, 400);
  // V3: lookup plan from the request (client knows it from the order step)
  const plan = plans().find(p => p.id === planId);
  if (!plan) return json({ error: "Plan not found" }, 400);

  try {
    const d = await applyPayment(u.id, plan, pid, oid || null, Math.round(plan.price * 100));
    if (!d) return json({ error: "Could not apply plan" }, 500);
    return json({ ok: true, sub: status(d) });
  } catch (e: any) {
    return json({ error: e.message }, 502);
  }
}
