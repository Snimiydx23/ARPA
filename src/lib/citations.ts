// ARPA — turn "[n]" citation markers into markdown links "#cite-n" (rendered as pills by <Markdown>).
// Code fences and inline code are left untouched; only numbers that match a real source are linked.
export function linkCitations(md: string, maxN: number, maxF = 0): string {
  if (!md || (maxN < 1 && maxF < 1)) return md;
  const parts = md.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
  return parts
    .map((p, i) => {
      if (i % 2 === 1) return p; // code
      return p
        .replace(/\[(\d{1,2})\](?!\(|:)/g, (m, d) => {
          const n = Number(d);
          return n >= 1 && n <= maxN ? `[${n}](#cite-${n})` : m;
        })
        .replace(/\[F(\d{1,2})\](?!\(|:)/g, (m, d) => {
          const n = Number(d);
          return n >= 1 && n <= maxF ? `[F${n}](#fcite-${n})` : m;
        });
    })
    .join("");
}

/** Strip citation markers (used for read-aloud / plain copies). */
export function stripCitations(md: string): string {
  return md.replace(/\s?\[F?(\d{1,2})\](?!\()/g, "");
}

/** Exported documents get a numbered "Sources" list so [n] citations stay meaningful offline. */
export function withSourceList(
  md: string,
  sources?: { n: number; title: string; url: string; domain: string }[],
  files?: { n: number; name: string; label: string }[],
) {
  let out = md;
  if (sources?.length) out += `\n\n**Sources**\n\n${sources.map((s) => `${s.n}. [${s.title.replace(/[\[\]]/g, "")}](${s.url}) — ${s.domain}`).join("\n")}\n`;
  if (files?.length) out += `\n\n**Project file references**\n\n${files.map((f) => `- F${f.n}: ${f.name}${f.label ? ` (${f.label})` : ""}`).join("\n")}\n`;
  return out;
}

/** Server-side: keep only well-formed http(s) sources (max 10) when saving / sharing chats. */
export function sanitizeSources(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((s: any) => s && typeof s.url === "string" && /^https?:\/\//i.test(s.url) && s.url.length < 2000)
    .slice(0, 10)
    .map((s: any, i: number) => ({
      n: Number.isInteger(s.n) && s.n > 0 && s.n <= 20 ? s.n : i + 1,
      title: String(s.title || "").slice(0, 200),
      url: s.url,
      domain: String(s.domain || "").slice(0, 100),
      snippet: String(s.snippet || "").slice(0, 300),
      ...(typeof s.published === "string" ? { published: s.published.slice(0, 40) } : {}),
    }));
  return out.length ? out : undefined;
}

/** Server-side: project-file citations (max 30). `withExcerpt=false` for public share links (no document text). */
export function sanitizeFileSources(v: unknown, withExcerpt = true) {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((s: any) => s && Number.isInteger(s.n) && s.n > 0 && s.n <= 50 && typeof s.name === "string")
    .slice(0, 30)
    .map((s: any) => ({
      n: s.n,
      fileId: String(s.fileId || "").slice(0, 40),
      name: String(s.name).slice(0, 200),
      label: String(s.label || "").slice(0, 80),
      excerpt: withExcerpt ? String(s.excerpt || "").slice(0, 300) : "",
    }));
  return out.length ? out : undefined;
}

/** Server-side: agent step trace (max 12) — labels only, no tool output. */
export function sanitizeAgentSteps(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((s: any) => s && typeof s.tool === "string" && typeof s.label === "string")
    .slice(0, 12)
    .map((s: any) => ({
      tool: s.tool.slice(0, 40),
      label: s.label.slice(0, 160),
      ...(typeof s.ok === "boolean" ? { ok: s.ok } : {}),
      ...(Number.isFinite(s.ms) ? { ms: Math.max(0, Math.round(s.ms)) } : {}),
    }));
  return out.length ? out : undefined;
}

/** Server-side: saved part of a python run (no images / file bytes). */
export function sanitizeCodeResult(v: any) {
  if (!v || typeof v !== "object" || typeof v.code !== "string") return undefined;
  const str = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");
  const tables = Array.isArray(v.tables) ? v.tables.slice(0, 3).map((t: any) => ({
    title: str(t?.title, 120),
    columns: (Array.isArray(t?.columns) ? t.columns : []).slice(0, 30).map((c: unknown) => str(String(c), 80)),
    index: (Array.isArray(t?.index) ? t.index : []).slice(0, 50).map((c: unknown) => str(String(c), 80)),
    rows: (Array.isArray(t?.rows) ? t.rows : []).slice(0, 50).map((r: unknown) => (Array.isArray(r) ? r.slice(0, 30).map((c) => (typeof c === "number" || typeof c === "boolean" || c === null ? c : str(String(c), 200))) : [])),
    total: Number.isFinite(t?.total) ? Number(t.total) : 0,
  })) : [];
  const imageCount = Number(v.imageCount ?? (Array.isArray(v.images) ? v.images.length : 0)) || 0;
  const fileNames = (Array.isArray(v.fileNames) ? v.fileNames : Array.isArray(v.files) ? v.files.map((f: any) => f?.name) : [])
    .filter((x: unknown) => typeof x === "string").slice(0, 10).map((x: string) => x.slice(0, 120));
  return {
    code: v.code.slice(0, 20000), ok: !!v.ok, stdout: str(v.stdout, 8000), ...(v.error ? { error: str(v.error, 3000) } : {}),
    ms: Number(v.ms) || 0, tables, ...(imageCount ? { imageCount } : {}), ...(fileNames.length ? { fileNames } : {}),
  };
}
