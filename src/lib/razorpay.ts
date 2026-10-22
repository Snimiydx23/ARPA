// ARPA — Razorpay server helpers. Payment status is NEVER trusted from the browser:
//   order is created server-side (amount + uid + plan in notes) → checkout → signature verified with
//   the key secret → payment & order re-fetched from Razorpay and cross-checked → plan applied (idempotent).
// Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (for /api/pay-webhook)
//      ALLOW_SIMULATED_PAYMENTS=true → demo mode without keys (NEVER enable in production)
import crypto from "node:crypto";

export type PayMode = "live" | "simulated" | "disabled";

export function payMode(): PayMode {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return "live";
  if (process.env.ALLOW_SIMULATED_PAYMENTS === "true") return "simulated";
  return "disabled";
}

function auth() {
  return "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
}

async function rz<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: auth(), "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(j?.error?.description || `Razorpay error ${r.status}`);
  return j as T;
}

export type RzOrder = { id: string; amount: number; currency: string; status: string; notes?: Record<string, string> };
export type RzPayment = { id: string; order_id: string; amount: number; status: string; currency: string };

export function createOrder(amountPaise: number, notes: Record<string, string>) {
  return rz<RzOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: `arpa_${Date.now()}`, notes }),
  });
}
export const fetchOrder = (id: string) => rz<RzOrder>(`/orders/${encodeURIComponent(id)}`);
export const fetchPayment = (id: string) => rz<RzPayment>(`/payments/${encodeURIComponent(id)}`);

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a || ""), y = Buffer.from(b || "");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout signature: HMAC_SHA256(order_id|payment_id, key_secret) */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const exp = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(exp, signature);
}

/** Webhook signature: HMAC_SHA256(raw_body, webhook_secret) */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const s = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!s) return false;
  const exp = crypto.createHmac("sha256", s).update(rawBody).digest("hex");
  return safeEqualHex(exp, signature);
}
