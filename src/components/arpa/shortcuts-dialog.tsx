"use client";
// ARPA V3.5 — Keyboard shortcuts help dialog (? key).
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], action: "New chat" },
  { keys: ["Ctrl", "/"], action: "Command palette" },
  { keys: ["Ctrl", "F"], action: "Search in chat" },
  { keys: ["?"], action: "This help" },
  { keys: ["Enter"], action: "Send message" },
  { keys: ["Shift", "Enter"], action: "New line" },
  { keys: ["Esc"], action: "Close dialog / search" },
  { keys: ["↑", "↓"], action: "Navigate palette / matches" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5 text-arpa" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Use ARPA faster with the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <span className="text-sm text-foreground">{s.action}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
