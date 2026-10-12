// POST /api/search — web search (V3.2 live info).
// Body: { query, num? } → { ok, results: [{url,name,snippet,host_name,date,favicon}] }
// Provider: Tavily (free tier) — set TAVILY_API_KEY in env. Without it, returns a clear "not configured" error.
import { bearerUid, json } from "@/lib/arpa";

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const query = String(body?.query || "").trim();
  if (!query) return json({ error: "Query is empty" }, 400);
  const num = Math.min(10, Math.max(1, Number(body?.num) || 5));

  const key = process.env.TAVILY_API_KEY;
  if (!key) return json({ ok: false, error: "Web search is not configured yet (TAVILY_API_KEY missing)." }, 501);

  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: num, search_depth: "basic" }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail?.error || j?.error || `Search error ${r.status}`);
    const results = (Array.isArray(j?.results) ? j.results : []).map((x: any) => {
      let host = "";
      try { host = new URL(x.url).hostname.replace(/^www\./, ""); } catch {}
      return {
        url: x.url || "",
        name: x.title || host,
        snippet: String(x.content || "").slice(0, 400),
        host_name: host,
        date: x.published_date || "",
        favicon: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : "",
      };
    });
    return json({ ok: true, results });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Search error" }, 502);
  }
}
