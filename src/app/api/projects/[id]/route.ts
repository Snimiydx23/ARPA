// GET    /api/projects/[id] — project details + file list (no file text)
// PATCH  /api/projects/[id] — update { name?, description?, instructions?, emoji? }
// DELETE /api/projects/[id] — delete project + its files (chats are kept, moved out of the project)
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, ProjectUpdateSchema } from "@/lib/validate";
import { getProject, updateProject, deleteProject } from "@/services/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const p = await getProject(g.user.id, (await params).id);
  return p ? json({ ok: true, project: p }) : json({ ok: false, error: "Project not found" }, 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, ProjectUpdateSchema);
  if (error) return error;
  const ok = await updateProject(g.user.id, (await params).id, data);
  return ok ? json({ ok: true }) : json({ ok: false, error: "Project not found" }, 404);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const ok = await deleteProject(g.user.id, (await params).id);
  return ok ? json({ ok: true }) : json({ ok: false, error: "Project not found" }, 404);
}
