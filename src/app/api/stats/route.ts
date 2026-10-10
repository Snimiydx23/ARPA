// GET /api/stats — 7-day usage + chat counts for the usage dashboard (V3.2).
import { db } from "@/lib/db";
import { bearerUid, json, today } from "@/lib/arpa";

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const u = await db.user.findUnique({ where: { uid }, select: { id: true } });
  if (!u) return json({ error: "User not found" }, 404);

  // last 7 days usage (oldest first)
  const days: { day: string; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    days.push({ day, count: 0 });
  }
  const rows = await db.usage.findMany({
    where: { userId: u.id, day: { in: days.map((d) => d.day) } },
    select: { day: true, count: true },
  });
  const map = new Map(rows.map((r) => [r.day, r.count]));
  for (const d of days) d.count = map.get(d.day) || 0;

  // totals
  const totalChats = await db.chat.count({ where: { userId: u.id } });
  const pinnedChats = await db.chat.count({ where: { userId: u.id, pinned: true } });
  // count messages + reactions across all chats (stored as JSON)
  const allChats = await db.chat.findMany({ where: { userId: u.id }, select: { msgs: true } });
  let msgCount = 0;
  let upCount = 0;
  let downCount = 0;
  for (const c of allChats) {
    try {
      const arr = JSON.parse(c.msgs || "[]");
      if (Array.isArray(arr)) {
        msgCount += arr.length;
        for (const m of arr) {
          if (m?.reaction === "up") upCount++;
          else if (m?.reaction === "down") downCount++;
        }
      }
    } catch {}
  }
  const weekTotal = days.reduce((a, b) => a + b.count, 0);

  return json({
    ok: true,
    week: days, // [{day, count}]
    totals: {
      chats: totalChats,
      pinned: pinnedChats,
      messages: msgCount,
      weekMessages: weekTotal,
      upReactions: upCount,
      downReactions: downCount,
    },
  });
}
