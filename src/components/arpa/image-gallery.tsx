"use client";
// ARPA — ChatGPT-style related-images strip shown inside an AI answer.
// Layout: one large image + two stacked thumbnails, "+N" on the last one; click opens a lightbox.
import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Images, X } from "lucide-react";
import { api } from "@/lib/arpa-client";

export type GalleryImg = { src: string; thumb: string; title: string; source: string; link: string };

// in-memory cache so re-renders / chat switches don't refetch
const cache = new Map<string, Promise<GalleryImg[]>>();
function fetchImages(q: string): Promise<GalleryImg[]> {
  if (!cache.has(q)) {
    cache.set(q, api<{ ok: boolean; images?: GalleryImg[] }>(`/api/images?q=${encodeURIComponent(q)}`)
      .then(({ status, data }) => (status === 200 && data?.ok ? data.images || [] : []))
      .catch(() => []));
  }
  return cache.get(q)!;
}

export function ImageGallery({ query }: { query: string }) {
  const [imgs, setImgs] = React.useState<GalleryImg[] | null>(null);
  const [broken, setBroken] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    setImgs(null);
    fetchImages(query).then((r) => { if (alive) setImgs(r); });
    return () => { alive = false; };
  }, [query]);

  const good = (imgs || []).filter((i) => !broken.has(i.src));
  const markBroken = (src: string) => setBroken((s) => new Set(s).add(src));

  // keyboard navigation in lightbox
  React.useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % good.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + good.length) % good.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, good.length]);

  if (imgs === null) {
    return (
      <div className="my-3 grid h-48 max-w-xl grid-cols-3 gap-1.5 sm:h-56">
        <div className="col-span-2 animate-pulse rounded-l-xl bg-muted" />
        <div className="grid gap-1.5">
          <div className="animate-pulse rounded-tr-xl bg-muted" />
          <div className="animate-pulse rounded-br-xl bg-muted" />
        </div>
      </div>
    );
  }
  if (!good.length) return null;

  const shown = good.slice(0, 3);
  const extra = good.length - shown.length;
  const Tile = ({ i, className }: { i: number; className: string }) => (
    <button
      type="button"
      onClick={() => setOpen(i)}
      className={`group/tile relative h-full min-h-0 overflow-hidden bg-muted ${className}`}
      title={good[i].title}
    >
      <img
        src={good[i].thumb}
        alt={good[i].title}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => markBroken(good[i].src)}
        className="size-full object-cover transition-transform duration-300 group-hover/tile:scale-[1.03]"
      />
      {i === shown.length - 1 && extra > 0 && (
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
          <Images className="size-3" /> {good.length}
        </span>
      )}
    </button>
  );

  return (
    <>
      <div
        className={`my-3 grid max-w-xl gap-1.5 overflow-hidden ${shown.length === 1 ? "h-56 grid-cols-1 sm:h-64" : "h-48 grid-cols-3 sm:h-56"}`}
        style={{ gridTemplateRows: "minmax(0, 1fr)" }}
      >
        {shown.length === 1 && <Tile i={0} className="rounded-xl" />}
        {shown.length === 2 && (<><Tile i={0} className="col-span-2 rounded-l-xl" /><Tile i={1} className="rounded-r-xl" /></>)}
        {shown.length === 3 && (
          <>
            <Tile i={0} className="col-span-2 rounded-l-xl" />
            <div className="grid min-h-0 gap-1.5" style={{ gridTemplateRows: "repeat(2, minmax(0, 1fr))" }}>
              <Tile i={1} className="rounded-tr-xl" />
              <Tile i={2} className="rounded-br-xl" />
            </div>
          </>
        )}
      </div>

      {open !== null && good[open] && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{good[open].title}</p>
              <a href={good[open].link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
                {good[open].source} <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/60">{open + 1} / {good.length}</span>
              <button type="button" onClick={() => setOpen(null)} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20" title="Close">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-12 pb-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={good[open].src}
              alt={good[open].title}
              referrerPolicy="no-referrer"
              onError={(e) => { const t = e.currentTarget; if (t.src !== good[open].thumb) t.src = good[open].thumb; }}
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {good.length > 1 && (
              <>
                <button type="button" onClick={() => setOpen((open - 1 + good.length) % good.length)} className="absolute left-2 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" title="Previous">
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" onClick={() => setOpen((open + 1) % good.length)} className="absolute right-2 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" title="Next">
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>
          <div className="flex justify-center gap-1.5 overflow-x-auto px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            {good.map((g, i) => (
              <button key={g.src} type="button" onClick={() => setOpen(i)} className={`size-14 shrink-0 overflow-hidden rounded-md border-2 ${i === open ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}>
                <img src={g.thumb} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------- marker helpers: the model puts [[IMAGES: query]] on the first line ---------- */
const MARKER_RE = /^\s*\[\[\s*IMAGES?\s*:\s*([^\]\n]{2,120})\]\]\s*\n?/i;

/** Split a finished answer into { query, content-without-marker }. */
export function extractImageMarker(content: string): { query?: string; content: string } {
  const m = content.match(MARKER_RE);
  if (!m) return { content };
  return { query: m[1].trim(), content: content.slice(m[0].length) };
}

/** While streaming, hide a marker that is still being typed ("[[IMAG…"). */
export function hideStreamingMarker(content: string): string {
  const full = extractImageMarker(content);
  if (full.query) return full.content;
  return /^\s*\[\[[^\]\n]*\]?$/.test(content) ? "" : content;
}
