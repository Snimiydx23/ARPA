// GET /api/admin/stats?days=7|30|90 — platform KPIs, daily series, model & kind breakdown
import { json } from "@/lib/arpa";
import { adminGuard } from "@/lib/admin-guard";
import { getStats } from "@/services/admin";

export async function GET(req: Request) {
  const g = await adminGuard(req);
  if (g.error) return g.error;
  const d = Number(new URL(req.url).searchParams.get("days") || 30);
  const days = [7, 30, 90].includes(d) ? d : 30;
  return json({ ok: true, ...(await getStats(days)) });
}
