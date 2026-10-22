// PATCH /api/admin/users/:id — {action:"extend",days,reason?} | {action:"block",reason?} | {action:"unblock"} | {action:"role",role}
import { json } from "@/lib/arpa";
import { adminGuard } from "@/lib/admin-guard";
import { parseBody, AdminActionSchema } from "@/lib/validate";
import { updateUser, AdminError } from "@/services/admin";
import { logger } from "@/lib/log";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const log = logger("admin", req);
  const g = await adminGuard(req);
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, AdminActionSchema);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    const r = await updateUser(g.admin, String(id).slice(0, 40), data);
    log.info("admin.action", { admin: g.admin.email, action: data.action, target: id });
    return json({ ok: true, user: r });
  } catch (e: any) {
    if (e instanceof AdminError) return json({ ok: false, error: e.message }, e.status);
    log.error("admin.action.fail", e);
    return json({ ok: false, error: "Could not update the user." }, 500);
  }
}
