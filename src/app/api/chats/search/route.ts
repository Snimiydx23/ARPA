// GET /api/chats/search?q=query — global search across all chats (V3.10).
// Returns matching chats + the specific message snippets that matched.
import { db } from "@/lib/db";
import { bearerUid, json } from "@/lib/arpa";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
  if (q.length < 2) return json({ ok: true, results: [] });

  const chats = await db.chat.findMany({
    where: { userId: u.id, archived: false },
    select: { id: true, title: true, at: true, msgs: true, pinned: true },
    orderBy: [{ pinned: "desc" }, { at: "desc" }],
    take: 150,
  });

  type Hit = { chatId: string; chatTitle: string; chatAt: number; msgIdx: number; role: string; snippet: string; pinned: boolean };
  const results: Hit[] = [];
  for (const c of chats) {
    let msgs: any[] = [];
    try { msgs = JSON.parse(c.msgs || "[]"); } catch {}
    msgs.forEach((m, i) => {
      const content = (m?.content || "").toLowerCase();
      if (content.includes(q)) {
        // build a snippet around the match
        const idx = content.indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(m.content.length, idx + q.length + 60);
        const prefix = start > 0 ? "…" : "";
        const suffix = end < m.content.length ? "…" : "";
        const snippet = prefix + m.content.slice(start, end) + suffix;
        results.push({
          chatId: c.id, chatTitle: c.title, chatAt: c.at.getTime(),
          msgIdx: i, role: m.role, snippet, pinned: !!c.pinned,
        });
      }
    });
    // also match title
    if (c.title.toLowerCase().includes(q) && !results.find((r) => r.chatId === c.id)) {
      results.push({
        chatId: c.id, chatTitle: c.title, chatAt: c.at.getTime(),
        msgIdx: -1, role: "title", snippet: c.title, pinned: !!c.pinned,
      });
    }
  }

  return json({ ok: true, results: results.slice(0, 50) });
}
