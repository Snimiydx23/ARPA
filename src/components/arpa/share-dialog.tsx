"use client";
// ARPA V3.3 — Share chat dialog.
// Generates a public read-only share link via PATCH /api/chats/[id] { share: true }.
// Copies link to clipboard. Also offers "unshare" to revoke.
import * as React from "react";
import { toast } from "sonner";
import { Share2, Copy, Check, Loader2, Link2, XCircle, ExternalLink } from "lucide-react";
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

export function ShareDialog({
  open,
  onOpenChange,
  chat,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chat: Chat | null;
  onUpdated: (c: Partial<Chat>) => void;
}) {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const chatId = chat?.id;

  React.useEffect(() => {
    if (!open || !chatId) { setToken(null); return; }
    let cancelled = false;
    setLoading(true);
    api<{ ok: boolean; shareToken?: string; error?: string }>(`/api/chats/${chatId}`, {
      method: "PATCH", body: JSON.stringify({ share: true }),
    }).then(({ status, data }) => {
      if (cancelled) return;
      setLoading(false);
      if (status === 200 && data?.ok && data.shareToken) {
        setToken(data.shareToken);
        onUpdated({ shared: true });
      } else {
        toast.error(data?.error || "Share link could not be created");
      }
    }).catch(() => { if (!cancelled) { setLoading(false); toast.error("Network error"); } });
    return () => { cancelled = true; };
  }, [open, chatId]);

  const link = token ? `${window.location.origin}/?share=${token}` : "";
  const isShared = !!token;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed — please select the link and copy manually");
    }
  };

  const revoke = async () => {
    if (!chat) return;
    setLoading(true);
    const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/chats/${chat.id}`, {
      method: "PATCH", body: JSON.stringify({ share: false }),
    });
    setLoading(false);
    if (status === 200 && data?.ok) {
      setToken(null);
      onUpdated({ shared: false });
      toast.success("Share link revoked");
      onOpenChange(false);
    } else {
      toast.error(data?.error || "Revoke failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-arpa" /> Share chat
          </DialogTitle>
          <DialogDescription>
            Creates a public read-only link. Anyone with the link can view it — but cannot edit it.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!loading && isShared && (
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-arpa" />
                <Input readOnly value={link} className="text-sm" onFocus={(e) => e.target.select()} />
                <Button size="icon" onClick={copy} className="shrink-0 bg-arpa text-arpa-foreground hover:opacity-90">
                  {copied ? <Check className="size-4 text-green-300" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-green-500" /> Public · active
                </span>
                <Badge variant="secondary" className="text-xs">Read-only</Badge>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="mr-auto">
                Done
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 size-3.5" /> Preview
                </a>
              </Button>
              <Button variant="destructive" size="sm" onClick={revoke} disabled={loading}>
                <XCircle className="mr-1.5 size-3.5" /> Revoke
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
