// GET  /api/chats — list current user's chats (V3: replaces V2 firestore list)
// POST /api/chats — create OR save (upsert) a chat
import { db } from "@/lib/db";
import { bearerUid, json } from "@/lib/arpa";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);

  const rows = await db.chat.findMany({
    where: { userId: u.id, archived: false },
    orderBy: [{ pinned: "desc" }, { at: "desc" }],
    take: 150,
    select: { id: true, title: true, at: true, msgs: true, pinned: true, tags: true, shareToken: true, systemPrompt: true },
  });
  const chats = rows.map(r => {
    let msgs: any[] = [];
    try { msgs = JSON.parse(r.msgs || "[]"); } catch {}
    return {
      id: r.id, title: r.title, at: r.at.getTime(), msgs, pinned: !!r.pinned,
      tags: r.tags ? r.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      shared: !!r.shareToken,
      systemPrompt: r.systemPrompt || "",
    };
  });
  return json({ ok: true, chats });
}

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const id = String(body.id || "").trim();
  const title = String(body.title || "New chat").slice(0, 200);
  const at = body.at ? new Date(body.at) : new Date();
  const msgs = Array.isArray(body.msgs)
    ? body.msgs
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof (m.content || "") === "string")
        .map((m: any) => {
          const o: any = { role: m.role, content: (m.content || "").slice(0, 40000) };
          if (m.error) o.error = String(m.error).slice(0, 500);
          if (m.model) o.model = String(m.model);
          if (m.cut) o.cut = true;
          if (m.ms) o.ms = Number(m.ms);
          if (m.edited) o.edited = true;
          if (m.reaction === "up" || m.reaction === "down") o.reaction = m.reaction;
          if (typeof m.thumb === "string" && m.thumb.startsWith("data:image/") && m.thumb.length < 80000) o.thumb = m.thumb;
          return o;
        })
    : [];

  // Trim to keep under ~900KB (SQLite TEXT limit is fine but keep sane)
  let msgsJson = JSON.stringify(msgs);
  while (msgsJson.length > 900000 && msgs.length > 2) {
    msgs.splice(0, 2);
    msgsJson = JSON.stringify(msgs);
  }

  if (id) {
    // upsert save
    const existing = await db.chat.findUnique({ where: { id }, select: { userId: true } });
    if (existing && existing.userId !== u.id) return json({ error: "Not yours" }, 403);
    const saved = await db.chat.upsert({
      where: { id },
      update: { title, msgs: msgsJson, at },
      create: { id, userId: u.id, title, msgs: msgsJson, at },
    });
    return json({ ok: true, id: saved.id, at: saved.at.getTime(), pinned: !!saved.pinned });
  }
  const created = await db.chat.create({ data: { userId: u.id, title, msgs: msgsJson, at } });
  return json({ ok: true, id: created.id, at: created.at.getTime() });
}
