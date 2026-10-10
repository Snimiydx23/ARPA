"use client";
// ARPA V3.5 — Chat settings dialog (persona/system prompt + archive).
import * as React from "react";
import { toast } from "sonner";
import { Bot, Archive, ArchiveRestore, Save, Loader2, Sparkles, Eraser } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api, type Chat } from "@/lib/arpa-client";

const PRESETS = [
  { id: "tax", label: "Tax expert", prompt: "You are an expert Indian tax consultant. Give accurate, practical advice on income tax, GST, and corporate tax matters. Cite relevant sections when possible. Always recommend consulting a CA for final decisions." },
  { id: "coder", label: "Code mentor", prompt: "You are a senior software engineer and patient mentor. Explain code clearly with examples. Prefer clean, well-commented, production-ready solutions. Point out edge cases and best practices." },
  { id: "writer", label: "Copy writer", prompt: "You are a professional copywriter. Write engaging, concise, and persuasive content. Adapt tone to the target audience. Use active voice and strong verbs." },
  { id: "teacher", label: "Teacher", prompt: "You are a friendly teacher who explains complex topics in simple terms using analogies and examples. Check for understanding and build knowledge step by step." },
  { id: "doctor", label: "Health advisor", prompt: "You are a helpful health information assistant. Provide general wellness information but ALWAYS recommend consulting a qualified doctor for medical decisions. Never prescribe medicines." },
  { id: "lawyer", label: "Legal advisor", prompt: "You are an Indian legal advisor. Give general legal information about Indian law. Always recommend consulting a qualified lawyer for specific legal action. Cite relevant acts/sections when possible." },
];

export function ChatSettingsDialog({
  open,
  onOpenChange,
  chat,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chat: Chat | null;
  onUpdated: (patch: Partial<Chat>) => void;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && chat) setPrompt(chat.systemPrompt || "");
  }, [open, chat]);

  const chatId = chat?.id;

  const save = async () => {
    if (!chatId) return;
    setSaving(true);
    const { status, data } = await api<{ ok: boolean; systemPrompt?: string; error?: string }>(`/api/chats/${chatId}`, {
      method: "PATCH", body: JSON.stringify({ systemPrompt: prompt }),
    });
    setSaving(false);
    if (status === 200 && data?.ok) {
      onUpdated({ systemPrompt: data.systemPrompt || "" });
      onOpenChange(false);
      toast.success("Persona saved");
    } else {
      toast.error(data?.error || "Save failed");
    }
  };

  const toggleArchive = async (archive: boolean) => {
    if (!chatId) return;
    setSaving(true);
    const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/chats/${chatId}`, {
      method: "PATCH", body: JSON.stringify({ archived: archive }),
    });
    setSaving(false);
    if (status === 200 && data?.ok) {
      onUpdated({ archived: archive });
      toast.success(archive ? "Chat archived" : "Chat restored");
      onOpenChange(false);
    } else {
      toast.error(data?.error || "Archive failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-arpa" /> Chat persona & settings
          </DialogTitle>
          <DialogDescription>
            Customize ARPA's persona/instructions for this chat. Pick a preset or write your own.
          </DialogDescription>
        </DialogHeader>

        {/* presets */}
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Quick presets</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPrompt(p.prompt)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-arpa-soft hover:text-arpa"
              >
                <Sparkles className="size-3" /> {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* prompt textarea */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="persona" className="text-xs font-medium text-muted-foreground">Custom persona / instructions</Label>
            {prompt && (
              <button onClick={() => setPrompt("")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive">
                <Eraser className="size-3" /> Clear
              </button>
            )}
          </div>
          <Textarea
            id="persona"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. You are a helpful tax expert. Answer in English. Always cite sections…"
            rows={4}
            maxLength={2000}
            className="text-sm"
          />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">{prompt.length}/2000</p>
        </div>

        {prompt && (
          <div className="rounded-lg bg-arpa-soft px-3 py-2 text-xs text-arpa">
            <Sparkles className="mr-1 inline size-3" />
            Active: ARPA will follow these instructions in this chat
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {chat?.archived ? (
            <Button variant="outline" size="sm" onClick={() => toggleArchive(false)} disabled={saving} className="mr-auto">
              <ArchiveRestore className="mr-1.5 size-3.5" /> Restore
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => toggleArchive(true)} disabled={saving} className="mr-auto">
              <Archive className="mr-1.5 size-3.5" /> Archive
            </Button>
          )}
          <Button onClick={save} disabled={saving} className="bg-arpa text-arpa-foreground hover:opacity-90">
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
