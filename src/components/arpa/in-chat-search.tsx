"use client";
// ARPA V3.4 — In-chat search bar.
// Slides down from the top bar. Searches within the current chat's messages.
// Highlights matching messages (via searchQuery prop → MessageBubble ring) and
// uses the browser's native window.find for text highlighting within the thread.
import * as React from "react";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InChatSearch({
  open,
  query,
  onQuery,
  onClose,
  matchCount,
  curMatch,
  onPrev,
  onNext,
}: {
  open: boolean;
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
  matchCount: number;
  curMatch: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) onPrev(); else onNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!open) return null;

  return (
    <div className="absolute left-1/2 top-2 z-30 flex w-[min(92%,480px)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card p-1.5 pl-3 shadow-lg">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search in this chat…"
        className="h-7 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
      {query && (
        <span className="shrink-0 px-1.5 text-xs tabular-nums text-muted-foreground">
          {matchCount > 0 ? `${curMatch + 1}/${matchCount}` : "0/0"}
        </span>
      )}
      <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onPrev} disabled={matchCount === 0} title="Previous (Shift+Enter)">
        <ChevronUp className="size-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onNext} disabled={matchCount === 0} title="Next (Enter)">
        <ChevronDown className="size-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onClose} title="Close (Esc)">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
