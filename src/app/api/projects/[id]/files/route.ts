// POST /api/projects/[id]/files — add a knowledge file { name, size?, text } (text extracted in the browser)
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, ProjectFileSchema } from "@/lib/validate";
import { addProjectFile, LimitError } from "@/services/projects";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, ProjectFileSchema);
  if (error) return error;
  try {
    const f = await addProjectFile(g.user.id, (await params).id, data);
    return f ? json({ ok: true, file: f }) : json({ ok: false, error: "Project not found" }, 404);
  } catch (e) {
    if (e instanceof LimitError) return json({ ok: false, error: e.message }, 400);
    return json({ ok: false, error: "Could not save the file." }, 500);
  }
}
