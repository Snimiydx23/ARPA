"use client";
// ARPA V3.3 — Command palette (Cmd/Ctrl+/).
// Quick actions: new chat, open settings, open stats, open plans, theme toggle,
// search chats by title, jump to a chat.
import * as React from "react";
import { Search, Plus, Settings2, BarChart3, Sparkles, Moon, Sun, MessageSquare, Pin, Command } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useArpa } from "@/lib/store";
import type { Chat } from "@/lib/arpa-client";

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Actions" | "Navigate";
  run: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  onNewChat,
  onSettings,
  onStats,
  onPlans,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onNewChat: () => void;
  onSettings: () => void;
  onStats: () => void;
  onPlans: () => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const chats = useArpa((s) => s.chats);
  const setCurId = useArpa((s) => s.setCurId);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(0);

  React.useEffect(() => { if (open) { setQ(""); setSel(0); } }, [open]);

  const actions: Action[] = [
    { id: "new", label: "New chat", hint: "Ctrl+K", icon: Plus, group: "Actions", run: () => { onNewChat(); onOpenChange(false); } },
    { id: "settings", label: "Open settings", icon: Settings2, group: "Actions", run: () => { onSettings(); onOpenChange(false); } },
    { id: "stats", label: "My usage", icon: BarChart3, group: "Actions", run: () => { onStats(); onOpenChange(false); } },
    { id: "plans", label: "Upgrade / View plans", icon: Sparkles, group: "Actions", run: () => { onPlans(); onOpenChange(false); } },
    {
      id: "theme",
      label: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      icon: resolvedTheme === "dark" ? Sun : Moon,
      group: "Actions",
      run: () => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); onOpenChange(false); },
    },
  ];

  const navigate: Action[] = chats.slice(0, 30).map((c: Chat) => ({
    id: "chat-" + c.id,
    label: c.title,
    hint: c.pinned ? "pinned" : undefined,
    icon: c.pinned ? Pin : MessageSquare,
    group: "Navigate",
    run: () => { setCurId(c.id); onOpenChange(false); },
  }));

  const all = [...actions, ...navigate];
  const filtered = React.useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return all;
    return all.filter((a) => a.label.toLowerCase().includes(k));
  }, [all, q]);

  React.useEffect(() => { setSel(0); }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); filtered[sel]?.run(); }
  };

  // group filtered by group
  const groups = React.useMemo(() => {
    const m = new Map<string, Action[]>();
    for (const a of filtered) {
      if (!m.has(a.group)) m.set(a.group, []);
      m.get(a.group)!.push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  let runningIdx = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" onKeyDown={onKey}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Quickly run actions or jump to chats.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search chats…"
            className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">ESC</kbd>
        </div>
        <div className="scrollbar-thin max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results found</p>
          )}
          {groups.map(([group, items]) => (
            <div key={group} className="mb-1">
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
              {items.map((a) => {
                runningIdx++;
                const idx = runningIdx;
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => a.run()}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${idx === sel ? "bg-arpa-soft text-arpa" : "hover:bg-muted"}`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{a.label}</span>
                    {a.hint && <span className="text-[10px] text-muted-foreground">{a.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Command className="size-3" /> ARPA palette</span>
          <span>↑↓ navigate · ↵ select</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
