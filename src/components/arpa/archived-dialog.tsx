"use client";
// ARPA V3.6 — Archived chats dialog.
// Lists archived chats with restore + delete actions.
import * as React from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Trash2, Loader2, MessageSquare, Bot, Pin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, fmtDate, type Chat } from "@/lib/arpa-client";

export function ArchivedDialog({
  open,
  onOpenChange,
  onRestored,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRestored: (chat: Chat) => void;
  onDeleted: (id: string) => void;
}) {
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { status, data } = await api<{ ok: boolean; chats?: Chat[]; error?: string }>("/api/chats/archived");
    setLoading(false);
    if (status === 200 && data?.ok) setChats(data.chats || []);
  }, []);

  React.useEffect(() => { if (open) load(); }, [open, load]);

  const restore = async (id: string) => {
    setBusyId(id);
    const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/chats/${id}`, {
      method: "PATCH", body: JSON.stringify({ archived: false }),
    });
    setBusyId(null);
    if (status === 200 && data?.ok) {
      const chat = chats.find((c) => c.id === id);
      setChats(chats.filter((c) => c.id !== id));
      if (chat) onRestored(chat);
      toast.success("Chat restored");
    } else {
      toast.error(data?.error || "Restore failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Permanently delete this archived chat?")) return;
    setBusyId(id);
    const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/chats/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (status === 200 && data?.ok) {
      setChats(chats.filter((c) => c.id !== id));
      onDeleted(id);
      toast.success("Chat permanently deleted");
    } else {
      toast.error(data?.error || "Delete failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5 text-arpa" /> Archived chats
          </DialogTitle>
          <DialogDescription>
            {chats.length > 0 ? `${chats.length} archived chat${chats.length !== 1 ? "s" : ""}. Restore or permanently delete them.` : "No archived chats."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!loading && chats.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Archive className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No archived chats found.</p>
          </div>
        )}

        {!loading && chats.length > 0 && (
          <div className="scrollbar-thin max-h-[50vh] space-y-1.5 overflow-y-auto">
            {chats.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/30">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {c.pinned ? <Pin className="size-3 shrink-0 text-arpa" /> : <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(c.at)}{(c.tags?.length || 0) > 0 ? ` · ${c.tags!.join(", ")}` : ""}</p>
                  </div>
                  {c.systemPrompt && <Bot className="size-3 shrink-0 text-arpa" title="Persona active" />}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 text-muted-foreground hover:text-arpa"
                  onClick={() => restore(c.id)}
                  disabled={busyId === c.id}
                  title="Restore"
                >
                  {busyId === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArchiveRestore className="size-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(c.id)}
                  disabled={busyId === c.id}
                  title="Delete permanently"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
