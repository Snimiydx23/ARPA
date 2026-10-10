// POST /api/auth/login { email, name? } → { ok, token, user }
// V3 dev auth: replaces V2's Firebase Google login.
// Accepts any email; creates/looks-up user + trial; returns HMAC bearer token.
import { db } from "@/lib/db";
import { CFG, uidFromEmail, issueToken, getOrCreateUser, status, json } from "@/lib/arpa";

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email." }, 400);
  }
  const name = String(body.name || email.split("@")[0]).trim().slice(0, 60);
  const uid = uidFromEmail(email);
  try {
    const u = await getOrCreateUser({ uid, email, name, picture: body.picture || "" });
    const st = status(u);
    const token = issueToken(uid);
    return json({
      ok: true,
      token,
      user: { name: u.name, email: u.email, picture: u.picture },
      sub: st,
    });
  } catch (e: any) {
    return json({ ok: false, error: "Server error: " + (e?.message || "") }, 500);
  }
}
