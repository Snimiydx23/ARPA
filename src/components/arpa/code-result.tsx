"use client";
// ARPA — output of a Python run: status, printed text, tables (rendered from plain data, never HTML),
// charts (PNG) and files from /output (downloads). Charts/files live only in this browser session.
import * as React from "react";
import { Terminal, AlertTriangle, Download, Loader2, Table2, ImageIcon, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CodeResult } from "@/lib/arpa-client";

const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 4 })) : String(v));

export function CodeResultView({ r, running, status, onSend }: { r?: CodeResult; running?: boolean; status?: string; onSend?: () => void }) {
  const [codeOpen, setCodeOpen] = React.useState(false);
  if (running) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground" data-testid="code-running">
        <Loader2 className="size-4 animate-spin text-arpa" /> {status || "Running Python…"}
      </div>
    );
  }
  if (!r) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border" data-testid="code-result">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        <Terminal className="size-3.5 text-arpa" />
        <span className="font-medium text-foreground">Python output</span>
        <span>· {(r.ms / 1000).toFixed(1)}s</span>
        {!r.ok && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="size-3.5" /> error</span>}
        <button type="button" onClick={() => setCodeOpen((v) => !v)} className="ml-auto flex items-center gap-1 hover:text-foreground">
          code {codeOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {onSend && <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={onSend}><Send className="size-3" /> Ask ARPA to explain</Button>}
      </div>
      <div className="space-y-3 p-3">
        {codeOpen && <pre className="max-h-60 overflow-auto rounded-lg bg-muted/50 p-2.5 font-mono text-xs">{r.code}</pre>}
        {r.missingFiles?.length ? (
          <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
            Files not available in this session (page was reloaded): {r.missingFiles.join(", ")}. Attach them again to analyse.
          </p>
        ) : null}
        {r.stdout.trim() && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{r.stdout.trimEnd()}</pre>}
        {r.tables.map((t, ti) => (
          <div key={ti}>
            <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Table2 className="size-3.5" /> {t.title || "Table"} · {t.total.toLocaleString("en-IN")} rows{t.total > t.rows.length ? ` (first ${t.rows.length} shown)` : ""}</p>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr><th className="px-2 py-1.5 font-medium text-muted-foreground" />{t.columns.map((c, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.rows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{t.index[ri]}</td>
                      {row.map((v, ci) => <td key={ci} className={`whitespace-nowrap px-2 py-1 ${typeof v === "number" ? "text-right tabular-nums" : ""}`}>{cell(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!!r.images?.length && (
          <div className="grid gap-2">
            {r.images.map((src, i) => (
              <figure key={i} className="overflow-hidden rounded-lg border border-border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/png;base64,${src}`} alt={`Chart ${i + 1}`} className="w-full" />
                <figcaption className="flex justify-end bg-card px-2 py-1">
                  <a href={`data:image/png;base64,${src}`} download={`chart-${i + 1}.png`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Download className="size-3.5" /> PNG</a>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {!r.images?.length && !!r.imageCount && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ImageIcon className="size-3.5" /> {r.imageCount} chart(s) — shown only in the session they were made. Press Run on the code again to redraw.</p>
        )}
        {!!r.files?.length && (
          <div className="flex flex-wrap gap-2">
            {r.files.map((f) => (
              <a key={f.name} href={f.url} download={f.name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-arpa">
                <Download className="size-3.5 text-arpa" /> {f.name} <span className="text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              </a>
            ))}
          </div>
        )}
        {!r.files?.length && !!r.fileNames?.length && (
          <p className="text-xs text-muted-foreground">Files created: {r.fileNames.join(", ")} (download available only in the session they were made — run again).</p>
        )}
        {r.error && <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-destructive/10 p-2.5 font-mono text-xs text-destructive">{r.error}</pre>}
        {r.ok && !r.stdout.trim() && !r.tables.length && !r.images?.length && !r.imageCount && !r.files?.length && !r.fileNames?.length && (
          <p className="text-xs text-muted-foreground">Ran successfully (no output).</p>
        )}
      </div>
    </div>
  );
}
