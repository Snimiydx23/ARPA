// POST /api/pay-verify — verify a payment server-side and activate the plan (idempotent).
// live: checkout signature + re-fetch payment & order from Razorpay; amount/uid/plan must match.
// simulated: only when ALLOW_SIMULATED_PAYMENTS=true.
import { db } from "@/lib/db";
import { bearerUid, plans, applyPayment, status, json } from "@/lib/arpa";
import { parseBody, PayVerifySchema } from "@/lib/validate";
import { enforceRate } from "@/lib/rate-limit";
import { payMode, verifyCheckoutSignature, fetchOrder, fetchPayment } from "@/lib/razorpay";
import { logger } from "@/lib/log";

export async function POST(req: Request) {
  const log = logger("pay.verify", req);
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const limited = await enforceRate("payment", uid);
  if (limited) return limited;
  const u = await db.user.findUnique({ where: { uid } });
  if (!u) return json({ error: "User not found" }, 401);

  const { data, error } = await parseBody(req, PayVerifySchema);
  if (error) return error;
  const plan = plans().find((p) => p.id === data.plan);
  if (!plan) return json({ error: "Plan not found" }, 400);
  const amount = Math.round(plan.price * 100);
  const mode = payMode();

  try {
    if (mode === "disabled") return json({ error: "Online payments are not enabled yet." }, 503);

    if (mode === "live") {
      const oid = data.razorpay_order_id || "";
      const pid = data.razorpay_payment_id;
      if (!oid || !data.razorpay_signature || !verifyCheckoutSignature(oid, pid, data.razorpay_signature)) {
        log.warn("signature.invalid", { uid, oid, pid });
        return json({ error: "Payment could not be verified." }, 400);
      }
      const [order, pay] = await Promise.all([fetchOrder(oid), fetchPayment(pid)]);
      const ok =
        pay.order_id === oid &&
        ["captured", "authorized"].includes(pay.status) &&
        pay.amount === amount && order.amount === amount &&
        order.notes?.uid === uid && order.notes?.plan === plan.id;
      if (!ok) {
        log.warn("payment.mismatch", { uid, oid, pid, status: pay.status, amount: pay.amount });
        return json({ error: "Payment details did not match. If money was deducted, contact support." }, 400);
      }
      const d = await applyPayment(u.id, plan, pid, oid, amount);
      if (!d) return json({ error: "Could not apply plan" }, 500);
      log.info("plan.applied", { uid, plan: plan.id, pid });
      return json({ ok: true, sub: status(d) });
    }

    // simulated (demo only)
    const d = await applyPayment(u.id, plan, data.razorpay_payment_id, data.razorpay_order_id || null, amount);
    if (!d) return json({ error: "Could not apply plan" }, 500);
    return json({ ok: true, sub: status(d) });
  } catch (e) {
    log.error("verify.fail", e, { uid });
    return json({ error: "Payment verification failed. If money was deducted, it will be applied automatically or refunded." }, 502);
  }
}
