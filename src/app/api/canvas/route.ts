// GET /api/canvas?chatId= — my canvases (newest first) · POST /api/canvas — create {title?, kind, language?, content, chatId?}
import { json } from "@/lib/arpa";
import { guard } from "@/lib/guard";
import { parseBody, CanvasCreateSchema } from "@/lib/validate";
import { listCanvases, createCanvas, CanvasError } from "@/services/canvas";

export async function GET(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const chatId = new URL(req.url).searchParams.get("chatId") || undefined;
  return json({ ok: true, canvases: await listCanvases(g.user.id, chatId?.slice(0, 40)) });
}

export async function POST(req: Request) {
  const g = await guard(req, "write");
  if (g.error) return g.error;
  const { data, error } = await parseBody(req, CanvasCreateSchema);
  if (error) return error;
  try {
    return json({ ok: true, canvas: await createCanvas(g.user.id, data) });
  } catch (e: any) {
    if (e instanceof CanvasError) return json({ ok: false, error: e.message }, e.status);
    throw e;
  }
}
