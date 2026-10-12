"use client";
// ARPA V3.7 — chat message bubble with TTS, edit, branch, regen-with-model, reactions, copy-markdown.
import { fmtSize } from "@/lib/file-extract";
import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, RefreshCw, Play, AlertTriangle, Volume2, Square, Loader2, Pencil, GitFork, ChevronDown, ThumbsUp, ThumbsDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "./markdown";
import { settingsStore, type ChatMsg, type Model } from "@/lib/arpa-client";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-2" aria-label="AI typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-muted-foreground"
          style={{ animation: `arpa-blink 1.2s ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  );
}

export function MessageBubble({
  msg,
  isLast,
  onRegen,
  onContinue,
  onCopy,
  onEdit,
  onBranch,
  onReaction,
  models,
  curModel,
  searchQuery,
}: {
  msg: ChatMsg;
  isLast: boolean;
  onRegen?: (modelOverride?: string) => void;
  onContinue?: () => void;
  onCopy?: (text: string) => void;
  onEdit?: (newText: string) => void;
  onBranch?: () => void;
  onReaction?: (reaction: "up" | "down" | null) => void;
  models?: Model[];
  curModel?: string;
  searchQuery?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [ttsState, setTtsState] = React.useState<"idle" | "loading" | "playing">("idle");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  // stop TTS if unmounted or msg changes
  React.useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; } };
  }, []);

  if (msg.role === "user" && !editing) {
    return (
      <div className="group mb-6 flex justify-end animate-msg-in">
        <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[80%]">
          {msg.edited && <span className="px-1 text-[10px] italic text-muted-foreground">edited</span>}
          {(msg.image || msg.thumb) && (
            <img src={msg.image || msg.thumb} alt="attached" className="max-h-56 max-w-[240px] rounded-2xl border border-border object-cover" />
          )}
          {msg.file && (
            <div className="flex max-w-[280px] items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-arpa/15 text-arpa">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={msg.file.name}>{msg.file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {msg.file.pages ? `${msg.file.pages} pages · ` : ""}{msg.file.size ? fmtSize(msg.file.size) : "document"}
                </p>
              </div>
            </div>
          )}
          <div className="whitespace-pre-wrap break-words rounded-2xl bg-[var(--user-bubble)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--user-bubble-foreground)]">
            {msg.content}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {onEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={() => { setDraft(msg.content); setEditing(true); }}
                title="Edit"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => {
                navigator.clipboard.writeText(msg.content).then(() => {
                  setCopied(true); setTimeout(() => setCopied(false), 1400);
                });
              }}
              title="Copy"
            >
              {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            </Button>
            {onBranch && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-arpa"
                onClick={() => onBranch()}
                title="Branch from here"
              >
                <GitFork className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // editing user message inline
  if (msg.role === "user" && editing) {
    return (
      <div className="mb-6 flex justify-end animate-msg-in">
        <div className="flex w-full max-w-[85%] flex-col items-end gap-2 sm:max-w-[80%]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            className="w-full resize-none rounded-2xl border-2 border-arpa bg-[var(--user-bubble)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--user-bubble-foreground)] outline-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-arpa text-arpa-foreground hover:opacity-90"
              onClick={() => {
                const t = draft.trim();
                if (!t) { toast.error("Message is empty"); return; }
                setEditing(false);
                onEdit?.(t);
              }}
            >
              <Check className="mr-1 size-3.5" /> Save & regenerate
            </Button>
          </div>
        </div>
      </div>
    );
  }

  let body: React.ReactNode;
  if (msg.error) {
    body = (
      <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p>{msg.error}</p>
          {(msg.code === "EXPIRED" || msg.code === "LIMIT") && (
            <Button size="sm" className="mt-2 bg-arpa text-arpa-foreground hover:opacity-90" onClick={() => onContinue?.()}>
              View plans
            </Button>
          )}
        </div>
      </div>
    );
  } else if (!msg.content && msg.streaming) {
    body = <TypingDots />;
  } else {
    body = (
      <div className={msg.streaming ? "streaming-cursor" : ""}>
        <Markdown>{msg.content}</Markdown>
      </div>
    );
  }

  // V3.4: in-chat search — wrap matched query in <mark> within the rendered content.
  // We do this by injecting a CSS-driven highlight via a data attribute on the
  // bubble container; the actual text matching uses window.find for native support.
  const searchActive = searchQuery && searchQuery.length >= 2 && msg.content.toLowerCase().includes(searchQuery.toLowerCase());

  const doCopy = () => {
    if (!msg.content) return;
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
    onCopy?.(msg.content);
  };

  // TTS read-aloud — fetch mp3 from /api/tts, play sequentially for long text
  // Browser built-in speech fallback (used when server TTS is not configured)
  const speakBrowser = (text: string, rate: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Read-aloud is not supported in this browser");
      setTtsState("idle");
      return;
    }
    const plain = text
      .replace(/```[\s\S]*?```/g, " code block. ")
      .replace(/[#*_`>|~\[\]()-]+/g, " ")
      .replace(/https?:\/\/\S+/g, " link ");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = Math.min(2, Math.max(0.5, rate || 1));
    // prefer an Indian English / Hindi voice when available
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => /en-IN|hi-IN/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = () => setTtsState("idle");
    u.onerror = () => setTtsState("idle");
    setTtsState("playing");
    window.speechSynthesis.speak(u);
  };

  const speak = async () => {
    if (ttsState === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      try { window.speechSynthesis?.cancel(); } catch {}
      setTtsState("idle");
      return;
    }
    const text = msg.content || "";
    if (!text.trim()) return;
    const settings = settingsStore.get();
    // split into ≤1000 char chunks at sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+|\S+/g) || [text];
    const chunks: string[] = [];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length <= 1000) cur += s;
      else { if (cur) chunks.push(cur); cur = s; }
    }
    if (cur) chunks.push(cur);

    setTtsState("loading");
    const audios: string[] = [];
    try {
      for (const chunk of chunks) {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("arpa_token") || ""}` },
          body: JSON.stringify({ text: chunk, voice: settings.voice, speed: settings.ttsSpeed }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          if (e?.fallback === "browser") { speakBrowser(text, settings.ttsSpeed); return; }
          throw new Error(e?.error || `TTS error ${r.status}`);
        }
        const blob = await r.blob();
        audios.push(URL.createObjectURL(blob));
      }
      // play sequentially
      setTtsState("playing");
      let idx = 0;
      const playNext = () => {
        if (idx >= audios.length) {
          audios.forEach((u) => URL.revokeObjectURL(u));
          audioRef.current = null;
          setTtsState("idle");
          return;
        }
        const a = new Audio(audios[idx]);
        audioRef.current = a;
        a.onended = () => { URL.revokeObjectURL(audios[idx]); idx++; playNext(); };
        a.onerror = () => { audios.forEach((u) => URL.revokeObjectURL(u)); audioRef.current = null; setTtsState("idle"); toast.error("Audio playback failed"); };
        a.play().catch(() => { setTtsState("idle"); toast.error("Audio playback failed"); });
      };
      playNext();
    } catch (e: any) {
      audios.forEach((u) => URL.revokeObjectURL(u));
      setTtsState("idle");
      toast.error(e?.message || "TTS failed");
    }
  };

  const meta = [msg.model, msg.ms ? `${(msg.ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(" · ");

  return (
    <div
      className={`group mb-6 animate-msg-in flex gap-3 ${searchActive ? "rounded-lg ring-2 ring-arpa/40 ring-offset-2 ring-offset-background" : ""}`}
      data-search-hit={searchActive || undefined}
    >
      {/* ARPA avatar on assistant messages */}
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-arpa text-xs font-extrabold text-arpa-foreground shadow-sm">
        A
      </div>
      <div className="min-w-0 flex-1">{body}
      {!msg.streaming && (
        <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[playing]:opacity-100" data-playing={ttsState === "playing" || undefined}>
          {msg.content && (
            <>
              <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-foreground" onClick={doCopy} title="Copy">
                {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={`size-7 ${ttsState === "playing" ? "text-arpa" : "text-muted-foreground hover:text-foreground"}`}
                onClick={speak}
                disabled={ttsState === "loading"}
                title={ttsState === "playing" ? "Stop reading" : "Read aloud"}
              >
                {ttsState === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : ttsState === "playing" ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </Button>
            </>
          )}
          {/* V3.7: message reactions (thumbs up/down) */}
          {onReaction && (
            <div className="ml-1 flex items-center gap-0.5 border-l border-border pl-1.5">
              <Button
                size="icon"
                variant="ghost"
                className={`size-7 ${msg.reaction === "up" ? "text-green-500" : "text-muted-foreground hover:text-green-500"}`}
                onClick={() => onReaction(msg.reaction === "up" ? null : "up")}
                title={msg.reaction === "up" ? "Remove upvote" : "Good response"}
              >
                <ThumbsUp className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={`size-7 ${msg.reaction === "down" ? "text-rose-500" : "text-muted-foreground hover:text-rose-500"}`}
                onClick={() => onReaction(msg.reaction === "down" ? null : "down")}
                title={msg.reaction === "down" ? "Remove downvote" : "Bad response"}
              >
                <ThumbsDown className="size-3.5" />
              </Button>
            </div>
          )}
          {isLast && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-foreground" title="Regenerate">
                  <RefreshCw className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                <DropdownMenuLabel className="text-xs">Regenerate</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onRegen?.()} className="gap-2">
                  <RefreshCw className="size-3.5" /> Same model ({models?.find(m => m.id === curModel)?.label || "default"})
                </DropdownMenuItem>
                {models && models.filter(m => m.id !== curModel).length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Different model</DropdownMenuLabel>
                    {models.filter(m => m.id !== curModel).map(m => (
                      <DropdownMenuItem key={m.id} onSelect={() => onRegen?.(m.id)} className="gap-2">
                        <RefreshCw className="size-3.5" /> {m.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onBranch && (
            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-arpa" onClick={() => onBranch()} title="Branch from here">
              <GitFork className="size-3.5" />
            </Button>
          )}
          {isLast && msg.cut && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onContinue?.()}>
              <Play className="size-3" /> Continue
            </Button>
          )}
          {meta && <span className="ml-auto px-1.5 text-xs text-muted-foreground">{meta}</span>}
        </div>
      )}
      </div>
    </div>
  );
}
