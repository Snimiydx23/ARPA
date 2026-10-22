// POST /api/canvas/edit — ask ARPA to change the canvas (whole document, or only the selected part).
// {content, kind, language?, instruction, selection?:{start,end}} → {content, replaced:{start,end}|null, model}
// Counts as one message of the daily quota (refunded when the AI fails).
import { db } from "@/lib/db";
import { CFG, json, status, takeQuota, refundQuota } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, CanvasEditSchema } from "@/lib/validate";
import { complete } from "@/services/ai/gateway";
import { recordUsage } from "@/services/ai/usage";
import { buildEditMessages, applyEdit, CanvasError } from "@/services/canvas";
import { logger } from "@/lib/log";

export const maxDuration = 300;

export async function POST(req: Request) {
  const log = logger("canvas", req);
  const g = await guard(req, "chat");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, CanvasEditSchema);
  if (error) return error;

  let messages;
  try { messages = buildEditMessages(data); } catch (e: any) {
    if (e instanceof CanvasError) return json({ ok: false, error: e.message }, e.status);
    throw e;
  }

  const u = await db.user.findUnique({ where: { id: g.user.id } });
  if (!u) return json({ ok: false, error: "User not found" }, 401);
  const st = status(u);
  if (st.state === "expired") return json({ ok: false, error: "Your free trial has ended. Please pick a plan to keep using ARPA.", code: "EXPIRED" }, 402);
  const q = await takeQuota(u.id, st.limit);
  if (!q.ok) return json({ ok: false, error: `Today's limit (${st.limit} messages) has been reached.`, code: "LIMIT" }, 429);

  const t0 = Date.now();
  try {
    const sel = data.selection;
    const size = sel ? sel.end - sel.start : data.content.length;
    const r = await complete(
      { requested: size > 6000 ? "quality" : "balanced", hasImage: false, totalChars: data.content.length, lastUserText: data.instruction },
      { messages, temperature: 0.2, maxTokens: CFG.maxTokens, signal: req.signal },
    );
    if (!r.text.trim()) throw new Error("empty reply");
    const out = applyEdit(data.content, r.text, sel);
    void recordUsage({ userId: u.id, kind: "canvas", model: r.model, latencyMs: Date.now() - t0, ok: true, routeReason: sel ? "canvas: selection" : "canvas: document" });
    return json({ ok: true, content: out.content, replaced: out.replaced, model: r.model.label, used: q.used });
  } catch (e: any) {
    if (e?.name === "AbortError") return new Response(null, { status: 499 });
    await refundQuota(u.id);
    log.error("canvas.edit.fail", e);
    void recordUsage({ userId: u.id, kind: "canvas", latencyMs: Date.now() - t0, ok: false, error: e?.message });
    return json({ ok: false, error: "ARPA could not edit the canvas right now. Please try again.", code: "AI_UNAVAILABLE" }, 503);
  }
}
