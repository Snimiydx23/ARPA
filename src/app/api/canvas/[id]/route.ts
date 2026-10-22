// GET /api/canvas/:id — content + version list · PATCH {title?, content?, language?, version?} · DELETE
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, CanvasUpdateSchema } from "@/lib/validate";
import { getCanvas, updateCanvas, deleteCanvas } from "@/services/canvas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const c = await getCanvas(g.user.id, (await ctx.params).id);
  return c ? json({ ok: true, canvas: c }) : json({ ok: false, error: "Canvas not found" }, 404);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, CanvasUpdateSchema);
  if (error) return error;
  const c = await updateCanvas(g.user.id, (await ctx.params).id, data);
  return c ? json({ ok: true, canvas: c }) : json({ ok: false, error: "Canvas not found" }, 404);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const ok = await deleteCanvas(g.user.id, (await ctx.params).id);
  return ok ? json({ ok: true }) : json({ ok: false, error: "Canvas not found" }, 404);
}
