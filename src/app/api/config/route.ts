// GET /api/config — public settings (V3: replaces V2 api/config.js)
import { CFG, plans, models, json } from "@/lib/arpa";

export async function GET() {
  return json({
    app: CFG.appName,
    trialDays: CFG.trialDays,
    limitPaid: CFG.limitPaid,
    limitTrial: CFG.limitTrial,
    plans: plans(),
    models: models(),
    support: process.env.SUPPORT_EMAIL || "support@arpa.ai",
    // V3: dev email auth (no Firebase). Always "dev" mode for the public site.
    dev: true,
    paymentMode: process.env.RAZORPAY_KEY_ID ? "live" : "simulated",
  });
}
