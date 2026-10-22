"use client";
// ARPA — Plans / pricing modal.
// live mode: server creates a Razorpay order → Razorpay Checkout → server verifies the signature.
// simulated mode (ALLOW_SIMULATED_PAYMENTS=true, demo only): skips checkout.
import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, fmtDate, rupee, type Plan, type SubStatus } from "@/lib/arpa-client";

declare global { interface Window { Razorpay?: any } }

let rzpLoader: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (!rzpLoader) {
    rzpLoader = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => res();
      s.onerror = () => { rzpLoader = null; rej(new Error("Could not load the payment window. Check your connection.")); };
      document.head.appendChild(s);
    });
  }
  return rzpLoader;
}

type OrderResp = { ok: boolean; orderId: string; amount: number; currency?: string; key?: string; simulated?: boolean; plan: Plan; user?: { name: string; email: string }; error?: string };
type PayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

/** Open Razorpay Checkout and resolve with the payment ids + signature (or reject if closed). */
function openCheckout(o: OrderResp): Promise<PayResult> {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: o.key,
      order_id: o.orderId,
      amount: o.amount,
      currency: o.currency || "INR",
      name: "ARPA",
      description: `${o.plan.label} plan`,
      prefill: { name: o.user?.name, email: o.user?.email },
      theme: { color: "#6d28d9" },
      handler: (r: PayResult) => resolve(r),
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.on("payment.failed", (r: any) => reject(new Error(r?.error?.description || "Payment failed")));
    rzp.open();
  });
}

export function PlansModal({
  open,
  onOpenChange,
  sub,
  plans,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sub: SubStatus;
  plans: Plan[];
  onPaid: (s: SubStatus) => void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const monthly = plans.find((p) => p.days <= 31);

  const statusText =
    sub.state === "paid"
      ? `Your plan is active until ${fmtDate(sub.until)}. Any new plan you buy will add days on top of this one.`
      : sub.state === "trial"
      ? `Free trial: ${sub.daysLeft} days left (until ${fmtDate(sub.until)}). If you buy now, your plan starts after the trial ends.`
      : "Your free trial has ended.";

  const buy = async (plan: Plan) => {
    setBusyId(plan.id);
    try {
      const order = await api<OrderResp>(
        "/api/pay-order",
        { method: "POST", body: JSON.stringify({ plan: plan.id }) }
      );
      if (order.status !== 200 || !order.data?.ok) {
        toast.error(order.data?.error || "Order could not be created");
        return;
      }
      let pay: PayResult;
      if (order.data.simulated) {
        pay = { razorpay_order_id: order.data.orderId, razorpay_payment_id: "pay_sim_" + Date.now(), razorpay_signature: "sim" };
      } else {
        await loadRazorpay();
        try { pay = await openCheckout(order.data); }
        catch (e: any) { if (e?.message !== "Payment cancelled") toast.error(e?.message || "Payment failed"); return; }
      }
      const verify = await api<{ ok: boolean; sub: SubStatus; error?: string }>(
        "/api/pay-verify",
        { method: "POST", body: JSON.stringify({ ...pay, plan: plan.id }) }
      );
      if (verify.status !== 200 || !verify.data?.ok) {
        toast.error(verify.data?.error || "Payment verification failed");
        return;
      }
      onPaid(verify.data.sub);
      onOpenChange(false);
      toast.success(`Thank you! Plan active until ${fmtDate(verify.data.sub.until)} 🎉`);
    } catch (e: any) {
      toast.error(e?.message || "Payment error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-arpa" /> ARPA Pro
          </DialogTitle>
          <DialogDescription>
            Uninterrupted AI — more messages every day, the best model, and history across every device.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-foreground" dangerouslySetInnerHTML={{ __html: statusText.replace(/(\d+ days|until [^ ]+ \d{4}|has ended\.)/g, "<b>$1</b>") }} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans.map((p) => {
            const best = p.days >= 300;
            const saving = best && monthly ? Math.round(100 - (p.price / (monthly.price * 12)) * 100) : 0;
            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border p-4 ${best ? "border-arpa ring-1 ring-arpa" : "border-border"}`}
              >
                {best && saving > 0 && (
                  <Badge className="absolute -top-2.5 right-3 bg-arpa text-arpa-foreground">
                    {saving}% savings
                  </Badge>
                )}
                <h4 className="text-base font-semibold">{p.label}</h4>
                <p className="mt-1.5 text-3xl font-bold">
                  {rupee(p.price)} <span className="text-sm font-normal text-muted-foreground">/ {p.days >= 300 ? "year" : `${p.days} days`}</span>
                </p>
                <ul className="mt-3 mb-3.5 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> {sub.limit}+ messages per day</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> All models</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Cloud chat history</li>
                  <li className="flex items-center gap-2"><Check className="size-3.5 text-green-500" /> Priority support</li>
                </ul>
                <Button
                  className={`w-full ${best ? "bg-arpa text-arpa-foreground hover:opacity-90" : ""}`}
                  variant={best ? "default" : "outline"}
                  disabled={busyId === p.id}
                  onClick={() => buy(p)}
                >
                  {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : null}
                  {rupee(p.price)} — pay now
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Secure payment via Razorpay — UPI, Card, NetBanking.
        </p>
      </DialogContent>
    </Dialog>
  );
}
