// POST /api/auth/login { email, name? } → { ok, token, user, sub }
// Passwordless email login — DEMO / fallback only.
// Once GOOGLE_CLIENT_ID is configured this route is disabled (unless ALLOW_EMAIL_LOGIN=true),
// because without email verification anyone could sign in as any address.
import { uidFromEmail, issueToken, getOrCreateUser, status, json, blockedResponse } from "@/lib/arpa";
import { parseBody, EmailLoginSchema } from "@/lib/validate";
import { enforceRate, clientIp } from "@/lib/rate-limit";
import { isAdmin } from "@/services/admin";
import { logger } from "@/lib/log";

export async function POST(req: Request) {
  const log = logger("auth.login", req);
  if (process.env.GOOGLE_CLIENT_ID && process.env.ALLOW_EMAIL_LOGIN !== "true") {
    return json({ ok: false, error: "Please sign in with Google." }, 403);
  }
  const limited = await enforceRate("auth", clientIp(req));
  if (limited) return limited;

  const { data, error } = await parseBody(req, EmailLoginSchema);
  if (error) return error;
  const email = data.email;
  const name = (data.name || email.split("@")[0]).slice(0, 60);
  const uid = uidFromEmail(email);
  try {
    const u = await getOrCreateUser({ uid, email, name, picture: "" });
    if ((u as any).blocked) return blockedResponse();
    log.info("login.ok", { uid, method: "email" });
    return json({
      ok: true,
      token: issueToken(uid),
      user: { name: u.name, email: u.email, picture: u.picture, ...(isAdmin(u) ? { isAdmin: true } : {}) },
      sub: status(u),
    });
  } catch (e) {
    log.error("login.fail", e);
    return json({ ok: false, error: "Could not sign you in right now. Please try again." }, 500);
  }
}
