// GET /api/canvas/:id/versions/:vid — one snapshot's content (to preview / restore)
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { getVersion } from "@/services/canvas";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; vid: string }> }) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { id, vid } = await ctx.params;
  const v = await getVersion(g.user.id, id, vid);
  return v ? json({ ok: true, version: v }) : json({ ok: false, error: "Version not found" }, 404);
}
