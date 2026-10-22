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
    select: { id: true, title: true, at: true, msgs: true, pinned: true, storage: true },
    orderBy: [{ pinned: "desc" }, { at: "desc" }],
    take: 150,
  });

  // table-stored chats: let the database find matching messages instead of loading every conversation
  const tableIds = chats.filter((c: any) => c.storage === "table").map((c) => c.id);
  const rowHits: any[] = tableIds.length
    ? (await db.message.findMany({
        where: { chatId: { in: tableIds }, content: { contains: q, mode: "insensitive" } },
        select: { chatId: true, idx: true, role: true, content: true },
        orderBy: [{ chatId: "asc" }, { idx: "asc" }],
        take: 300,
      })) || []
    : [];
  const hitsByChat = new Map<string, any[]>();
  for (const h of rowHits) { const l = hitsByChat.get(h.chatId) || []; l.push(h); hitsByChat.set(h.chatId, l); }

  type Hit = { chatId: string; chatTitle: string; chatAt: number; msgIdx: number; role: string; snippet: string; pinned: boolean };
  const results: Hit[] = [];
  for (const c of chats) {
    let msgs: any[] = [];
    let idxs: number[] | null = null;
    if ((c as any).storage === "table") {
      const hs = hitsByChat.get(c.id) || [];
      msgs = hs.map((h) => ({ role: h.role, content: h.content }));
      idxs = hs.map((h) => h.idx);
    } else {
      try { msgs = JSON.parse(c.msgs || "[]"); } catch {}
    }
    msgs.forEach((m, j) => {
      const i = idxs ? idxs[j] : j;
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
