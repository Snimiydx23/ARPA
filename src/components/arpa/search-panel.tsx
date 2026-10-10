"use client";
// ARPA V3.2 — Web search panel (slide-over).
// Triggered from composer Globe button. Searches the web via /api/search and
// inserts chosen result snippets (with source URL) into the composer.
import * as React from "react";
import { toast } from "sonner";
import { Search, Loader2, Globe, ExternalLink, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type AppConfig } from "@/lib/arpa-client";

type Result = {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  date: string;
  favicon: string;
  rank: number;
};

export function SearchPanel({
  open,
  onOpenChange,
  config,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: AppConfig;
  onPick: (text: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<Result[]>([]);

  const doSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setResults([]);
    try {
      const { status, data } = await api<{ ok: boolean; results?: Result[]; error?: string }>(
        "/api/search",
        { method: "POST", body: JSON.stringify({ query, num: 6 }) }
      );
      if (status !== 200 || !data?.ok) {
        toast.error(data?.error || "Search failed");
        return;
      }
      setResults(data.results || []);
    } catch (e: any) {
      toast.error(e?.message || "Search error");
    } finally {
      setLoading(false);
    }
  };

  const insert = (r: Result) => {
    const text = `**Source:** [${r.name}](${r.url})\n${r.snippet}\n\nSummarize this and its implications in English.`;
    onPick(text);
    onOpenChange(false);
    toast.success("Result added to the composer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-5 text-arpa" /> Live web search
          </DialogTitle>
          <DialogDescription>
            Find the latest information and send it straight into the chat. (powered by z-ai web_search)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={doSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Today's news, latest rates, live info…"
              className="pl-9"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={loading || !q.trim()} className="bg-arpa text-arpa-foreground hover:opacity-90">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </form>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto scrollbar-thin">
          {loading && results.length === 0 && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}
          {!loading && results.length === 0 && q.trim() && (
            <p className="py-6 text-center text-sm text-muted-foreground">No results found.</p>
          )}
          {!loading && results.length === 0 && !q.trim() && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Enter a query above, or try: "todaySensex", "India vs Australia score", "GST rate 2026"
            </p>
          )}
          {results.map((r, i) => (
            <div key={i} className="group rounded-xl border border-border p-3 transition-colors hover:border-arpa/40 hover:bg-muted/30">
              <div className="flex items-start gap-2">
                {r.favicon ? (
                   
                  <img src={r.favicon} alt="" className="mt-0.5 size-4 rounded" referrerPolicy="no-referrer" />
                ) : (
                  <Globe className="mt-0.5 size-4 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-sm hover:text-arpa hover:underline">
                    <span className="truncate">{r.name}</span>
                    <ExternalLink className="size-3 shrink-0 opacity-50" />
                  </a>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.host_name}{r.date ? ` · ${r.date}` : ""}</p>
                  <p className="mt-1.5 text-sm text-foreground/90 line-clamp-3">{r.snippet}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => insert(r)}>
                      <Plus className="size-3" /> Add to chat
                    </Button>
                    <Badge variant="secondary" className="h-7 text-xs">#{r.rank}</Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
