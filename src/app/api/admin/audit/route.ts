// GET /api/admin/audit — latest admin actions
import { json } from "@/lib/arpa";
import { adminGuard } from "@/lib/admin-guard";
import { auditLog } from "@/services/admin";

export async function GET(req: Request) {
  const g = await adminGuard(req);
  if (g.error) return g.error;
  return json({ ok: true, audit: await auditLog(50) });
}
