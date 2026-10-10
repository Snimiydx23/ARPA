"use client";
// ARPA V3.8 — Prompt templates library dialog.
// Browse 8 builtin templates + save/edit/delete custom ones.
// Clicking a template inserts it into the composer (not auto-send).
import * as React from "react";
import { toast } from "sonner";
import { Bookmark, Plus, Trash2, Save, Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { templatesStore, type PromptTemplate } from "@/lib/arpa-client";

export function TemplatesDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (text: string) => void;
}) {
  const [templates, setTemplates] = React.useState<PromptTemplate[]>([]);
  const [q, setQ] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newBody, setNewBody] = React.useState("");
  const [newIcon, setNewIcon] = React.useState("📝");

  const refresh = () => setTemplates(templatesStore.get());
  React.useEffect(() => { if (open) { refresh(); setQ(""); setShowAdd(false); } }, [open]);

  const filtered = React.useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return templates;
    return templates.filter((t) => t.title.toLowerCase().includes(k) || t.body.toLowerCase().includes(k));
  }, [templates, q]);

  const pick = (t: PromptTemplate) => {
    onPick(t.body);
    onOpenChange(false);
    toast.success(`"${t.title}" added to the composer`);
  };

  const saveNew = () => {
    if (!newTitle.trim() || !newBody.trim()) {
      toast.error("Both a title and a prompt are required");
      return;
    }
    templatesStore.add({ title: newTitle.trim(), body: newBody.trim(), icon: newIcon || "📝" });
    setNewTitle(""); setNewBody(""); setNewIcon("📝"); setShowAdd(false);
    refresh();
    toast.success("Template saved");
  };

  const removeCustom = (id: string) => {
    templatesStore.remove(id);
    refresh();
    toast.success("Template deleted");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="size-5 text-arpa" /> Prompt templates
          </DialogTitle>
          <DialogDescription>
            Builtin and custom prompts. Click to insert one into the composer, then edit the [brackets].
          </DialogDescription>
        </DialogHeader>

        {/* search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates…"
            className="h-8 pl-9 text-sm"
          />
        </div>

        {/* templates list */}
        <div className="scrollbar-thin max-h-[45vh] space-y-1.5 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No results found</p>
          )}
          {filtered.map((t) => (
            <div key={t.id} className="group flex items-start gap-2.5 rounded-lg border border-border p-2.5 transition-colors hover:border-arpa/40 hover:bg-muted/30">
              <button onClick={() => pick(t)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                <span className="text-lg leading-none">{t.icon || "📝"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.body.slice(0, 80)}...</p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {t.builtin ? (
                  <Badge variant="secondary" className="text-[9px]">builtin</Badge>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={() => removeCustom(t.id)}
                    title="Delete"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* add custom template */}
        {!showAdd ? (
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="size-3.5" /> Add custom template
          </Button>
        ) : (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">New template</span>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => setShowAdd(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                placeholder="🎨"
                className="h-8 w-14 text-center text-lg"
                maxLength={2}
              />
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Template title"
                className="h-8 flex-1 text-sm"
                maxLength={40}
              />
            </div>
            <Textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Prompt body… [use brackets for fill-in fields]"
              rows={3}
              className="text-sm"
              maxLength={1000}
            />
            <p className="text-right text-[10px] text-muted-foreground">{newBody.length}/1000</p>
            <Button onClick={saveNew} size="sm" className="w-full bg-arpa text-arpa-foreground hover:opacity-90">
              <Save className="mr-1.5 size-3.5" /> Save template
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
