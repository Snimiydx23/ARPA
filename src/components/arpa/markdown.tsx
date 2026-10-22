"use client";
// ARPA V3 — markdown renderer with code highlighting + copy buttons.
// Replaces V2's inline marked+DOMPurify+highlight.js CDN stack with
// react-markdown + remark-gfm + react-syntax-highlighter.
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { Check, Copy, PanelRightOpen, Play, Loader2 } from "lucide-react";
import { useCodeRun } from "@/lib/code-run-context";
import { useOpenCanvas } from "@/lib/canvas-context";
import { linkCitations } from "@/lib/citations";
import type { WebSource, FileSource } from "@/lib/arpa-client";

function CodeBlock({ language, value }: { language: string; value: string }) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = React.useState(false);
  const openCanvas = useOpenCanvas();
  const codeRun = useCodeRun();
  const isPython = /^(python|py)$/i.test(language || "");
  const dark = resolvedTheme === "dark";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
      ta.remove();
    }
  };

  const lineCount = value ? value.split("\n").length : 0;
  // language-specific accent color
  const langColor: Record<string, string> = {
    python: "text-blue-500", py: "text-blue-500",
    javascript: "text-yellow-500", js: "text-yellow-500",
    typescript: "text-blue-600", ts: "text-blue-600", tsx: "text-blue-600",
    java: "text-orange-500",
    cpp: "text-blue-500", c: "text-blue-500",
    html: "text-orange-600",
    css: "text-cyan-500",
    json: "text-amber-500",
    bash: "text-green-500", sh: "text-green-500", shell: "text-green-500",
    sql: "text-rose-500",
    go: "text-cyan-400",
    rust: "text-orange-600", rs: "text-orange-600",
  };
  const accent = langColor[(language || "").toLowerCase()] || "text-arpa";

  return (
    <div className="group/code my-4 overflow-hidden rounded-xl border border-border bg-[var(--muted)]/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-mono lowercase">
          <span className={`size-2 rounded-full ${accent.replace("text-", "bg-")}`} />
          <span className={accent}>{language || "code"}</span>
          {lineCount > 1 && <span className="text-muted-foreground/60">· {lineCount} lines</span>}
        </span>
        <span className="flex items-center gap-0.5">
        {codeRun && isPython && (
          <button
            type="button"
            onClick={() => codeRun.run(value.replace(/\n$/, ""))}
            disabled={codeRun.running}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-arpa hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Run Python code"
          >
            {codeRun.running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run
          </button>
        )}
        {openCanvas && lineCount > 2 && (
          <button
            type="button"
            onClick={() => openCanvas({ content: value.replace(/\n$/, ""), kind: "code", language })}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Edit code in canvas"
          >
            <PanelRightOpen className="size-3.5" /> Canvas
          </button>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        </span>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={dark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          padding: "14px 16px",
          background: "transparent",
          fontSize: "13px",
          lineHeight: 1.55,
        }}
        codeTagProps={{ style: { background: "none", padding: 0, fontFamily: "var(--font-mono)" } }}
        PreTag="div"
      >
        {value.replace(/\n$/, "")}
      </SyntaxHighlighter>
    </div>
  );
}

export function Markdown({ children, sources, fileSources }: { children: string; sources?: WebSource[]; fileSources?: FileSource[] }) {
  const text = sources?.length || fileSources?.length ? linkCitations(children || "", sources?.length || 0, fileSources?.length || 0) : children;
  return (
    <div className="arpa-md break-words text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code(props) {
            const { className, children, ...rest } = props as any;
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...rest}>
                  {children}
                </code>
              );
            }
            const lang = match ? match[1] : "";
            return <CodeBlock language={lang} value={String(children)} />;
          },
          a: ({ children, href, ...props }) => {
            const fcite = /^#fcite-(\d+)$/.exec(href || "");
            const fsrc = fcite && fileSources?.[Number(fcite[1]) - 1];
            if (fsrc) {
              return (
                <span title={`${fsrc.name}${fsrc.label ? ` — ${fsrc.label}` : ""}\n\n${fsrc.excerpt}`}
                  className="arpa-cite arpa-fcite mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px cursor-help items-center justify-center rounded-md px-1 align-middle text-[11px] font-semibold">
                  F{fcite![1]}
                </span>
              );
            }
            const cite = /^#cite-(\d+)$/.exec(href || "");
            const src = cite && sources?.[Number(cite[1]) - 1];
            if (src) {
              return (
                <a href={src.url} target="_blank" rel="noopener noreferrer" title={`${src.title} — ${src.domain}`} style={{ textDecoration: "none" }}
                  className="arpa-cite mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-md bg-muted px-1 align-middle text-[11px] font-semibold text-muted-foreground no-underline hover:bg-arpa hover:text-arpa-foreground">
                  {cite![1]}
                </a>
              );
            }
            return (
              <a href={href} {...props} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
        }}
      >
        {text || ""}
      </ReactMarkdown>
    </div>
  );
}
