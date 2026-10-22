// POST /api/pay-order { plan } — create a payment order for a plan.
// live      → real Razorpay order (amount + uid + plan stored in order notes, server-side)
// simulated → demo order, only when ALLOW_SIMULATED_PAYMENTS=true
// disabled  → 503 (no keys configured) — prevents free plan activation
import { db } from "@/lib/db";
import { bearerUid, plans, json } from "@/lib/arpa";
import { parseBody, PlanSchema } from "@/lib/validate";
import { enforceRate } from "@/lib/rate-limit";
import { payMode, createOrder } from "@/lib/razorpay";
import { logger } from "@/lib/log";

export async function POST(req: Request) {
  const log = logger("pay.order", req);
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const limited = await enforceRate("payment", uid);
  if (limited) return limited;
  const u = await db.user.findUnique({ where: { uid } });
  if (!u) return json({ error: "User not found" }, 401);

  const { data, error } = await parseBody(req, PlanSchema);
  if (error) return error;
  const plan = plans().find((p) => p.id === data.plan);
  if (!plan) return json({ error: "Invalid plan" }, 400);
  const amount = Math.round(plan.price * 100);

  const mode = payMode();
  if (mode === "disabled") return json({ error: "Online payments are not enabled yet. Please contact support." }, 503);

  if (mode === "simulated") {
    return json({
      ok: true, simulated: true, orderId: "arpa_sim_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      amount, currency: "INR", key: "rzp_simulated", plan, user: { name: u.name, email: u.email },
    });
  }

  try {
    const order = await createOrder(amount, { uid, plan: plan.id });
    log.info("order.created", { uid, plan: plan.id, order: order.id });
    return json({
      ok: true, simulated: false, orderId: order.id, amount: order.amount, currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID, plan, user: { name: u.name, email: u.email },
    });
  } catch (e) {
    log.error("order.fail", e, { uid });
    return json({ error: "Could not start the payment. Please try again." }, 502);
  }
}
