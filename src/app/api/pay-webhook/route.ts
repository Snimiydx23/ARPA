// POST /api/pay-webhook — Razorpay webhook (backup path if the browser closes after paying).
// Configure in Razorpay Dashboard → Webhooks → URL https://<your-domain>/api/pay-webhook,
// events: payment.captured, secret = RAZORPAY_WEBHOOK_SECRET.
import { db } from "@/lib/db";
import { plans, applyPayment, json } from "@/lib/arpa";
import { verifyWebhookSignature, fetchOrder } from "@/lib/razorpay";
import { logger } from "@/lib/log";

export async function POST(req: Request) {
  const log = logger("pay.webhook", req);
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") || "")) {
    log.warn("signature.invalid");
    return json({ ok: false }, 400);
  }
  try {
    const evt = JSON.parse(raw);
    if (evt?.event !== "payment.captured") return json({ ok: true, ignored: true });
    const pay = evt.payload?.payment?.entity;
    if (!pay?.id || !pay?.order_id) return json({ ok: true, ignored: true });
    const order = await fetchOrder(pay.order_id);
    const plan = plans().find((p) => p.id === order.notes?.plan);
    const user = order.notes?.uid ? await db.user.findUnique({ where: { uid: order.notes.uid } }) : null;
    if (!plan || !user || pay.amount !== Math.round(plan.price * 100)) {
      log.warn("webhook.mismatch", { order: pay.order_id });
      return json({ ok: true, ignored: true });
    }
    await applyPayment(user.id, plan, pay.id, pay.order_id, pay.amount); // idempotent on payment id
    log.info("plan.applied", { uid: user.uid, plan: plan.id, pid: pay.id });
    return json({ ok: true });
  } catch (e) {
    log.error("webhook.fail", e);
    return json({ ok: false }, 500); // Razorpay retries
  }
}
