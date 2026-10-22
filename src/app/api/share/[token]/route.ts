import { loadMessages } from "@/services/chat-store";
import { sanitizeSources, sanitizeFileSources, sanitizeAgentSteps } from "@/lib/citations";
// GET /api/share/[token] — public read-only shared chat (V3.3).
// No auth required; token is the unique shareToken on the Chat row.
import { db } from "@/lib/db";
import { json } from "@/lib/arpa";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !token.startsWith("sh_")) return json({ error: "Invalid link" }, 400);
  const r = await db.chat.findUnique({ where: { shareToken: token }, select: { id: true, title: true, msgs: true, at: true, storage: true } });
  if (!r) return json({ error: "Share link has expired or was deleted." }, 404);
  let msgs: any[] = [];
  msgs = await loadMessages(r);
  // Public links expose only what is needed to read the conversation — never attached document text.
  msgs = (Array.isArray(msgs) ? msgs : []).map((m: any) => {
    const o: any = { role: m.role, content: String(m.content || "") };
    if (m.model) o.model = m.model;
    if (m.thumb) o.thumb = m.thumb;
    if (m.genImage) o.genImage = m.genImage;
    if (m.imgQuery) o.imgQuery = m.imgQuery;
    const steps = sanitizeAgentSteps(m.agentSteps);
    if (steps) o.agentSteps = steps;
    const fsrc = sanitizeFileSources(m.fileSources, false); // names only — never document text in public links
    if (fsrc) o.fileSources = fsrc;
    const srcs = sanitizeSources(m.sources);
    if (srcs) { o.sources = srcs; if (m.research) o.research = m.research; }
    if (m.file?.name) o.file = { name: String(m.file.name), text: "", size: m.file.size };
    if (m.error) o.error = m.error;
    return o;
  });
  return json({
    ok: true,
    chat: { id: r.id, title: r.title, at: r.at.getTime(), msgs },
  });
}
