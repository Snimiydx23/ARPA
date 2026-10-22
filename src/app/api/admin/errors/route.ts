// GET /api/admin/errors — latest failed AI / tool calls
import { json } from "@/lib/arpa";
import { adminGuard } from "@/lib/admin-guard";
import { recentErrors } from "@/services/admin";

export async function GET(req: Request) {
  const g = await adminGuard(req);
  if (g.error) return g.error;
  return json({ ok: true, errors: await recentErrors(50) });
}
