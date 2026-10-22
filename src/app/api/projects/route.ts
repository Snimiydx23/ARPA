// GET  /api/projects — list my projects (with chat/file counts)
// POST /api/projects — create { name, description?, instructions?, emoji? }
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, ProjectCreateSchema } from "@/lib/validate";
import { listProjects, createProject, LimitError } from "@/services/projects";
import { logger } from "@/lib/log";

export async function GET(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  return json({ ok: true, projects: await listProjects(g.user.id) });
}

export async function POST(req: Request) {
  const log = logger("projects", req);
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, ProjectCreateSchema);
  if (error) return error;
  try {
    const p = await createProject(g.user.id, data);
    return json({ ok: true, id: p.id });
  } catch (e) {
    if (e instanceof LimitError) return json({ ok: false, error: e.message }, 400);
    log.error("create.fail", e);
    return json({ ok: false, error: "Could not create the project." }, 500);
  }
}
