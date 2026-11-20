// POST /api/auth/firebase { idToken } → { ok, token, user, sub }
// Google sign-in through Firebase Authentication (no Google Cloud Console setup needed).
// The browser signs in with Firebase (Google popup) and sends the Firebase ID token here.
// We verify it with Firebase (Identity Toolkit accounts:lookup) + check project / expiry,
// then reuse the same user/token flow as the other logins (same uid per email → users keep their chats).
// Env: FIREBASE_API_KEY, FIREBASE_PROJECT_ID (+ FIREBASE_AUTH_DOMAIN, FIREBASE_APP_ID for the browser)
import { uidFromEmail, issueToken, getOrCreateUser, subStatus, json, blockedResponse } from "@/lib/arpa";
import { parseBody, FirebaseLoginSchema } from "@/lib/validate";
import { enforceRate, clientIp } from "@/lib/rate-limit";
import { isAdmin } from "@/services/admin";
import { logger } from "@/lib/log";

function decodePayload(jwt: string): any {
  try { return JSON.parse(Buffer.from(jwt.split(".")[1] || "", "base64url").toString("utf8")); } catch { return null; }
}

export async function POST(req: Request) {
  const apiKey = (process.env.FIREBASE_API_KEY || "").trim();
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  if (!apiKey || !projectId) return json({ ok: false, error: "Firebase sign-in is not configured." }, 503);

  const log = logger("auth.firebase", req);
  const limited = await enforceRate("auth", clientIp(req));
  if (limited) return limited;
  const { data, error } = await parseBody(req, FirebaseLoginSchema);
  if (error) return error;
  const idToken = data.idToken;

  // 1) token must be for OUR Firebase project and not expired
  const p = decodePayload(idToken);
  const now = Math.floor(Date.now() / 1000);
  if (!p || p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}` || !(p.exp > now)) {
    return json({ ok: false, error: "Could not verify your Google account." }, 401);
  }

  // 2) Firebase checks the signature and returns the verified account
  let acc: any = null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    });
    if (r.ok) acc = (await r.json())?.users?.[0] || null;
  } catch {}
  if (!acc?.email || acc.emailVerified !== true || (acc.localId && p.user_id && acc.localId !== p.user_id)) {
    return json({ ok: false, error: "Could not verify your Google account." }, 401);
  }

  const email = String(acc.email).trim().toLowerCase();
  const name = String(acc.displayName || p.name || email.split("@")[0]).trim().slice(0, 60);
  const picture = String(acc.photoUrl || p.picture || "");
  const uid = uidFromEmail(email);

  try {
    const u = await getOrCreateUser({ uid, email, name, picture });
    if ((u as any).blocked) return blockedResponse();
    log.info("login.ok", { uid, method: "firebase" });
    return json({
      ok: true,
      token: issueToken(uid),
      user: { name, email: u.email, picture, ...(isAdmin(u) ? { isAdmin: true } : {}) },
      sub: await subStatus(u),
    });
  } catch (e) {
    log.error("login.fail", e);
    return json({ ok: false, error: "Could not sign you in right now. Please try again." }, 500);
  }
}
