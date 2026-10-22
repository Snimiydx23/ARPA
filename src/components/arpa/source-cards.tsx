"use client";
// ARPA — web sources used for an answer: compact cards (title, site, date) + "show all" toggle.
import * as React from "react";
import { Globe, ChevronDown, ChevronUp, Search, FileText, Calculator, BookOpen, Check, X, Loader2, Bot } from "lucide-react";
import type { WebSource, FileSource, AgentStep } from "@/lib/arpa-client";

export function Favicon({ domain, className = "size-4" }: { domain: string; className?: string }) {
  const [bad, setBad] = React.useState(false);
  if (bad || !domain) return <Globe className={`${className} text-muted-foreground`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`} alt="" className={`${className} rounded-sm`} onError={() => setBad(true)} loading="lazy" />
  );
}

const fmtDate = (d?: string) => {
  if (!d) return "";
  const t = Date.parse(d);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export function SourceCards({ sources, deep }: { sources: WebSource[]; deep?: boolean }) {
  const [all, setAll] = React.useState(false);
  if (!sources?.length) return null;
  const shown = all ? sources : sources.slice(0, 4);
  return (
    <div className="mt-3" data-testid="source-cards">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Search className="size-3.5" /> {deep ? "Deep research" : "Sources"} · {sources.length}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((s) => (
          <a
            key={s.n}
            id={undefined}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.snippet}
            className="group/src flex min-w-0 items-start gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2 text-left transition-colors hover:border-arpa/50 hover:bg-muted/60"
          >
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-background text-[10px] font-semibold text-muted-foreground ring-1 ring-border">{s.n}</span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[13px] font-medium leading-snug group-hover/src:text-arpa">{s.title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Favicon domain={s.domain} className="size-3.5" />
                <span className="truncate">{s.domain}</span>
                {fmtDate(s.published) && <span className="shrink-0">· {fmtDate(s.published)}</span>}
              </span>
            </span>
          </a>
        ))}
      </div>
      {sources.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {all ? <><ChevronUp className="size-3.5" /> Show fewer</> : <><ChevronDown className="size-3.5" /> Show all {sources.length} sources</>}
        </button>
      )}
    </div>
  );
}

/** Live research progress shown while the answer has not started yet. */
export function ResearchStatus({ status, sources }: { status: string; sources?: WebSource[] }) {
  return (
    <div className="flex flex-col gap-2 py-1" data-testid="research-status">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe className="size-4 animate-pulse text-arpa" />
        <span className="animate-pulse">{status}</span>
      </p>
      {!!sources?.length && (
        <div className="flex flex-wrap gap-1.5">
          {sources.slice(0, 10).map((s) => (
            <span key={s.n} className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Favicon domain={s.domain} className="size-3" /> <span className="truncate">{s.domain}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Project-file excerpts used for the answer (grouped by file; click a chip to read the excerpt). */
export function FileSourceList({ items }: { items: FileSource[] }) {
  const [open, setOpen] = React.useState<number | null>(null);
  if (!items?.length) return null;
  const cur = items.find((i) => i.n === open);
  return (
    <div className="mt-3" data-testid="file-sources">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FileText className="size-3.5" /> From your project files · {items.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((f) => (
          <button key={f.n} type="button" onClick={() => setOpen(open === f.n ? null : f.n)}
            className={`inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${open === f.n ? "border-arpa bg-arpa/10 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:border-arpa/50"}`}>
            <span className="font-semibold text-arpa">F{f.n}</span>
            <span className="truncate">{f.name}</span>
            {f.label && <span className="shrink-0 opacity-70">· {f.label}</span>}
          </button>
        ))}
      </div>
      {cur?.excerpt && (
        <blockquote className="mt-2 rounded-lg border-l-2 border-arpa bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {cur.excerpt}
        </blockquote>
      )}
    </div>
  );
}

const STEP_ICON: Record<string, typeof Globe> = { web_search: Search, web_read: Globe, project_search: BookOpen, calculator: Calculator };

/** Agent trace: live list while working, collapsible "Used N tools" summary afterwards. */
export function AgentSteps({ steps, live, status }: { steps: AgentStep[]; live?: boolean; status?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!steps?.length && !live) return null;
  const show = live || open;
  return (
    <div className="mb-2" data-testid="agent-steps">
      {!live && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Bot className="size-3.5 text-arpa" /> Agent used {steps.length} tool{steps.length === 1 ? "" : "s"}
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}
      {show && (
        <ol className={`${live ? "" : "mt-1.5"} space-y-1 border-l-2 border-arpa/30 pl-3`}>
          {steps.map((s, i) => {
            const Icon = STEP_ICON[s.tool] || Bot;
            const running = live && s.ok === undefined;
            return (
              <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                {running ? <Loader2 className="size-3.5 animate-spin text-arpa" /> : <Icon className="size-3.5 text-arpa" />}
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.ok === true && <Check className="size-3.5 text-green-600" />}
                {s.ok === false && <X className="size-3.5 text-destructive" />}
                {s.ms !== undefined && !running && <span className="shrink-0 tabular-nums opacity-60">{(s.ms / 1000).toFixed(1)}s</span>}
              </li>
            );
          })}
          {live && status && !steps.some((s) => s.label === status && s.ok === undefined) && (
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-arpa" /> <span className="animate-pulse">{status}</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
