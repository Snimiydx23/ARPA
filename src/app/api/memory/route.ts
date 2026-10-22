// GET    /api/memory — { enabled, items }
// POST   /api/memory — add { content, source? } (always an explicit user action)
// PATCH  /api/memory — { enabled } turn memory on/off
// DELETE /api/memory — clear all memories
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, MemoryCreateSchema, MemorySettingsSchema } from "@/lib/validate";
import { listMemories, addMemory, clearMemories, setMemoryEnabled, MemoryError } from "@/services/memory";

export async function GET(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  return json({ ok: true, enabled: g.user.memoryEnabled, items: await listMemories(g.user.id) });
}

export async function POST(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, MemoryCreateSchema);
  if (error) return error;
  try {
    const r = await addMemory(g.user.id, data.content, data.source || "user");
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof MemoryError) return json({ ok: false, error: e.message }, 400);
    return json({ ok: false, error: "Could not save the memory." }, 500);
  }
}

export async function PATCH(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, MemorySettingsSchema);
  if (error) return error;
  await setMemoryEnabled(g.user.id, data.enabled);
  return json({ ok: true, enabled: data.enabled });
}

export async function DELETE(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  return json({ ok: true, deleted: await clearMemories(g.user.id) });
}
