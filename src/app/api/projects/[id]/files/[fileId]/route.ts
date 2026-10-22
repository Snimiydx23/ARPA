// DELETE /api/projects/[id]/files/[fileId] — remove a knowledge file
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { deleteProjectFile } from "@/services/projects";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { id, fileId } = await params;
  const ok = await deleteProjectFile(g.user.id, id, fileId);
  return ok ? json({ ok: true }) : json({ ok: false, error: "File not found" }, 404);
}
