// POST /api/pay-order — create a (simulated) order for a plan
// V3: in the sandbox there are no Razorpay keys, so we simulate the order and
// let the client "pay" via the verify step. Same request/response shape as V2
// so the client can later swap in real Razorpay with no changes.
import { db } from "@/lib/db";
import { bearerUid, plans, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid } });
  if (!u) return json({ error: "User not found" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const plan = plans().find(p => p.id === body.plan);
  if (!plan) return json({ error: "Invalid plan" }, 400);

  // simulated order id + key
  const orderId = "arpa_sim_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  return json({
    ok: true,
    orderId,
    amount: Math.round(plan.price * 100),
    currency: "INR",
    key: "rzp_simulated",
    simulated: true,
    plan,
    user: { name: u.name, email: u.email },
  });
}
