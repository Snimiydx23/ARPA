"use client";
// ARPA V3.2 — chat composer with voice input, image attach, web search, settings.
import * as React from "react";
import { toast } from "sonner";
import { ArrowUp, Square, Lock, Mic, Settings2, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/arpa-client";
import { ImageAttach } from "./image-attach";

export function Composer({
  busy,
  disabled,
  locked,
  lockText,
  lockSub,
  onSend,
  onStop,
  onPlans,
  onSettings,
  onSearch,
}: {
  busy: boolean;
  disabled: boolean;
  locked: boolean;
  lockText: string;
  lockSub: string;
  onSend: (text: string) => void;
  onStop: () => void;
  onPlans: () => void;
  onSettings: () => void;
  onSearch: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const mediaRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  };

  React.useEffect(() => { grow(); }, [value]);

  // V3.8: listen for template-insert events from the TemplatesDialog
  React.useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text === "string" && text) {
        setValue(text);
        requestAnimationFrame(() => {
          const ta = taRef.current;
          if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
          grow();
        });
      }
    };
    window.addEventListener("arpa-insert-text", handler);
    return () => window.removeEventListener("arpa-insert-text", handler);
  }, []);

  const submit = () => {
    const t = value.trim();
    if (!t || busy) return;
    onSend(t);
    setValue("");
    requestAnimationFrame(grow);
  };

  // helper to insert text at cursor / append
  const insertText = (text: string) => {
    setValue((v) => {
      const ta = taRef.current;
      if (!ta) return v ? v + "\n\n" + text : text;
      const start = ta.selectionStart ?? v.length;
      const end = ta.selectionEnd ?? v.length;
      const next = v.slice(0, start) + (start > 0 && v[start - 1] !== "\n" ? "\n" : "") + text + v.slice(end);
      requestAnimationFrame(() => { ta.focus(); const pos = start + text.length + 1; ta.setSelectionRange(pos, pos); grow(); });
      return next;
    });
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Your browser does not support microphone input.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/mp3") ? "audio/mp3" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) { setTranscribing(false); return; }
        const b64 = await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onloadend = () => { const s = String(fr.result || ""); res(s.split(",")[1] || ""); };
          fr.readAsDataURL(blob);
        });
        setTranscribing(true);
        try {
          const { status, data } = await api<{ ok: boolean; text?: string; error?: string }>(
            "/api/asr",
            { method: "POST", body: JSON.stringify({ audio: b64 }) }
          );
          if (status === 200 && data?.ok && data.text) {
            setValue((v) => (v ? v + " " : "") + data.text);
            requestAnimationFrame(grow);
            toast.success("Voice → text ✓");
          } else {
            toast.error(data?.error || "Could not transcribe voice");
          }
        } catch (e: any) {
          toast.error(e?.message || "ASR error");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
    } catch (e: any) {
      toast.error(e?.name === "NotAllowedError" ? "Mic permission denied." : "Could not start microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    setRecording(false);
  };

  if (locked) {
    return (
      <div className="px-3 pb-3 sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3.5 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3.5 dark:border-amber-500/30 dark:bg-amber-950/30">
          <Lock className="size-6 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{lockText}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">{lockSub}</p>
          </div>
          <Button onClick={onPlans} className="bg-arpa text-arpa-foreground hover:opacity-90">
            View plans
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-3 pb-3 sm:px-4">
      <div className="mx-auto flex max-w-3xl items-end gap-1.5 rounded-[26px] border border-border bg-card px-2.5 py-2 shadow-sm focus-within:ring-2 focus-within:ring-arpa">
        {/* settings gear (left) */}
        <Button
          onClick={onSettings}
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          title="Settings"
        >
          <Settings2 className="size-4" />
        </Button>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 820) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={transcribing ? "Transcribing…" : recording ? "🎤 Recording… keep speaking" : "Ask ARPA anything"}
          className="max-h-60 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        {/* web search */}
        <Button
          onClick={onSearch}
          disabled={busy}
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-cyan-500"
          title="Web search"
        >
          <Globe className="size-4" />
        </Button>
        {/* image attach (VLM) */}
        <ImageAttach onInsert={insertText} disabled={busy} />
        {/* mic (voice input) */}
        <Button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing || busy}
          size="icon"
          variant="ghost"
          className={`size-9 shrink-0 rounded-full ${recording ? "bg-arpa text-arpa-foreground arpa-pulse" : "text-muted-foreground hover:text-foreground"}`}
          title={recording ? "Stop recording" : "Voice input"}
        >
          {transcribing ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
        </Button>
        {busy ? (
          <Button
            onClick={onStop}
            size="icon"
            className="size-9 shrink-0 rounded-full bg-foreground text-background hover:opacity-80"
            title="Stop"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={submit}
            disabled={disabled || !value.trim()}
            size="icon"
            className="size-9 shrink-0 rounded-full bg-arpa text-arpa-foreground hover:opacity-90 disabled:opacity-30"
            title="Send"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
      <div className="mx-auto mt-1.5 flex max-w-3xl items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          ARPA can make mistakes. Please verify important information. <span className="hidden sm:inline">Enter = send · Shift+Enter = newline · Ctrl+K = new</span>
        </span>
        {value.trim() && (
          <span className="tabular-nums">
            {value.trim().split(/\s+/).filter(Boolean).length} words · {value.length} chars · ~{Math.ceil(value.length / 4)} tokens
          </span>
        )}
      </div>
    </div>
  );
}
