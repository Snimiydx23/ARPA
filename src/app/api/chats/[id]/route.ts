// /api/chats/[id] — GET (full chat), PATCH (rename), DELETE
import { db } from "@/lib/db";
import { bearerUid, json } from "@/lib/arpa";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);
  const { id } = await params;
  const r = await db.chat.findUnique({ where: { id } });
  if (!r || r.userId !== u.id) return json({ error: "Chat not found" }, 404);
  let msgs: any[] = [];
  try { msgs = JSON.parse(r.msgs || "[]"); } catch {}
  return json({
    ok: true, chat: {
      id: r.id, title: r.title, at: r.at.getTime(), msgs, pinned: !!r.pinned,
      tags: r.tags ? r.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      shared: !!r.shareToken,
      archived: !!r.archived,
      systemPrompt: r.systemPrompt || "",
    }
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);
  const { id } = await params;
  const r = await db.chat.findUnique({ where: { id }, select: { userId: true } });
  if (!r || r.userId !== u.id) return json({ error: "Chat not found" }, 404);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const data: any = {};
  if (typeof body.title === "string") data.title = String(body.title).slice(0, 200);
  if (body.at) data.at = new Date(body.at);
  if (Array.isArray(body.msgs)) {
    const msgs = body.msgs
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => {
        const o: any = { role: m.role, content: String(m.content || "").slice(0, 40000) };
        if (m.edited) o.edited = true;
        if (m.model) o.model = String(m.model);
        if (m.ms) o.ms = Number(m.ms);
        if (m.cut) o.cut = true;
        return o;
      });
    data.msgs = JSON.stringify(msgs);
  }
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (typeof body.systemPrompt === "string") data.systemPrompt = String(body.systemPrompt).slice(0, 2000);
  if (typeof body.tags === "string") {
    // sanitize: comma-separated, each tag trimmed, lowercase, alnum+dash only, max 5 tags
    const tags = body.tags.split(",").map((t: string) => t.trim().toLowerCase().replace(/[^a-z0-9\- ]/g, "")).filter(Boolean).slice(0, 5);
    data.tags = tags.join(",");
  }
  if (body.share === true) {
    // generate a share token if not already present
    const existing = await db.chat.findUnique({ where: { id }, select: { shareToken: true } });
    if (!existing?.shareToken) {
      data.shareToken = "sh_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
  } else if (body.share === false) {
    data.shareToken = null;
  }
  const updated = await db.chat.update({ where: { id }, data });
  return json({
    ok: true, id: updated.id, title: updated.title, at: updated.at.getTime(),
    pinned: !!updated.pinned,
    archived: !!updated.archived,
    systemPrompt: updated.systemPrompt || "",
    tags: updated.tags ? updated.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    shareToken: updated.shareToken,
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);
  const { id } = await params;
  const r = await db.chat.findUnique({ where: { id }, select: { userId: true } });
  if (!r || r.userId !== u.id) return json({ error: "Chat not found" }, 404);
  await db.chat.delete({ where: { id } });
  return json({ ok: true });
}
