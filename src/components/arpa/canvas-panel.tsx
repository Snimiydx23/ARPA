"use client";
// ARPA — Canvas side panel: edit a document / code next to the chat.
//   • Edit (plain text / code) and Preview (formatted) views
//   • ARPA edits: quick actions or your own instruction — applied to the selected text, or the whole canvas
//   • autosave, versions (restore any snapshot), undo of the last AI edit
//   • export: Word / PDF / Markdown for documents, file download for code
import * as React from "react";
import { toast } from "sonner";
import {
  X, Eye, PencilLine, Sparkles, Loader2, History, Download, Copy, Check, Trash2, Save, SendHorizonal, FileText, FileDown, FileCode2, MoreHorizontal, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "./markdown";
import { api, downloadFile } from "@/lib/arpa-client";

export type CanvasDoc = {
  id: string; title: string; kind: "doc" | "code"; language: string; content: string; chatId?: string | null; updatedAt: number;
  versions: { id: string; label: string; createdAt: number; chars: number }[];
};

const DOC_ACTIONS = [
  { label: "Make shorter", instruction: "Make it shorter and tighter without losing key facts and numbers." },
  { label: "Make longer", instruction: "Expand it with more useful detail and explanation." },
  { label: "More formal", instruction: "Rewrite in a formal, professional tone suitable for a bank / client." },
  { label: "Simpler language", instruction: "Rewrite in simple, easy-to-understand language." },
  { label: "Fix grammar & spelling", instruction: "Fix grammar, spelling and punctuation only. Do not change the meaning." },
  { label: "Translate to Hindi", instruction: "Translate into Hindi (Devanagari). Keep numbers, names and formatting." },
  { label: "Translate to English", instruction: "Translate into clear English. Keep numbers, names and formatting." },
  { label: "Turn into a table", instruction: "Present this information as a well-structured markdown table." },
  { label: "Add a summary at the top", instruction: "Add a short 'Summary' section at the top with 3–5 key bullet points; keep the rest unchanged." },
];
const CODE_ACTIONS = [
  { label: "Add comments", instruction: "Add clear, concise comments explaining the code. Do not change behaviour." },
  { label: "Fix bugs", instruction: "Find and fix bugs. Keep the same behaviour otherwise. Add a short comment where you fixed something." },
  { label: "Improve / clean up", instruction: "Refactor for readability and performance without changing behaviour." },
  { label: "Add error handling", instruction: "Add proper error handling and input validation." },
  { label: "Add logging", instruction: "Add helpful logging statements at key steps." },
];
const EXT: Record<string, string> = { python: "py", py: "py", javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx", html: "html", css: "css", json: "json", sql: "sql", bash: "sh", sh: "sh", shell: "sh", java: "java", cpp: "cpp", c: "c", go: "go", rust: "rs", vba: "bas", vb: "vb", php: "php", yaml: "yml", yml: "yml", xml: "xml", csv: "csv" };

/** Find the user's preview-mode selection inside the markdown source (best effort). */
function locate(content: string, selected: string): { start: number; end: number } | null {
  const s = selected.trim();
  if (s.length < 2) return null;
  const i = content.indexOf(s);
  if (i >= 0) return { start: i, end: i + s.length };
  // tolerate formatting/whitespace differences: match words with anything non-word between them
  const words = s.split(/\s+/).filter(Boolean).slice(0, 60).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return null;
  const m = new RegExp(words.join("[\\s*_`#>|\\-]+")).exec(content);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

export function CanvasPanel({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted?: (id: string) => void }) {
  const [doc, setDoc] = React.useState<CanvasDoc | null>(null);
  const [content, setContent] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [mode, setMode] = React.useState<"edit" | "preview">("preview");
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "dirty">("saved");
  const [aiBusy, setAiBusy] = React.useState<string | null>(null);
  const [instruction, setInstruction] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [undo, setUndo] = React.useState<string | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = React.useRef("");
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  const load = React.useCallback(async () => {
    const { status, data } = await api<{ ok: boolean; canvas?: CanvasDoc; error?: string }>(`/api/canvas/${id}`);
    if (status !== 200 || !data?.canvas) { toast.error(data?.error || "Could not open canvas"); closeRef.current(); return; }
    setDoc(data.canvas); setContent(data.canvas.content); setTitle(data.canvas.title);
    lastSaved.current = data.canvas.content;
    setMode(data.canvas.kind === "code" ? "edit" : "preview");
    setSaveState("saved"); setUndo(null);
  }, [id]);
  React.useEffect(() => { setDoc(null); load(); }, [load]);

  const save = React.useCallback(async (opts: { content?: string; title?: string; version?: string } = {}) => {
    const body: Record<string, string> = {};
    if (opts.content !== undefined) body.content = opts.content;
    if (opts.title !== undefined) body.title = opts.title;
    if (opts.version) body.version = opts.version;
    setSaveState("saving");
    const { status, data } = await api<{ ok: boolean; error?: string }>(`/api/canvas/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (status !== 200 || !data?.ok) { setSaveState("dirty"); toast.error(data?.error || "Could not save canvas"); return false; }
    if (opts.content !== undefined) lastSaved.current = opts.content;
    setSaveState("saved");
    return true;
  }, [id]);

  // autosave typing (no version snapshot)
  const onType = (v: string) => {
    setContent(v);
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { if (v !== lastSaved.current) save({ content: v }); else setSaveState("saved"); }, 1200);
  };
  React.useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const refreshVersions = async () => {
    const { data } = await api<{ ok: boolean; canvas?: CanvasDoc }>(`/api/canvas/${id}`);
    if (data?.canvas) setDoc((d) => (d ? { ...d, versions: data.canvas!.versions } : d));
  };

  const currentSelection = (): { start: number; end: number } | null => {
    if (mode === "edit" && taRef.current) {
      const { selectionStart: s, selectionEnd: e } = taRef.current;
      return e > s ? { start: s, end: e } : null;
    }
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && previewRef.current && sel.rangeCount && previewRef.current.contains(sel.anchorNode)) {
      const loc = locate(content, sel.toString());
      if (!loc && sel.toString().trim()) toast.message("Couldn't match that selection exactly — switch to Edit and select the text there.");
      return loc;
    }
    return null;
  };

  const runAI = async (instr: string, label: string) => {
    if (!doc || aiBusy) return;
    const selection = currentSelection();
    setAiBusy(label);
    try {
      const before = content;
      const { status, data } = await api<{ ok: boolean; content?: string; replaced?: { start: number; end: number } | null; error?: string; code?: string }>("/api/canvas/edit", {
        method: "POST",
        body: JSON.stringify({ content: before, kind: doc.kind, language: doc.language || undefined, instruction: instr, ...(selection ? { selection } : {}) }),
      });
      if (status !== 200 || !data?.ok || data.content === undefined) { toast.error(data?.error || `Edit failed (${status})`); return; }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setContent(data.content);
      setUndo(before);
      await save({ content: data.content, version: `ARPA: ${label}`.slice(0, 60) });
      refreshVersions();
      toast.success(selection ? "Selected part updated" : "Canvas updated");
      if (data.replaced && taRef.current && mode === "edit") {
        const r = data.replaced;
        requestAnimationFrame(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(r.start, r.end); });
      }
    } finally { setAiBusy(null); }
  };

  const sendInstruction = () => {
    const t = instruction.trim();
    if (t.length < 2) return;
    setInstruction("");
    runAI(t, t.length > 40 ? `${t.slice(0, 38)}…` : t);
  };

  const undoAI = async () => {
    if (undo === null) return;
    const prev = undo;
    setUndo(null);
    setContent(prev);
    await save({ content: prev, version: "Undo ARPA edit" });
    refreshVersions();
  };

  const restore = async (vid: string, label: string) => {
    const { status, data } = await api<{ ok: boolean; version?: { content: string } }>(`/api/canvas/${id}/versions/${vid}`);
    if (status !== 200 || !data?.version) { toast.error("Could not load that version"); return; }
    if (!confirm(`Restore "${label}"? Your current text is kept as a version too.`)) return;
    await save({ content, version: "Before restore" });
    setContent(data.version.content);
    await save({ content: data.version.content, version: `Restored: ${label}`.slice(0, 60) });
    refreshVersions();
    toast.success("Version restored");
  };

  const exportAs = async (f: "docx" | "pdf" | "md" | "file") => {
    if (!doc) return;
    try {
      if (f === "md") downloadFile(`${title || "canvas"}.md`, content);
      else if (f === "file") downloadFile(/\.[a-z0-9]+$/i.test(title) ? title : `${title || "code"}.${EXT[doc.language.toLowerCase()] || "txt"}`, content, "text/plain");
      else {
        const { downloadAnswer } = await import("@/lib/doc-export");
        await downloadAnswer(f, content, title);
      }
    } catch (e: any) { toast.error(e?.message || "Download failed"); }
  };

  const copy = () => navigator.clipboard.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});

  const remove = async () => {
    if (!confirm("Delete this canvas and all its versions?")) return;
    const { status } = await api(`/api/canvas/${id}`, { method: "DELETE" });
    if (status === 200) { toast.success("Canvas deleted"); onDeleted?.(id); onClose(); }
  };

  const actions = doc?.kind === "code" ? CODE_ACTIONS : DOC_ACTIONS;

  return (
    <aside
      className="fixed inset-0 z-50 flex flex-col bg-background md:static md:z-auto md:w-[min(52vw,780px)] md:min-w-[420px] md:border-l md:border-border"
      aria-label="Canvas"
      data-testid="canvas-panel"
    >
      {/* header */}
      <div className="flex h-14 items-center gap-1.5 border-b border-border px-2.5">
        {doc?.kind === "code" ? <FileCode2 className="size-4 shrink-0 text-arpa" /> : <FileText className="size-4 shrink-0 text-arpa" />}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => doc && title.trim() && title !== doc.title && save({ title: title.trim() }).then((ok) => ok && setDoc({ ...doc, title: title.trim() }))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Canvas title"
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold outline-none hover:bg-muted focus:bg-muted"
        />
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved" : "Saved"}
        </span>
        <div className="flex rounded-lg border border-border p-0.5">
          <button onClick={() => setMode("edit")} aria-pressed={mode === "edit"} title="Edit text" aria-label="Edit mode"
            className={`rounded-md px-2 py-1 ${mode === "edit" ? "bg-muted text-foreground" : "text-muted-foreground"}`}><PencilLine className="size-3.5" /></button>
          <button onClick={() => setMode("preview")} aria-pressed={mode === "preview"} title="Formatted preview" aria-label="Preview mode"
            className={`rounded-md px-2 py-1 ${mode === "preview" ? "bg-muted text-foreground" : "text-muted-foreground"}`}><Eye className="size-3.5" /></button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" title="Versions" aria-label="Versions"><History className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 min-w-[240px] overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Versions (newest first)</DropdownMenuLabel>
            {(doc?.versions || []).map((v, i) => (
              <DropdownMenuItem key={v.id} onSelect={() => i > 0 || v.chars !== content.length ? restore(v.id, v.label) : undefined} className="flex flex-col items-start gap-0">
                <span className="text-sm">{v.label || "Version"}</span>
                <span className="text-[11px] text-muted-foreground">{new Date(v.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {v.chars.toLocaleString("en-IN")} chars</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => save({ content, version: "Saved" }).then(refreshVersions)}><Save className="mr-2 size-4" /> Save current as version</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" title="Download / more" aria-label="Download and more"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {doc?.kind === "code" ? (
              <DropdownMenuItem onSelect={() => exportAs("file")}><Download className="mr-2 size-4" /> Download file</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => exportAs("docx")}><FileText className="mr-2 size-4 text-blue-600" /> Word (.docx)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs("pdf")}><FileDown className="mr-2 size-4 text-rose-600" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs("md")}><Download className="mr-2 size-4" /> Markdown (.md)</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={copy}>{copied ? <Check className="mr-2 size-4 text-green-600" /> : <Copy className="mr-2 size-4" />} Copy all</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={remove} className="text-destructive"><Trash2 className="mr-2 size-4" /> Delete canvas</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" variant="ghost" className="size-8" onClick={onClose} title="Close canvas" aria-label="Close canvas"><X className="size-4" /></Button>
      </div>

      {/* body */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {!doc ? (
          <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : mode === "edit" ? (
          <textarea
            ref={taRef}
            value={content}
            onChange={(e) => onType(e.target.value)}
            spellCheck={doc.kind === "doc"}
            aria-label="Canvas text"
            className={`h-full min-h-full w-full resize-none bg-transparent p-5 outline-none ${doc.kind === "code" ? "font-mono text-[13px] leading-relaxed" : "text-[15px] leading-relaxed"}`}
            onKeyDown={(e) => {
              if (doc.kind === "code" && e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget, s = t.selectionStart, en = t.selectionEnd;
                const v = content.slice(0, s) + "  " + content.slice(en);
                onType(v);
                requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
              }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save({ content, version: "Saved" }).then(refreshVersions); }
            }}
          />
        ) : (
          <div ref={previewRef} className="mx-auto max-w-3xl p-5">
            {doc.kind === "code"
              ? <Markdown>{"```" + (doc.language || "") + "\n" + content + "\n```"}</Markdown>
              : <Markdown>{content || "*Empty canvas*"}</Markdown>}
          </div>
        )}
        {aiBusy && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
            <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-md">
              <Loader2 className="size-3.5 animate-spin text-arpa" /> ARPA is editing: {aiBusy}
            </span>
          </div>
        )}
      </div>

      {/* ARPA edit bar */}
      <div className="border-t border-border p-2.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 rounded-full text-xs" disabled={!doc || !!aiBusy}>
                <Sparkles className="size-3.5 text-arpa" /> Quick edits
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-[220px]">
              <DropdownMenuLabel className="text-xs">Applies to selected text, or the whole canvas</DropdownMenuLabel>
              {actions.map((a) => (
                <DropdownMenuItem key={a.label} onSelect={() => runAI(a.instruction, a.label)}>{a.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {undo !== null && !aiBusy && (
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 rounded-full text-xs" onClick={undoAI}><Undo2 className="size-3.5" /> Undo ARPA edit</Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">Tip: select text first to change only that part</span>
        </div>
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-arpa">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInstruction(); } }}
            rows={1}
            placeholder={doc?.kind === "code" ? "Ask ARPA to change the code…" : "Ask ARPA to change this… e.g. \"DSCR table add karo\""}
            aria-label="Instruction for ARPA"
            className="max-h-28 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button size="icon" className="size-8 shrink-0 rounded-full bg-arpa text-arpa-foreground hover:opacity-90" disabled={!doc || !!aiBusy || instruction.trim().length < 2} onClick={sendInstruction} aria-label="Send instruction">
            {aiBusy ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
