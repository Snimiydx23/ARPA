// ARPA — chat message storage.
//   "json"  (old): the whole conversation is one JSON string in Chat.msgs — rewritten on every save.
//   "table" (new): one Message row per message; a save only writes rows whose content changed (sha1 hash)
//                  and deletes rows past the new end. Chats are converted automatically on their next save,
//                  or all at once from the admin dashboard. Rollback to JSON is one admin action.
// CHAT_STORAGE=json keeps writing the old format (emergency switch); reading always understands both.
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { sanitizeSources, sanitizeFileSources, sanitizeAgentSteps, sanitizeCodeResult } from "@/lib/citations";

export type StoredMsg = Record<string, any> & { role: "user" | "assistant"; content: string };

export const CHAT_LIMITS = { maxMessages: 2000, jsonMaxChars: 900_000, searchChars: 4000 };
export const writeMode = (): "json" | "table" => (process.env.CHAT_STORAGE === "json" ? "json" : "table");

/** Whitelist + bound every message field the client may save (single source for all chat routes). */
export function sanitizeMsgs(raw: unknown): StoredMsg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof (m.content ?? "") === "string")
    .slice(-CHAT_LIMITS.maxMessages)
    .map((m: any) => {
      const o: StoredMsg = { role: m.role, content: String(m.content || "").slice(0, 40000) };
      if (m.error) o.error = String(m.error).slice(0, 500);
      if (m.model) o.model = String(m.model).slice(0, 200);
      if (m.cut) o.cut = true;
      if (m.ms) o.ms = Number(m.ms) || 0;
      if (m.edited) o.edited = true;
      if (m.reaction === "up" || m.reaction === "down") o.reaction = m.reaction;
      if (m.file && typeof m.file.name === "string" && typeof m.file.text === "string") {
        o.file = {
          name: m.file.name.slice(0, 300), text: m.file.text.slice(0, 60000), size: Number(m.file.size) || 0,
          pages: Number(m.file.pages) || undefined, truncated: !!m.file.truncated || m.file.text.length > 60000,
          ...(Array.isArray(m.file.raw) ? { raw: m.file.raw.filter((x: unknown) => typeof x === "string").slice(0, 10).map((x: string) => x.slice(0, 120)) } : {}),
        };
      }
      if (m.imagine) o.imagine = true;
      if (m.imagineQuality === "hd") o.imagineQuality = "hd";
      if (m.genImage && typeof m.genImage.id === "string" && /^[a-z0-9]{20,40}$/i.test(m.genImage.id)) {
        o.genImage = { id: m.genImage.id, url: `/api/imagine/${m.genImage.id}`, prompt: String(m.genImage.prompt || "").slice(0, 1500), width: Number(m.genImage.width) || 1024, height: Number(m.genImage.height) || 1024, seed: Number(m.genImage.seed) || 0 };
      }
      if (typeof m.memorySuggestion === "string" && m.memorySuggestion.trim()) o.memorySuggestion = m.memorySuggestion.slice(0, 300);
      if (m.memorySaved === true) o.memorySaved = true;
      if (typeof m.canvasId === "string" && /^[a-z0-9]{10,40}$/i.test(m.canvasId)) o.canvasId = m.canvasId;
      const cr = sanitizeCodeResult(m.codeResult);
      if (cr) o.codeResult = cr;
      if (m.codeOutput === true) o.codeOutput = true;
      const steps = sanitizeAgentSteps(m.agentSteps);
      if (steps) o.agentSteps = steps;
      const fsrc = sanitizeFileSources(m.fileSources);
      if (fsrc) o.fileSources = fsrc;
      const srcs = sanitizeSources(m.sources);
      if (srcs) { o.sources = srcs; if (m.research === "deep" || m.research === "quick") o.research = m.research; }
      if (typeof m.imgQuery === "string" && m.imgQuery.trim()) o.imgQuery = m.imgQuery.slice(0, 120);
      if (typeof m.thumb === "string" && m.thumb.startsWith("data:image/") && m.thumb.length < 80000) o.thumb = m.thumb;
      return o;
    });
}

export const msgHash = (m: StoredMsg) => crypto.createHash("sha1").update(JSON.stringify(m)).digest("hex");

/** Lower-cased start of the conversation for the sidebar filter (no file text). */
export function searchTextOf(msgs: StoredMsg[]) {
  let s = "";
  for (const m of msgs) {
    if (m.codeOutput) continue;
    s += " " + m.content.replace(/\s+/g, " ");
    if (s.length > CHAT_LIMITS.searchChars) break;
  }
  return s.trim().toLowerCase().slice(0, CHAT_LIMITS.searchChars);
}

const toRow = (m: StoredMsg) => {
  const { role, content, ...rest } = m;
  return { role, content, data: JSON.stringify(rest) };
};
export const fromRow = (r: { role: string; content: string; data: string }): StoredMsg => {
  let rest: Record<string, unknown> = {};
  try { rest = JSON.parse(r.data || "{}"); } catch {}
  return { ...rest, role: r.role === "assistant" ? "assistant" : "user", content: r.content };
};

