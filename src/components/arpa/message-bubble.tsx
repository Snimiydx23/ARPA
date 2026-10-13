"use client";
// ARPA V3.7 — chat message bubble with TTS, edit, branch, regen-with-model, reactions, copy-markdown.
import { fmtSize } from "@/lib/file-extract";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Check, Copy, RefreshCw, Play, AlertTriangle, Volume2, Square, Loader2, Pencil, GitFork, ChevronDown, ThumbsUp, ThumbsDown, FileText, FileDown, Wand2, Download, Maximize2, X } from "lucide-react";
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
import { ImageGallery, hideStreamingMarker } from "./image-gallery";
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
  wantsDoc,
  docFallbackTitle,
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
  wantsDoc?: boolean; // previous user message asked for a document → show download buttons prominently
  docFallbackTitle?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [ttsState, setTtsState] = React.useState<"idle" | "loading" | "playing">("idle");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [docBusy, setDocBusy] = React.useState<"" | "docx" | "pdf">("");

  // Word / PDF download of this answer
  const downloadDoc = async (format: "docx" | "pdf") => {
    if (!msg.content || docBusy) return;
    setDocBusy(format);
    try {
      const { downloadAnswer, titleFromMarkdown } = await import("@/lib/doc-export");
      const hasHeading = /^#{1,3}\s+/m.test(msg.content);
      await downloadAnswer(format, msg.content, hasHeading ? titleFromMarkdown(msg.content) : (docFallbackTitle || titleFromMarkdown(msg.content)));
      toast.success(format === "docx" ? "Word file downloaded ✓" : "PDF downloaded ✓");
    } catch (e: any) {
      toast.error(e?.message || "Could not create the file");
    } finally {
      setDocBusy("");
    }
  };

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
  } else if (msg.generating && msg.streaming) {
    // AI image being generated
    body = (
      <div className="flex flex-col gap-2">
        <div className="relative grid aspect-square w-full max-w-sm place-items-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-arpa/10 via-muted to-cyan-500/10">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/5" />
          <div className="relative flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Wand2 className="size-7 animate-bounce text-arpa" />
            Creating your image…
          </div>
        </div>
      </div>
    );
  } else if (!msg.content && msg.streaming) {
    body = <TypingDots />;
  } else {
    // ChatGPT-style: related images appear right after the first paragraph of the answer
    const shown = msg.streaming ? hideStreamingMarker(msg.content) : msg.content;
    let head = shown, rest = "";
    if (msg.imgQuery && !msg.streaming) {
      const cut = shown.search(/\n\s*\n/);
      if (cut > 0 && !/^\s*(\||```|#)/.test(shown)) { head = shown.slice(0, cut); rest = shown.slice(cut); }
      else { head = ""; rest = shown; }
    }
    body = (
      <div className={msg.streaming ? "streaming-cursor" : ""}>
        {msg.genImage && <GeneratedImageCard img={msg.genImage} />}
        {head && <Markdown>{head}</Markdown>}
        {msg.imgQuery && !msg.streaming && <ImageGallery query={msg.imgQuery} />}
        {rest && <Markdown>{rest}</Markdown>}
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
      {/* prominent Word / PDF buttons when the user asked for a document */}
      {!msg.streaming && wantsDoc && msg.content && !msg.error && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={() => downloadDoc("docx")} disabled={!!docBusy}>
            {docBusy === "docx" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5 text-blue-600" />} Download Word
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={() => downloadDoc("pdf")} disabled={!!docBusy}>
            {docBusy === "pdf" ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5 text-rose-600" />} Download PDF
          </Button>
        </div>
      )}
      {!msg.streaming && (
        <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[playing]:opacity-100" data-playing={ttsState === "playing" || !!docBusy || undefined}>
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
              {/* download this answer as Word / PDF */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-foreground" title="Download as Word / PDF" disabled={!!docBusy}>
                    {docBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  <DropdownMenuLabel className="text-xs">Download this answer</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => downloadDoc("docx")} className="gap-2">
                    <FileText className="size-3.5 text-blue-600" /> Word (.docx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => downloadDoc("pdf")} className="gap-2">
                    <FileDown className="size-3.5 text-rose-600" /> PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

/* ---------- AI-generated image (NVIDIA FLUX) ---------- */
function GeneratedImageCard({ img }: { img: NonNullable<ChatMsg["genImage"]> }) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const ratio = `${img.width} / ${img.height}`;
  const portrait = img.height > img.width;
  React.useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);
  if (failed) {
    return <p className="mb-2 text-sm text-muted-foreground">⚠️ This image is no longer available.</p>;
  }
  return (
    <div className={`group/gen relative mb-3 overflow-hidden rounded-2xl border border-border bg-muted ${portrait ? "max-w-[300px]" : "max-w-md"}`} style={{ aspectRatio: ratio }}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
      <img
        src={img.url}
        alt={img.prompt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        onClick={() => setFull(true)}
        className={`size-full cursor-zoom-in object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover/gen:opacity-100">
        <button type="button" onClick={() => setFull(true)} className="grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80" title="View full size">
          <Maximize2 className="size-4" />
        </button>
        <a href={`${img.url}?download=1`} download className="grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80" title="Download image">
          <Download className="size-4" />
        </a>
      </div>
      {full && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-3 bg-black/90 p-4" onClick={() => setFull(false)}>
          <img src={img.url} alt={img.prompt} className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a href={`${img.url}?download=1`} download className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
              <Download className="size-4" /> Download
            </a>
            <button type="button" onClick={() => setFull(false)} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25">
              <X className="size-4" /> Close
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
