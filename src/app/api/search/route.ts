// POST /api/search — web search (V3.2 live info).
// Body: { query, num? } → { ok, results: [{url,name,snippet,host_name,date,favicon}] }
import ZAI from "z-ai-web-dev-sdk";
import { bearerUid, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const query = String(body?.query || "").trim();
  if (!query) return json({ error: "Query is empty" }, 400);
  const num = Math.min(10, Math.max(1, Number(body?.num) || 5));
  try {
    const zai = await ZAI.create();
    const res = await zai.functions.invoke("web_search", { query, num });
    const results = Array.isArray(res) ? res : [];
    return json({ ok: true, results });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Search error" }, 502);
  }
}
