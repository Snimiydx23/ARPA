// PATCH  /api/memory/[id] — edit { content }
// DELETE /api/memory/[id] — delete one memory
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, MemoryUpdateSchema } from "@/lib/validate";
import { updateMemory, deleteMemory, MemoryError } from "@/services/memory";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, MemoryUpdateSchema);
  if (error) return error;
  try {
    const ok = await updateMemory(g.user.id, (await params).id, data.content);
    return ok ? json({ ok: true }) : json({ ok: false, error: "Memory not found" }, 404);
  } catch (e) {
    if (e instanceof MemoryError) return json({ ok: false, error: e.message }, 400);
    return json({ ok: false, error: "Could not update the memory." }, 500);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const ok = await deleteMemory(g.user.id, (await params).id);
  return ok ? json({ ok: true }) : json({ ok: false, error: "Memory not found" }, 404);
}
