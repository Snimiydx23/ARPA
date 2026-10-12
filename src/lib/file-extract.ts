"use client";
// ARPA — read any dropped/attached file in the browser and turn it into something the AI can use.
//   images              → compressed JPEG (sent to the vision model, Kimi-K3)
//   PDF (text)          → extracted text (sent to the chat model, Nemotron)
//   PDF (scanned)       → first pages rendered as images (vision model)
//   DOCX / XLSX / XLS / CSV / PPTX / TXT / MD / JSON / code → extracted text
// Heavy parsers are loaded on demand from jsDelivr, so no new npm dependencies are needed.

import { prepareImage, type PickedImage } from "@/components/arpa/image-attach";

export type PickedFile = { name: string; text: string; size: number; pages?: number; truncated?: boolean };
export type Extracted =
  | { kind: "image"; img: PickedImage }
  | { kind: "file"; file: PickedFile };

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB raw
export const MAX_FILE_CHARS = 150_000; // ~37k tokens of text per file
const SCAN_PAGES = 4; // scanned PDFs: how many pages to send as images

const CDN = {
  pdf: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
};

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  if (!loaded[src]) {
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { delete loaded[src]; rej(new Error("Could not load file reader. Check your internet connection.")); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|php|rb|sql|sh|bat|ps1|yaml|yml|ini|toml|log|env|gs|vba|bas|r|kt|swift|dart|svg)$/i;

const ext = (n: string) => (n.split(".").pop() || "").toLowerCase();

function clip(text: string): { text: string; truncated: boolean } {
  const t = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return t.length > MAX_FILE_CHARS
    ? { text: t.slice(0, MAX_FILE_CHARS), truncated: true }
    : { text: t, truncated: false };
}

async function readPdf(f: File): Promise<Extracted> {
  await loadScript(CDN.pdf);
  const pdfjs = (window as any).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const pages = doc.numPages as number;
  let out = "";
  for (let i = 1; i <= pages && out.length < MAX_FILE_CHARS; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    for (const it of tc.items as any[]) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { out += line.trimEnd() + "\n"; line = ""; }
      line += it.str + (it.hasEOL ? "\n" : " ");
      lastY = y;
    }
    out += line.trimEnd() + `\n\n--- page ${i} end ---\n\n`;
  }

  // Scanned PDF (almost no text) → render first pages to images for the vision model
  const realText = out.replace(/--- page \d+ end ---/g, "").replace(/\s+/g, "");
  if (realText.length / Math.max(1, pages) < 20) { // < ~20 real characters per page → scanned
    const imgs: string[] = [];
    let thumb = "";
    for (let i = 1; i <= Math.min(pages, SCAN_PAGES); i++) {
      const page = await doc.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1400 / Math.max(vp0.width, vp0.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      imgs.push(c.toDataURL("image/jpeg", 0.8));
      if (i === 1) {
        const t = document.createElement("canvas");
        const s = 320 / Math.max(c.width, c.height);
        t.width = Math.round(c.width * s); t.height = Math.round(c.height * s);
        t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
        thumb = t.toDataURL("image/jpeg", 0.7);
      }
    }
    return { kind: "image", img: { image: imgs[0], thumb, more: imgs.slice(1), name: f.name, pages } };
  }
  const c = clip(out);
  return { kind: "file", file: { name: f.name, size: f.size, pages, ...c } };
}

async function readDocx(f: File): Promise<string> {
  await loadScript(CDN.mammoth);
  const r = await (window as any).mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
  return String(r?.value || "");
}

async function readSheet(f: File): Promise<string> {
  await loadScript(CDN.xlsx);
  const XLSX = (window as any).XLSX;
  const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
  let out = "";
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    if (!csv.trim()) continue;
    out += `### Sheet: ${name}\n${csv}\n\n`;
    if (out.length > MAX_FILE_CHARS) break;
  }
  return out;
}

async function readPptx(f: File): Promise<string> {
  await loadScript(CDN.jszip);
  const zip = await (window as any).JSZip.loadAsync(await f.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  let out = "";
  for (let i = 0; i < slides.length; i++) {
    const xml: string = await zip.file(slides[i]).async("string");
    const text = (xml.match(/<a:t>([^<]*)<\/a:t>/g) || []).map((t) => t.replace(/<\/?a:t>/g, "")).join(" ");
    out += `### Slide ${i + 1}\n${text}\n\n`;
  }
  return out
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Read any supported file. Throws a user-friendly Error when unsupported. */
export async function extractFile(f: File): Promise<Extracted> {
  if (f.size > MAX_FILE_BYTES) throw new Error("File must be smaller than 25MB");
  const e = ext(f.name);
  if (f.type.startsWith("image/") && e !== "svg") return { kind: "image", img: await prepareImage(f) };
  if (e === "pdf" || f.type === "application/pdf") return readPdf(f);

  let raw = "";
  if (e === "docx") raw = await readDocx(f);
  else if (["xlsx", "xlsm", "xls", "ods"].includes(e)) raw = await readSheet(f);
  else if (e === "pptx") raw = await readPptx(f);
  else if (TEXT_EXT.test(f.name) || f.type.startsWith("text/") || f.type === "application/json") raw = await f.text();
  else if (e === "doc" || e === "ppt") throw new Error(`Old .${e} format is not supported — please save it as .${e}x and try again.`);
  else throw new Error(`.${e || "unknown"} files are not supported yet`);

  if (!raw.trim()) throw new Error("No readable text found in this file");
  return { kind: "file", file: { name: f.name, size: f.size, ...clip(raw) } };
}

export const fmtSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
