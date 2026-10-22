// GET /api/config — public settings (V3: replaces V2 api/config.js)
import { CFG, plans, json } from "@/lib/arpa";
import { payMode } from "@/lib/razorpay";
import { publicModelList } from "@/services/ai/registry";

export async function GET() {
  return json({
    app: CFG.appName,
    trialDays: CFG.trialDays,
    limitPaid: CFG.limitPaid,
    limitTrial: CFG.limitTrial,
    plans: plans(),
    models: publicModelList(),
    support: process.env.SUPPORT_EMAIL || "support@arpa.ai",
    // V3: dev email auth (no Firebase). Always "dev" mode for the public site.
    dev: true,
    paymentMode: payMode(), // live | simulated | disabled
    // Google Sign-In (set GOOGLE_CLIENT_ID in env). When enabled, passwordless email
    // login is turned off unless ALLOW_EMAIL_LOGIN=true.
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    emailLogin: !process.env.GOOGLE_CLIENT_ID || process.env.ALLOW_EMAIL_LOGIN === "true",
  });
}
