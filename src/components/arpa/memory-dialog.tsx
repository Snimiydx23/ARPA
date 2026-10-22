"use client";
// ARPA — Memory manager: turn memory on/off, view, add, edit, delete, clear all.
import * as React from "react";
import { toast } from "sonner";
import { Brain, Loader2, Plus, Trash2, Pencil, Check, X, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, type MemoryItem } from "@/lib/arpa-client";

export function MemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [enabled, setEnabled] = React.useState(true);
  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { status, data } = await api<{ ok: boolean; enabled: boolean; items: MemoryItem[] }>("/api/memory");
      if (status === 200 && data?.ok) { setEnabled(data.enabled); setItems(data.items); }
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (open) load(); }, [open, load]);

  const toggle = async (v: boolean) => {
    setEnabled(v);
    const { status } = await api("/api/memory", { method: "PATCH", body: JSON.stringify({ enabled: v }) });
    if (status !== 200) { setEnabled(!v); toast.error("Could not change memory setting"); return; }
    toast.success(v ? "Memory turned on" : "Memory turned off — ARPA won't use or suggest memories");
  };

  const add = async () => {
    const content = draft.trim();
    if (content.length < 2) return;
    const { status, data } = await api<{ ok: boolean; duplicate?: boolean; error?: string }>("/api/memory", { method: "POST", body: JSON.stringify({ content }) });
    if (status !== 200 || !data?.ok) { toast.error(data?.error || "Could not save"); return; }
    setDraft("");
    toast.success(data.duplicate ? "Already remembered" : "Saved to memory");
    load();
  };

  const saveEdit = async () => {
    if (!editId) return;
    const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/memory/${editId}`, { method: "PATCH", body: JSON.stringify({ content: editText }) });
    if (status !== 200 || !data?.ok) { toast.error(data?.error || "Could not update"); return; }
    setItems((x) => x.map((i) => (i.id === editId ? { ...i, content: editText.trim() } : i)));
    setEditId(null);
  };

  const remove = async (id: string) => {
    const { status } = await api(`/api/memory/${id}`, { method: "DELETE" });
    if (status === 200) setItems((x) => x.filter((i) => i.id !== id));
    else toast.error("Could not delete");
  };

  const clearAll = async () => {
    if (!confirm("Delete ALL memories? This cannot be undone.")) return;
    const { status } = await api("/api/memory", { method: "DELETE" });
    if (status === 200) { setItems([]); toast.success("All memories deleted"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Brain className="size-5 text-arpa" /> Memory</DialogTitle>
          <DialogDescription>
            ARPA can remember facts you choose to save (your role, company, preferences) and use them in every chat.
            Nothing is saved without your confirmation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3">
          <div>
            <p className="text-sm font-medium">Use memory</p>
            <p className="text-xs text-muted-foreground">When off, saved memories are ignored and no new ones are suggested.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} aria-label="Use memory" />
        </div>

        <div className="flex gap-2">
          <Input value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder='e.g. "I am a CA at RMA FINANCE, prefer answers in Hinglish"' />
          <Button onClick={add} disabled={draft.trim().length < 2} className="shrink-0 bg-arpa text-arpa-foreground hover:opacity-90">
            <Plus className="size-4" />
          </Button>
        </div>

        {loading ? (
          <div className="grid h-24 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No memories yet. Tell ARPA something about yourself — it will ask before saving.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((m) => (
              <li key={m.id} className="flex items-start gap-2 px-3 py-2.5">
                {m.source === "ai" ? <Sparkles className="mt-0.5 size-3.5 shrink-0 text-arpa" aria-label="Suggested by ARPA" /> : <Brain className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                {editId === m.id ? (
                  <>
                    <Input autoFocus value={editText} maxLength={500} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }} className="h-8 flex-1" />
                    <Button size="icon" variant="ghost" className="size-8" onClick={saveEdit} aria-label="Save"><Check className="size-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditId(null)} aria-label="Cancel"><X className="size-4" /></Button>
                  </>
                ) : (
                  <>
                    <p className="flex-1 text-sm">{m.content}</p>
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => { setEditId(m.id); setEditText(m.content); }} aria-label="Edit memory">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => remove(m.id)} aria-label="Delete memory">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <Button variant="ghost" className="self-start text-destructive hover:text-destructive" onClick={clearAll}>
            <Trash2 className="mr-1.5 size-4" /> Clear all memories
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
