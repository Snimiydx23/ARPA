// POST /api/auth/google { credential } → { ok, token, user, sub }
// Verifies a Google Identity Services ID token, then reuses the same
// user/trial/token flow as /api/auth/login (same uid per email → existing users keep their chats).
import { uidFromEmail, issueToken, getOrCreateUser, status, json, blockedResponse } from "@/lib/arpa";
import { parseBody, GoogleLoginSchema } from "@/lib/validate";
import { enforceRate, clientIp } from "@/lib/rate-limit";
import { isAdmin } from "@/services/admin";
import { logger } from "@/lib/log";

const GOOGLE_ISS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export async function POST(req: Request) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) return json({ ok: false, error: "Google sign-in is not configured." }, 503);

  const log = logger("auth.google", req);
  const limited = await enforceRate("auth", clientIp(req));
  if (limited) return limited;
  const { data, error } = await parseBody(req, GoogleLoginSchema);
  if (error) return error;
  const credential = data.credential;

  // Verify the ID token with Google (signature, expiry and audience are checked by Google)
  let info: any = null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), { cache: "no-store" });
    if (r.ok) info = await r.json();
  } catch {}
  if (!info) return json({ ok: false, error: "Google sign-in failed. Please try again." }, 401);

  const emailVerified = info.email_verified === true || info.email_verified === "true";
  if (info.aud !== clientId || !GOOGLE_ISS.has(info.iss) || !emailVerified || !info.email) {
    return json({ ok: false, error: "Could not verify your Google account." }, 401);
  }

  const email = String(info.email).trim().toLowerCase();
  const name = String(info.name || info.given_name || email.split("@")[0]).trim().slice(0, 60);
  const picture = String(info.picture || "");
  const uid = uidFromEmail(email);

  try {
    const u = await getOrCreateUser({ uid, email, name, picture });
    if ((u as any).blocked) return blockedResponse();
    return json({
      ok: true,
      token: issueToken(uid),
      user: { name, email: u.email, picture, ...(isAdmin(u) ? { isAdmin: true } : {}) },
      sub: status(u),
    });
  } catch (e) {
    log.error("login.fail", e);
    return json({ ok: false, error: "Could not sign you in right now. Please try again." }, 500);
  }
}
