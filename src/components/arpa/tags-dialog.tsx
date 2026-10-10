"use client";
// ARPA V3.3 — Tags manager for a chat.
// Lets user add/remove comma-separated labels. PATCH /api/chats/[id] { tags }.
import * as React from "react";
import { toast } from "sonner";
import { Tag, Plus, X, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, type Chat } from "@/lib/arpa-client";

const SUGGESTED = ["work", "personal", "finance", "coding", "study", "email", "important"];

export function TagsDialog({
  open,
  onOpenChange,
  chat,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chat: Chat | null;
  onUpdated: (tags: string[]) => void;
}) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [input, setInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && chat) setTags(chat.tags || []);
    setInput("");
  }, [open, chat]);

  const addTag = (t: string) => {
    const clean = t.trim().toLowerCase().replace(/[^a-z0-9\- ]/g, "").trim();
    if (!clean) return;
    if (tags.includes(clean)) return;
    if (tags.length >= 5) { toast.error("Maximum 5 tags allowed"); return; }
    setTags([...tags, clean]);
    setInput("");
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const save = async () => {
    if (!chat) return;
    setSaving(true);
    const { status, data } = await api<{ ok: boolean; tags?: string[]; error?: string }>(`/api/chats/${chat.id}`, {
      method: "PATCH", body: JSON.stringify({ tags: tags.join(",") }),
    });
    setSaving(false);
    if (status === 200 && data?.ok) {
      onUpdated(data.tags || []);
      onOpenChange(false);
      toast.success("Tags saved");
    } else {
      toast.error(data?.error || "Tags could not be saved");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5 text-arpa" /> Chat tags
          </DialogTitle>
          <DialogDescription>
            Label your chats (max 5). You can filter by tag in the sidebar.
          </DialogDescription>
        </DialogHeader>

        {/* current tags */}
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
          {tags.length === 0 && <span className="px-1.5 text-xs text-muted-foreground">No tags yet</span>}
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1.5">
              {t}
              <button onClick={() => removeTag(t)} className="rounded-full p-0.5 hover:bg-muted-foreground/30" aria-label={`Remove ${t}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>

        {/* add input */}
        <form
          onSubmit={(e) => { e.preventDefault(); addTag(input); }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="new tag…"
            className="text-sm"
            maxLength={20}
          />
          <Button type="submit" size="icon" className="shrink-0 bg-arpa text-arpa-foreground hover:opacity-90" disabled={!input.trim() || tags.length >= 5}>
            <Plus className="size-4" />
          </Button>
        </form>

        {/* suggested */}
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Suggested:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.filter((s) => !tags.includes(s)).map((s) => (
              <button
                key={s}
                onClick={() => addTag(s)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving} className="bg-arpa text-arpa-foreground hover:opacity-90">
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Check className="mr-1.5 size-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
