// GET /api/share/[token] — public read-only shared chat (V3.3).
// No auth required; token is the unique shareToken on the Chat row.
import { db } from "@/lib/db";
import { json } from "@/lib/arpa";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !token.startsWith("sh_")) return json({ error: "Invalid link" }, 400);
  const r = await db.chat.findUnique({ where: { shareToken: token }, select: { id: true, title: true, msgs: true, at: true } });
  if (!r) return json({ error: "Share link has expired or was deleted." }, 404);
  let msgs: any[] = [];
  try { msgs = JSON.parse(r.msgs || "[]"); } catch {}
  return json({
    ok: true,
    chat: { id: r.id, title: r.title, at: r.at.getTime(), msgs },
  });
}
