"use client";
// ARPA V3.10 — Global chat search dialog.
// Searches across all chats via GET /api/chats/search?q=...
// Shows matching messages with snippet + chat title + date.
import * as React from "react";
import { toast } from "sonner";
import { Search, Loader2, MessageSquare, Pin, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, fmtDate } from "@/lib/arpa-client";

type Hit = {
  chatId: string;
  chatTitle: string;
  chatAt: number;
  msgIdx: number;
  role: string;
  snippet: string;
  pinned: boolean;
};

function highlight(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-arpa/30 px-0.5 text-foreground">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  onPickChat,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPickChat: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Hit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) { setQ(""); setResults([]); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [open]);

  // debounce search
  React.useEffect(() => {
    if (!open || q.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { status, data } = await api<{ ok: boolean; results?: Hit[]; error?: string }>(
        `/api/chats/search?q=${encodeURIComponent(q.trim())}`
      );
      if (cancelled) return;
      setLoading(false);
      if (status === 200 && data?.ok) setResults(data.results || []);
      else setResults([]);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const pick = (hit: Hit) => {
    onPickChat(hit.chatId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" onKeyDown={(e) => { if (e.key === "Escape") onOpenChange(false); }}>
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">Search across all your chats.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search across all chats…"
            className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2">
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No results found. Try two or more letters.</p>
          )}
          {q.trim().length < 2 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Please type at least 2 letters…</p>
          )}
          {results.map((hit, i) => (
            <button
              key={i}
              onClick={() => pick(hit)}
              className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                {hit.pinned ? <Pin className="size-3.5 text-arpa" /> : <MessageSquare className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{highlight(hit.chatTitle, q)}</p>
                  {hit.role === "title" && <Badge variant="secondary" className="shrink-0 text-[9px]">title</Badge>}
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{fmtDate(hit.chatAt)}</span>
                </div>
                {hit.role !== "title" && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">{hit.role === "user" ? "You: " : "ARPA: "}</span>
                    {highlight(hit.snippet, q)}
                  </p>
                )}
              </div>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
        {results.length > 0 && (
          <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            {results.length} match{results.length !== 1 ? "es" : ""} found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// keep import used
void fmtDate;
