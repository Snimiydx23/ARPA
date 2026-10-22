// GET  /api/admin/storage — how many chats use the old JSON format vs the Message table
// POST /api/admin/storage {to:"table"|"json", batch?} — convert the next batch of chats (call until remaining = 0)
import { json } from "@/lib/arpa";
import { adminGuard } from "@/lib/admin-guard";
import { storageStatus, migrateBatch } from "@/services/chat-store";
import { logger } from "@/lib/log";
import { db } from "@/lib/db";

export const maxDuration = 120;

export async function GET(req: Request) {
  const g = await adminGuard(req);
  if (g.error) return g.error;
  return json({ ok: true, ...(await storageStatus()) });
}

export async function POST(req: Request) {
  const log = logger("admin", req);
  const g = await adminGuard(req);
  if (g.error) return g.error;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const to = body.to === "json" ? "json" : body.to === "table" ? "table" : null;
  if (!to) return json({ ok: false, error: 'to must be "table" or "json"' }, 400);
  const r = await migrateBatch(to, Number(body.batch) || 25);
  log.info("admin.storage.migrate", { admin: g.admin.email, to, ...r, failed: r.failed.length });
  if (r.converted || r.failed.length) {
    await db.adminAudit.create({ data: { adminId: g.admin.id, adminEmail: g.admin.email, action: "migrate_chats", targetId: "-", targetEmail: "", details: JSON.stringify({ to, converted: r.converted, messages: r.movedMessages, failed: r.failed.length }) } }).catch(() => {});
  }
  return json({ ok: true, ...r, ...(await storageStatus()) });
}
