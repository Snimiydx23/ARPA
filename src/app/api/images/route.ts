// GET /api/images?q=query — related images for an answer (ChatGPT-style image gallery).
// Providers (first that returns results wins):
//   1. Tavily web image search   — when TAVILY_API_KEY is set (best: real web screenshots/photos)
//   2. Wikipedia page images + Wikimedia Commons — free, no key needed
// → { ok, images: [{ src, thumb, title, source, link }] }
import { bearerUid, json } from "@/lib/arpa";

type Img = { src: string; thumb: string; title: string; source: string; link: string };

const UA = "ARPA-AI-Assistant/1.0 (image gallery; contact via app)";
const OK_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;

async function tavily(q: string, key: string): Promise<Img[]> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: q, max_results: 5, include_images: true, include_image_descriptions: true, search_depth: "basic" }),
  });
  if (!r.ok) return [];
  const j: any = await r.json().catch(() => ({}));
  const pages: any[] = Array.isArray(j?.results) ? j.results : [];
  return (Array.isArray(j?.images) ? j.images : [])
    .map((x: any) => (typeof x === "string" ? { url: x } : x))
    .filter((x: any) => typeof x?.url === "string" && x.url.startsWith("https://"))
    .map((x: any) => {
      let host = "";
      try { host = new URL(x.url).hostname.replace(/^www\./, ""); } catch {}
      const page = pages.find((p) => { try { return new URL(p.url).hostname.replace(/^www\./, "") === host; } catch { return false; } });
      return { src: x.url, thumb: x.url, title: String(x.description || q).slice(0, 160), source: host, link: page?.url || x.url };
    });
}

async function wiki(q: string): Promise<Img[]> {
  const out: Img[] = [];
  // a) lead images of the most relevant Wikipedia articles
  try {
    const u = new URL("https://en.wikipedia.org/w/api.php");
    Object.entries({
      action: "query", format: "json", generator: "search", gsrsearch: q, gsrlimit: "6",
      prop: "pageimages|info", piprop: "thumbnail|original", pithumbsize: "800", inprop: "url", origin: "*",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    const j: any = await r.json();
    const pages = Object.values(j?.query?.pages || {}).sort((a: any, b: any) => a.index - b.index) as any[];
    for (const p of pages) {
      const src = p?.original?.source || p?.thumbnail?.source;
      if (!src || !OK_EXT.test(src)) continue;
      out.push({ src, thumb: p?.thumbnail?.source || src, title: p.title, source: "wikipedia.org", link: p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}` });
    }
  } catch {}
  // b) matching files on Wikimedia Commons
  try {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    Object.entries({
      action: "query", format: "json", generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "10",
      prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "800", origin: "*",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    const j: any = await r.json();
    const pages = Object.values(j?.query?.pages || {}).sort((a: any, b: any) => a.index - b.index) as any[];
    for (const p of pages) {
      const ii = p?.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp|gif)$/.test(ii.mime || "")) continue;
      if ((ii.width || 0) < 200 || (ii.height || 0) < 150) continue;
      out.push({
        src: ii.thumburl || ii.url, thumb: ii.thumburl || ii.url,
        title: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "),
        source: "commons.wikimedia.org", link: ii.descriptionurl || ii.url,
      });
    }
  } catch {}
  return out;
}

export async function GET(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Please log in" }, 401);
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) return json({ ok: true, images: [] });

  let images: Img[] = [];
  const key = process.env.TAVILY_API_KEY;
  if (key) { try { images = await tavily(q, key); } catch {} }
  if (images.length < 3) { try { images = [...images, ...(await wiki(q))]; } catch {} }

  // de-duplicate + cap
  const seen = new Set<string>();
  images = images.filter((i) => (seen.has(i.src) ? false : (seen.add(i.src), true))).slice(0, 12);

  return new Response(JSON.stringify({ ok: true, images }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=86400" },
  });
}
