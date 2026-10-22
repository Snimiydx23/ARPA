// GET  /api/chats — list current user's chats (V3: replaces V2 firestore list)
// POST /api/chats — create OR save (upsert) a chat
// Messages are stored per row in the Message table (services/chat-store.ts); old JSON chats are read transparently.
import { enforceRate } from "@/lib/rate-limit";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { bearerUid, json } from "@/lib/arpa";
import { ownsProject } from "@/services/projects";
import { sanitizeMsgs, loadMany, saveChatWithMessages } from "@/services/chat-store";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  { const limited = await enforceRate("write", uid); if (limited) return limited; }
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);
  // ?lite=1 → list without messages (the app loads a chat's messages when it is opened)
  const lite = new URL(req.url).searchParams.get("lite") === "1";

  const rows: any[] = await db.chat.findMany({
    where: { userId: u.id, archived: false },
    orderBy: [{ pinned: "desc" }, { at: "desc" }],
    take: 150,
    select: { id: true, title: true, at: true, pinned: true, tags: true, shareToken: true, systemPrompt: true, projectId: true, storage: true, msgCount: true, searchText: true, ...(lite ? {} : { msgs: true }) },
  });
  const all = lite ? null : await loadMany(rows);
  const chats = rows.map((r) => {
    const base = {
      id: r.id, title: r.title, at: r.at.getTime(), pinned: !!r.pinned,
      tags: r.tags ? r.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
      shared: !!r.shareToken,
      systemPrompt: r.systemPrompt || "",
      projectId: r.projectId || null,
    };
    if (lite) {
      // old JSON chats that were never re-saved have msgCount 0 → the app treats "unknown" as "load on open"
      return { ...base, msgs: [], msgsLoaded: false, msgCount: r.msgCount || 0, searchText: r.searchText || "" };
    }
    return { ...base, msgs: all!.get(r.id) || [] };
  });
  return json({ ok: true, chats });
}

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  { const limited = await enforceRate("write", uid); if (limited) return limited; }
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const id = String(body.id || "").trim().slice(0, 40);
  const title = String(body.title || "New chat").slice(0, 200);
  const at = body.at ? new Date(body.at) : new Date();
  let msgs = Array.isArray(body.msgs) ? sanitizeMsgs(body.msgs) : undefined;

  // optional project assignment (must be the user's own project)
  let projectId: string | null | undefined = undefined;
  if (body.projectId === null) projectId = null;
  else if (typeof body.projectId === "string" && body.projectId) {
    if (!(await ownsProject(u.id, body.projectId))) return json({ error: "Project not found" }, 404);
    projectId = body.projectId;
  }

  const newId = id || crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const existing: any = id ? await db.chat.findUnique({ where: { id }, select: { userId: true, msgCount: true, storage: true, msgs: true } }) : null;
  if (existing && existing.userId !== u.id) return json({ error: "Not yours" }, 403);
  // safety net: an empty list never wipes a conversation that has messages (e.g. a chat whose
  // messages weren't loaded yet). Deleting messages goes through DELETE or explicit clear:true.
  if (existing && msgs && msgs.length === 0 && body.clear !== true) {
    const had = existing.storage === "table" ? existing.msgCount > 0 : (existing.msgs || "[]") !== "[]";
    if (had) msgs = undefined;
  }

  const saved: any = await saveChatWithMessages(newId, u.id, existing ? msgs : msgs ?? [], (chatData) =>
    db.chat.upsert({
      where: { id: newId },
      update: { title, at, ...(projectId !== undefined ? { projectId } : {}), ...chatData },
      create: { id: newId, userId: u.id, title, at, projectId: projectId ?? null, ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt.slice(0, 2000) } : {}), ...chatData },
    }),
  );
  return json({ ok: true, id: saved.id, at: saved.at.getTime(), pinned: !!saved.pinned, projectId: saved.projectId || null });
}
