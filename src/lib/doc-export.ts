"use client";
// ARPA — generate Word (.docx) and PDF files directly in the browser from AI answers / whole chats.
//   Word: markdown → HTML (marked) → real .docx (docx library) with headings, lists, tables, code, links
//   PDF : markdown → styled A4 HTML → PDF (html2pdf.js) — supports Hindi/Devanagari & tables
// Libraries load on demand from jsDelivr, so no new npm dependencies are needed.

const CDN = {
  marked: "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
  docx: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  html2pdf: "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js",
};

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  if (!loaded[src]) {
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { delete loaded[src]; rej(new Error("Could not load document generator. Check your internet connection.")); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

export type DocMsg = { role: "user" | "assistant"; content: string; error?: string };
export type DocFormat = "docx" | "pdf";

const BRAND = "6D28D9"; // ARPA purple

/* ---------------- helpers ---------------- */
export function safeFileName(s: string) {
  return (s || "ARPA").replace(/[\\/:*?"<>|#\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "ARPA";
}

/** Short title for a single answer: first markdown heading or first line. */
export function titleFromMarkdown(md: string, fallback = "ARPA Answer") {
  const h = md.match(/^#{1,3}\s+(.+)$/m)?.[1];
  const first = (h || md.split("\n").find((l) => l.trim()) || "").replace(/[#*_`>|]/g, "").trim();
  return first ? first.slice(0, 70) : fallback;
}

async function mdToHtml(md: string): Promise<string> {
  await loadScript(CDN.marked);
  const marked = (window as any).marked;
  return marked.parse(md || "", { gfm: true, breaks: true }) as string;
}

function stamp() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

type Section = { label?: string; html: string };

async function sectionsFrom(msgs: DocMsg[], withLabels: boolean): Promise<Section[]> {
  const out: Section[] = [];
  for (const m of msgs) {
    if (m.error || !m.content?.trim()) continue;
    out.push({
      label: withLabels ? (m.role === "user" ? "You" : "ARPA") : undefined,
      html: await mdToHtml(m.content),
    });
  }
  return out;
}

/* ---------------- Word (.docx) ---------------- */
async function buildDocx(title: string, sections: Section[]): Promise<Blob> {
  await loadScript(CDN.docx);
  const D = (window as any).docx;
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
    BorderStyle, ShadingType, ExternalHyperlink, AlignmentType, LevelFormat, Footer, PageNumber,
  } = D;

  type RunStyle = { bold?: boolean; italics?: boolean; code?: boolean; strike?: boolean; link?: string };

  const runsOf = (node: Node, st: RunStyle = {}): any[] => {
    const out: any[] = [];
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) {
        const text = (ch.textContent || "").replace(/\s+/g, " ");
        if (!text) return;
        const run = new TextRun({
          text,
          bold: st.bold,
          italics: st.italics,
          strike: st.strike,
          font: st.code ? "Consolas" : undefined,
          shading: st.code ? { type: ShadingType.CLEAR, fill: "F3F0FA", color: "auto" } : undefined,
          color: st.link ? "1D4ED8" : undefined,
          underline: st.link ? {} : undefined,
        });
        out.push(st.link ? new ExternalHyperlink({ link: st.link, children: [run] }) : run);
        return;
      }
      if (ch.nodeType !== 1) return;
      const el = ch as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") { out.push(new TextRun({ text: "", break: 1 })); return; }
      const next: RunStyle = { ...st };
      if (tag === "strong" || tag === "b") next.bold = true;
      if (tag === "em" || tag === "i") next.italics = true;
      if (tag === "del" || tag === "s") next.strike = true;
      if (tag === "code") next.code = true;
      if (tag === "a") next.link = el.getAttribute("href") || undefined;
      out.push(...runsOf(el, next));
    });
    return out;
  };

  const headingFor: Record<string, any> = {
    h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6,
  };

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
  const blocks = (root: Element, listLevel = 0): any[] => {
    const out: any[] = [];
    Array.from(root.children).forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (headingFor[tag]) {
        out.push(new Paragraph({ heading: headingFor[tag], children: runsOf(el), spacing: { before: 200, after: 100 } }));
      } else if (tag === "p") {
        out.push(new Paragraph({ children: runsOf(el), spacing: { after: 120 } }));
      } else if (tag === "ul" || tag === "ol") {
        Array.from(el.children).forEach((li) => {
          // inline content of the li (excluding nested lists)
          const clone = li.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("ul,ol").forEach((n) => n.remove());
          const inner = clone.querySelector("p") ? clone.querySelectorAll("p") : [clone];
          Array.from(inner as any).forEach((p: any, idx: number) => {
            out.push(new Paragraph({
              children: runsOf(p),
              ...(idx === 0
                ? (tag === "ul" ? { bullet: { level: Math.min(listLevel, 8) } } : { numbering: { reference: "arpa-num", level: Math.min(listLevel, 8) } })
                : { indent: { left: 720 * (listLevel + 1) } }),
              spacing: { after: 60 },
            }));
          });
          li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => {
            const wrap = document.createElement("div");
            wrap.appendChild(sub.cloneNode(true));
            out.push(...blocks(wrap, listLevel + 1));
          });
        });
      } else if (tag === "pre") {
        const lines = (el.textContent || "").replace(/\n$/, "").split("\n");
        out.push(new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: "F5F5F7", color: "auto" },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 6 } },
          spacing: { before: 80, after: 160 },
          children: lines.map((l, i) => new TextRun({ text: l || " ", font: "Consolas", size: 19, break: i ? 1 : 0 })),
        }));
      } else if (tag === "blockquote") {
        const inner = blocks(el, listLevel);
        if (!inner.length) inner.push(new Paragraph({ children: runsOf(el) }));
        inner.forEach((p) => out.push(p));
      } else if (tag === "hr") {
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } }, spacing: { after: 160 } }));
      } else if (tag === "table") {
        const rows = Array.from(el.querySelectorAll("tr"));
        const cols = Math.max(1, ...rows.map((r) => r.children.length));
        out.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((r) => new TableRow({
            tableHeader: r.parentElement?.tagName.toLowerCase() === "thead",
            children: Array.from({ length: cols }).map((_, ci) => {
              const c = r.children[ci] as HTMLElement | undefined;
              const isHead = c?.tagName.toLowerCase() === "th";
              const align = c?.getAttribute("align") || (c as any)?.style?.textAlign;
              return new TableCell({
                borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
                shading: isHead ? { type: ShadingType.CLEAR, fill: "EDE9FE", color: "auto" } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({
                  alignment: align === "right" ? AlignmentType.RIGHT : align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
                  children: c ? runsOf(c, { bold: isHead }) : [],
                })],
              });
            }),
          })),
        }));
        out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
      } else if (tag === "div" || tag === "section") {
        out.push(...blocks(el, listLevel));
      } else if ((el.textContent || "").trim()) {
        out.push(new Paragraph({ children: runsOf(el) }));
      }
    });
    return out;
  };

  const children: any[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, color: BRAND })] }),
    new Paragraph({ children: [new TextRun({ text: `Generated by ARPA · ${stamp()}`, italics: true, color: "888888", size: 18 })], spacing: { after: 240 } }),
  ];
  for (const s of sections) {
    if (s.label) {
      children.push(new Paragraph({
        children: [new TextRun({ text: s.label.toUpperCase(), bold: true, color: s.label === "You" ? "555555" : BRAND, size: 18 })],
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E5E5", space: 2 } },
      }));
    }
    const doc = new DOMParser().parseFromString(`<div id="r">${s.html}</div>`, "text/html");
    children.push(...blocks(doc.getElementById("r")!));
  }

  const doc = new Document({
    creator: "ARPA",
    title,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { size: 40, bold: true, font: "Calibri" }, paragraph: { spacing: { after: 80 } } },
      ],
    },
    numbering: {
      config: [{
        reference: "arpa-num",
        levels: Array.from({ length: 9 }).map((_, i) => ({
          level: i,
          format: i % 3 === 0 ? LevelFormat.DECIMAL : i % 3 === 1 ? LevelFormat.LOWER_LETTER : LevelFormat.LOWER_ROMAN,
          text: `%${i + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: ["ARPA · Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: "999999" })],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

/* ---------------- PDF ---------------- */
const PDF_CSS = `
  .arpa-doc { font: 11pt/1.6 "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif; color: #1a1a2e; width: 182mm; padding: 0; background: #fff; }
  .arpa-doc h1.doc-title { font-size: 20pt; color: #${BRAND}; margin: 0 0 2pt; border-bottom: 2px solid #${BRAND}; padding-bottom: 4pt; }
  .arpa-doc .meta { color: #888; font-size: 8.5pt; margin-bottom: 14pt; }
  .arpa-doc .label { font-weight: 700; font-size: 8.5pt; letter-spacing: .06em; text-transform: uppercase; color: #${BRAND}; margin: 14pt 0 4pt; border-bottom: 1px solid #eee; padding-bottom: 2pt; }
  .arpa-doc .label.you { color: #555; }
  .arpa-doc h1, .arpa-doc h2, .arpa-doc h3, .arpa-doc h4 { color: #2b1a5e; margin: 12pt 0 5pt; line-height: 1.3; page-break-after: avoid; }
  .arpa-doc h1 { font-size: 16pt; } .arpa-doc h2 { font-size: 14pt; } .arpa-doc h3 { font-size: 12.5pt; } .arpa-doc h4 { font-size: 11.5pt; }
  .arpa-doc p { margin: 0 0 7pt; }
  .arpa-doc ul, .arpa-doc ol { margin: 0 0 7pt; padding-left: 18pt; }
  .arpa-doc li { margin: 2pt 0; }
  .arpa-doc code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; background: #f3f0fa; padding: 0 3px; border-radius: 3px; }
  .arpa-doc pre { background: #f5f5f7; border-left: 3px solid #${BRAND}; padding: 7pt 9pt; white-space: pre-wrap; word-break: break-word; font-size: 9pt; margin: 0 0 9pt; }
  .arpa-doc pre code { background: none; padding: 0; }
  .arpa-doc blockquote { border-left: 3px solid #ccc; margin: 0 0 8pt; padding: 2pt 10pt; color: #555; }
  .arpa-doc table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; font-size: 9.5pt; }
  .arpa-doc th, .arpa-doc td { border: 1px solid #c8c8c8; padding: 4pt 6pt; vertical-align: top; }
  .arpa-doc [align="right"] { text-align: right; } .arpa-doc [align="center"] { text-align: center; }
  .arpa-doc th { background: #ede9fe; text-align: left; }
  .arpa-doc tr { page-break-inside: avoid; }
  .arpa-doc a { color: #1d4ed8; }
  .arpa-doc hr { border: 0; border-top: 1px solid #ddd; margin: 10pt 0; }
  .arpa-doc img { max-width: 100%; }
`;

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function buildPdf(title: string, sections: Section[], filename: string) {
  // Render inside an isolated, hidden iframe so the app's Tailwind v4 styles (oklch()/lab() colours,
  // which html2canvas cannot parse) never touch the PDF. html2pdf is loaded inside the iframe too.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden;";
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;}${PDF_CSS}</style></head><body>
    <div class="arpa-doc">
      <h1 class="doc-title">${escHtml(title)}</h1>
      <div class="meta">Generated by ARPA · ${escHtml(stamp())}</div>
      ${sections.map((s) => `${s.label ? `<div class="label ${s.label === "You" ? "you" : ""}">${escHtml(s.label)}</div>` : ""}<div class="sec">${s.html}</div>`).join("")}
    </div></body></html>`;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((res) => { iframe.onload = () => res(); });
    const win = iframe.contentWindow as any;
    const idoc = iframe.contentDocument!;
    await new Promise<void>((res, rej) => {
      const sc = idoc.createElement("script");
      sc.src = CDN.html2pdf;
      sc.onload = () => res();
      sc.onerror = () => rej(new Error("Could not load PDF generator. Check your internet connection."));
      idoc.head.appendChild(sc);
    });
    const opts = {
      margin: [14, 14, 16, 14],
      filename,
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", "pre", "blockquote", "h1", "h2", "h3", "h4", "li", "img"] },
    };
    // re-create the options inside the iframe's realm (html2pdf checks `instanceof Array`)
    const blob: Blob = await win
      .html2pdf()
      .set(win.JSON.parse(JSON.stringify(opts)))
      .from(idoc.querySelector(".arpa-doc"))
      .toPdf()
      .get("pdf")
      .then((pdf: any) => {
        const n = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          pdf.setPage(i);
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          pdf.text(`ARPA · Page ${i} of ${n}`, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 7, { align: "center" });
        }
      })
      .outputPdf("blob");
    saveBlob(blob, filename);
  } finally {
    iframe.remove();
  }
}

/* ---------------- public API ---------------- */

/** Download ONE AI answer as Word or PDF. */
export async function downloadAnswer(format: DocFormat, markdown: string, title?: string) {
  const t = title || titleFromMarkdown(markdown);
  // avoid printing the title twice: drop a leading "# Title" line that matches the document title
  const m = markdown.match(/^\s*#\s+(.+)\n?/);
  const body = m && m[1].replace(/[#*_`]/g, "").trim() === t.trim() ? markdown.slice(m[0].length) : markdown;
  const sections = await sectionsFrom([{ role: "assistant", content: body }], false);
  const name = safeFileName(t);
  if (format === "docx") saveBlob(await buildDocx(t, sections), `${name}.docx`);
  else await buildPdf(t, sections, `${name}.pdf`);
}

/** Download a WHOLE chat (You / ARPA turns) as Word or PDF. */
export async function downloadChat(format: DocFormat, title: string, msgs: DocMsg[]) {
  const sections = await sectionsFrom(msgs, true);
  if (!sections.length) throw new Error("This chat has nothing to export yet");
  const name = safeFileName(title);
  if (format === "docx") saveBlob(await buildDocx(title, sections), `${name}.docx`);
  else await buildPdf(title, sections, `${name}.pdf`);
}