/** Messages of one chat, whatever its storage. */
export async function loadMessages(chat: { id: string; storage?: string | null; msgs?: string | null }): Promise<StoredMsg[]> {
  if (chat.storage === "table") {
    const rows: any[] = (await db.message.findMany({ where: { chatId: chat.id }, orderBy: { idx: "asc" }, select: { role: true, content: true, data: true } })) || [];
    return rows.map(fromRow);
  }
  try { const a = JSON.parse(chat.msgs || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

/** JSON format keeps the old ~900 KB cap (drops the oldest pairs). */
function jsonBlob(msgs: StoredMsg[]) {
  const list = [...msgs];
  let s = JSON.stringify(list);
  while (s.length > CHAT_LIMITS.jsonMaxChars && list.length > 2) { list.splice(0, 2); s = JSON.stringify(list); }
  return { blob: s, list };
}

/**
 * Save the full message list of a chat (already sanitized). Returns DB operations to run in one transaction
 * together with the chat's own update — so title/at/project and messages change atomically.
 */
export async function messageOps(chatId: string, userId: string, msgs: StoredMsg[], mode = writeMode()) {
  if (mode === "json") {
    const { blob, list } = jsonBlob(msgs);
    return {
      ops: [db.message.deleteMany({ where: { chatId } })],
      chatData: { msgs: blob, storage: "json", msgCount: list.length, searchText: searchTextOf(list) },
      written: list.length,
    };
  }
  const existing: { idx: number; hash: string }[] = (await db.message.findMany({ where: { chatId }, select: { idx: true, hash: true } })) || [];
  const have = new Map(existing.map((r) => [r.idx, r.hash]));
  const ops: any[] = [];
  const fresh: any[] = [];
  let written = 0;
  msgs.forEach((m, idx) => {
    const hash = msgHash(m);
    if (have.get(idx) === hash) return;
    written++;
    const row = { ...toRow(m), hash };
    if (have.has(idx)) ops.push(db.message.update({ where: { chatId_idx: { chatId, idx } }, data: row }));
    else fresh.push({ chatId, userId, idx, ...row });
  });
  if (fresh.length) ops.push(db.message.createMany({ data: fresh }));
  if (existing.some((r) => r.idx >= msgs.length)) ops.push(db.message.deleteMany({ where: { chatId, idx: { gte: msgs.length } } }));
  return { ops, chatData: { msgs: "[]", storage: "table", msgCount: msgs.length, searchText: searchTextOf(msgs) }, written };
}

/** Convert one chat between formats (migration / rollback). Returns the number of messages moved. */
export async function convertChat(chatId: string, to: "table" | "json"): Promise<number> {
  const chat: any = await db.chat.findUnique({ where: { id: chatId }, select: { id: true, userId: true, storage: true, msgs: true } });
  if (!chat || (chat.storage || "json") === to) return 0;
  const msgs = sanitizeMsgs(await loadMessages(chat));
  if (to === "table") {
    // start clean so an interrupted earlier conversion can't leave stale rows
    await db.$transaction([
      db.message.deleteMany({ where: { chatId } }),
      ...(msgs.length ? [db.message.createMany({ data: msgs.map((m, idx) => ({ chatId, userId: chat.userId, idx, ...toRow(m), hash: msgHash(m) })) })] : []),
      db.chat.update({ where: { id: chatId }, data: { msgs: "[]", storage: "table", msgCount: msgs.length, searchText: searchTextOf(msgs) } }),
    ]);
  } else {
    const { blob, list } = jsonBlob(msgs);
    await db.$transaction([
      db.chat.update({ where: { id: chatId }, data: { msgs: blob, storage: "json", msgCount: list.length, searchText: searchTextOf(list) } }),
      db.message.deleteMany({ where: { chatId } }),
    ]);
  }
  return msgs.length;
}

/** Convert up to `batch` chats; call repeatedly until remaining = 0. */
export async function migrateBatch(to: "table" | "json", batch = 25) {
  const from = to === "table" ? "json" : "table";
  const rows: { id: string }[] = (await db.chat.findMany({ where: { storage: from }, select: { id: true }, take: Math.min(100, Math.max(1, batch)), orderBy: { at: "desc" } })) || [];
  let messages = 0;
  const failed: string[] = [];
  for (const r of rows) {
    try { messages += await convertChat(r.id, to); } catch { failed.push(r.id); }
  }
  const remaining = await db.chat.count({ where: { storage: from } });
  return { converted: rows.length - failed.length, movedMessages: messages, failed, remaining };
}

export async function storageStatus() {
  const [json, table, messages] = await Promise.all([
    db.chat.count({ where: { storage: "json" } }),
    db.chat.count({ where: { storage: "table" } }),
    db.message.count(),
  ]);
  return { json: json || 0, table: table || 0, messages: messages || 0, writeMode: writeMode() };
}

/** Messages for many chats at once (list endpoint): one query for table-stored chats. */
export async function loadMany(chats: { id: string; storage?: string | null; msgs?: string | null }[]) {
  const out = new Map<string, StoredMsg[]>();
  const tableIds = chats.filter((c) => c.storage === "table").map((c) => c.id);
  if (tableIds.length) {
    const rows: any[] = (await db.message.findMany({ where: { chatId: { in: tableIds } }, orderBy: [{ chatId: "asc" }, { idx: "asc" }], select: { chatId: true, role: true, content: true, data: true } })) || [];
    for (const r of rows) { const l = out.get(r.chatId) || []; l.push(fromRow(r)); out.set(r.chatId, l); }
  }
  for (const c of chats) if (c.storage !== "table") out.set(c.id, await loadMessages(c));
  return out;
}

const isUniqueError = (e: any) => e?.code === "P2002" || /unique constraint/i.test(String(e?.message || ""));

/**
 * Write chat fields + messages atomically. `chatOp(chatData)` must return the Prisma operation that creates /
 * updates the Chat row (it runs first inside the transaction). Retries once if two saves raced.
 */
export async function saveChatWithMessages<T>(chatId: string, userId: string, msgs: StoredMsg[] | undefined, chatOp: (chatData: Record<string, unknown>) => any): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (!msgs) return (await chatOp({})) as T;
      const { ops, chatData } = await messageOps(chatId, userId, msgs);
      const res = await db.$transaction([chatOp(chatData), ...ops]);
      return res[0] as T;
    } catch (e) {
      if (attempt === 0 && isUniqueError(e)) continue;
      throw e;
    }
  }
}
