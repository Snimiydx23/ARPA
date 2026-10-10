// GET /api/chats/archived — list archived chats (V3.6).
import { db } from "@/lib/db";
import { bearerUid, json } from "@/lib/arpa";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);

  const rows = await db.chat.findMany({
    where: { userId: u.id, archived: true },
    orderBy: { at: "desc" },
    take: 100,
    select: { id: true, title: true, at: true, pinned: true, tags: true, shareToken: true, systemPrompt: true },
  });
  const chats = rows.map(r => ({
    id: r.id, title: r.title, at: r.at.getTime(), pinned: !!r.pinned,
    tags: r.tags ? r.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    shared: !!r.shareToken,
    systemPrompt: r.systemPrompt || "",
  }));
  return json({ ok: true, chats });
}
