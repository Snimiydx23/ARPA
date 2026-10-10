// GET /api/me — current user + plan status (V3: replaces V2 api/me.js)
import { db } from "@/lib/db";
import { bearerUid, status, usageToday, json } from "@/lib/arpa";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ ok: false, error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid } });
  if (!u) return json({ ok: false, error: "User not found" }, 404);
  const st = status(u);
  return json({
    ok: true,
    user: { name: u.name, email: u.email, picture: u.picture },
    sub: st,
    usedToday: await usageToday(u.id),
  });
}
