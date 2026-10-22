// ARPA — admin route guard: normal auth + rate limit, then admin check (role or ADMIN_EMAILS).
import { db } from "@/lib/db";
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { isAdmin } from "@/services/admin";

export async function adminGuard(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return { error: g.error };
  const u = await db.user.findUnique({ where: { id: g.user.id }, select: { role: true, email: true } });
  if (!isAdmin(u)) return { error: json({ ok: false, error: "Admins only", code: "FORBIDDEN" }, 403) };
  return { admin: { id: g.user.id, email: g.user.email } };
}
