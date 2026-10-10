"use client";
// ARPA V3.3 — Shared chat viewer (read-only).
// Shown when the URL has ?share=<token>. Fetches /api/share/[token] and
// renders the thread with a banner. No auth, no composer, no sidebar.
import * as React from "react";
import { ArrowLeft, Share2, AlertTriangle, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, fmtDate, type Chat, type ChatMsg } from "@/lib/arpa-client";
import { Markdown } from "./markdown";
import { MessageBubble } from "./message-bubble";

export function SharedChat({ token }: { token: string }) {
  const [chat, setChat] = React.useState<Chat | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { status, data } = await api<{ ok: boolean; chat?: Chat; error?: string }>(`/api/share/${token}`);
      if (cancelled) return;
      if (status === 200 && data?.ok && data.chat) {
        setChat(data.chat);
      } else {
        setError(data?.error || "Share link could not be loaded");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* header banner */}
      <header className="arpa-glass sticky top-0 z-10 border-b border-border/40">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="grid size-8 place-items-center rounded-lg bg-arpa font-extrabold text-arpa-foreground">A</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{chat?.title || "Shared chat"}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Share2 className="size-3" /> ARPA · public read-only
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <a href="/">
              <ArrowLeft className="mr-1.5 size-3.5" /> Go to ARPA
            </a>
          </Button>
        </div>
      </header>

      {/* body */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-arpa" />
            <p className="text-sm">Loading chat…</p>
          </div>
        )}

        {!loading && error && (
          <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <p className="mt-3 text-sm font-medium text-destructive">{error}</p>
            <Button size="sm" variant="outline" asChild className="mt-4">
              <a href="/">Go to ARPA</a>
            </Button>
          </div>
        )}

        {!loading && chat && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="gap-1.5">
                <MessageSquare className="size-3" /> {chat.msgs.length} messages
              </Badge>
              <span>·</span>
              <span>Updated {fmtDate(chat.at)}</span>
            </div>
            {chat.msgs.map((m: ChatMsg, i) => (
              <MessageBubble key={i} msg={m} isLast={i === chat.msgs.length - 1} />
            ))}
            <div className="mt-8 rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-sm text-muted-foreground">
                This is a shared ARPA chat. To use your own AI assistant, {" "}
                <a href="/" className="font-medium text-arpa hover:underline">go to ARPA</a>.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// keep Markdown import used (avoids tree-shake of styles)
void Markdown;
