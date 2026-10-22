// GET /api/admin/users?q=&filter=all|paid|trial|expired|blocked|admin&page= — user list with 30-day usage
import { json } from "@/lib/arpa";
import { adminGuard } from "@/lib/admin-guard";
import { listUsers, type UserFilter } from "@/services/admin";

const FILTERS: UserFilter[] = ["all", "paid", "trial", "expired", "blocked", "admin"];

export async function GET(req: Request) {
  const g = await adminGuard(req);
  if (g.error) return g.error;
  const sp = new URL(req.url).searchParams;
  const f = sp.get("filter") as UserFilter;
  return json({ ok: true, ...(await listUsers({ q: sp.get("q") || "", filter: FILTERS.includes(f) ? f : "all", page: Number(sp.get("page") || 1) })) });
}
