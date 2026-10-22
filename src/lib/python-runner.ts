// ARPA — Python code interpreter that runs in the user's browser (Pyodide / WebAssembly) inside a Web Worker.
// No server, no network access from user code beyond Pyodide's own package CDN, hard timeout (worker is killed).
//   /data/<file>   attached data files (read-only copies)
//   /output/<file> files the code writes here are offered to the user as downloads
//   display(df)    show a pandas DataFrame / Series as a table (plain data — rendered safely, never as HTML)
//   matplotlib     every open figure is captured as PNG after the run (plt.show() is not needed)
// Variables persist between runs in the same chat (like a notebook) until resetPython().

export type PyTable = { title: string; columns: string[]; index: string[]; rows: unknown[][]; total: number };
export type PyFile = { name: string; bytes: Uint8Array; mime: string };
export type PyResult = {
  ok: boolean; stdout: string; stderr: string; error?: string; images: string[]; tables: PyTable[]; files: PyFile[];
  ms: number; missingFiles?: string[];
};

const DEFAULT_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const indexURL = () => (process.env.NEXT_PUBLIC_PYODIDE_URL || DEFAULT_INDEX).replace(/\/?$/, "/");

const SETUP = String.raw`
import sys, io, os, json, base64, builtins
os.makedirs('/data', exist_ok=True)
os.makedirs('/output', exist_ok=True)
os.environ['MPLBACKEND'] = 'AGG'
_arpa_tables = []
def display(obj, title=None, max_rows=200):
    try:
        import pandas as pd
        if isinstance(obj, pd.Series):
            obj = obj.to_frame()
        if isinstance(obj, pd.DataFrame):
            df = obj.head(max_rows)
            _arpa_tables.append({
                "title": str(title or ""),
                "columns": [str(c) for c in df.columns],
                "index": [str(i) for i in df.index],
                "rows": json.loads(df.to_json(orient="values", date_format="iso", default_handler=str)),
                "total": int(len(obj)),
            })
            return
    except ImportError:
        pass
    print(obj)
builtins.display = display
def _arpa_collect():
    figs = []
    if 'matplotlib' in sys.modules:
        import matplotlib.pyplot as plt
        for n in plt.get_fignums():
            b = io.BytesIO()
            plt.figure(n).savefig(b, format='png', dpi=110, bbox_inches='tight')
            figs.append(base64.b64encode(b.getvalue()).decode())
        plt.close('all')
    t = list(_arpa_tables)
    _arpa_tables.clear()
    return json.dumps({"images": figs, "tables": t})
`;

// Worker source (classic worker, so importScripts can load pyodide.js from the CDN)
const WORKER = String.raw`
let py = null, ready = null;
const MIME = { csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", json: "application/json", txt: "text/plain", png: "image/png", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
function init(indexURL, setup) {
  if (!ready) ready = (async () => {
    importScripts(indexURL + "pyodide.js");
    py = await loadPyodide({ indexURL });
    await py.runPythonAsync(setup);
  })();
  return ready;
}
function clearDir(d) { try { for (const f of py.FS.readdir(d)) if (f !== "." && f !== "..") py.FS.unlink(d + "/" + f); } catch (e) {} }
self.onmessage = async (ev) => {
  const { id, indexURL, setup, code, files } = ev.data;
  const t0 = performance.now();
  let out = "", err = "";
  try {
    self.postMessage({ id, status: py ? "Running..." : "Loading Python (first time takes a few seconds)..." });
    await init(indexURL, setup);
    for (const f of files || []) py.FS.writeFile("/data/" + f.name, f.bytes);
    clearDir("/output");
    py.setStdout({ batched: (s) => { if (out.length < 200000) out += s + "\n"; } });
    py.setStderr({ batched: (s) => { if (err.length < 50000) err += s + "\n"; } });
    try { await py.loadPackagesFromImports(code, { messageCallback: (m) => self.postMessage({ id, status: m.slice(0, 120) }) }); } catch (e) {}
    self.postMessage({ id, status: "Running..." });
    let result, error;
    try {
      result = await py.runPythonAsync(code);
      if (result !== undefined && result !== null) {
        const tn = result && result.type;
        if (tn === "DataFrame" || tn === "Series") py.globals.get("display")(result);
        else { const s = String(result); if (s && s !== "None") out += s + "\n"; }
      }
    } catch (e) {
      // keep only the user's frames: "Traceback..." + from the first File "<exec>" line
      const lines = String(e && e.message || e).trim().split("\n");
      const i = lines.findIndex((l) => l.includes('File "<exec>"'));
      error = (i > 0 ? [lines[0], ...lines.slice(i)] : lines).slice(-40).join("\n");
    }
    finally { if (result && result.destroy) try { result.destroy(); } catch (e) {} }
    const extra = JSON.parse(py.runPython("_arpa_collect()"));
    const outFiles = [];
    let size = 0;
    for (const name of py.FS.readdir("/output")) {
      if (name === "." || name === "..") continue;
      const bytes = py.FS.readFile("/output/" + name);
      size += bytes.byteLength;
      if (size > 25 * 1024 * 1024) break;
      outFiles.push({ name, bytes, mime: MIME[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream" });
    }
    self.postMessage({ id, done: true, result: { ok: !error, stdout: out, stderr: err, error, images: extra.images, tables: extra.tables, files: outFiles, ms: Math.round(performance.now() - t0) } }, outFiles.map((f) => f.bytes.buffer));
  } catch (e) {
    self.postMessage({ id, done: true, result: { ok: false, stdout: out, stderr: err, error: "Python could not start: " + String(e && e.message || e), images: [], tables: [], files: [], ms: Math.round(performance.now() - t0) } });
  }
};
`;

let worker: Worker | null = null;
let seq = 0;

function getWorker() {
  if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript;charset=utf-8" })));
  return worker;
}

/** Kill the interpreter (clears all variables). */
export function resetPython() {
  if (worker) { worker.terminate(); worker = null; }
}

export async function runPython(
  code: string,
  files: { name: string; bytes: Uint8Array }[] = [],
  opts: { timeoutMs?: number; onStatus?: (s: string) => void; signal?: AbortSignal } = {},
): Promise<PyResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const w = getWorker();
  const id = ++seq;
  return new Promise<PyResult>((resolve) => {
    let finished = false;
    const finish = (r: PyResult) => { if (finished) return; finished = true; clearTimeout(timer); w.removeEventListener("message", onMsg); resolve(r); };
    const kill = (msg: string) => { resetPython(); finish({ ok: false, stdout: "", stderr: "", error: msg, images: [], tables: [], files: [], ms: timeoutMs }); };
    const timer = setTimeout(() => kill(`Stopped: the code ran longer than ${Math.round(timeoutMs / 1000)} seconds.`), timeoutMs);
    opts.signal?.addEventListener("abort", () => kill("Stopped by user."));
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (d?.id !== id) return;
      if (d.status) opts.onStatus?.(d.status);
      if (d.done) finish(d.result);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, indexURL: indexURL(), setup: SETUP, code, files: files.map((f) => ({ name: f.name, bytes: f.bytes.slice() })) });
  });
}

/** Last ```python block of an answer (the one the model asked to run). */
export function extractPython(md: string): string | null {
  const re = /```(?:python|py)[^\n]*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null, last: string | null = null;
  while ((m = re.exec(md))) last = m[1].replace(/\s+$/, "");
  return last && last.trim() ? last : null;
}

/** Text sent back to the model after a run (bounded). */
export function formatOutputForModel(r: PyResult, code: string): string {
  const parts = [`[Code output] — the ${code.split("\n").length}-line Python block ran in the user's browser in ${(r.ms / 1000).toFixed(1)} s.`];
  if (r.missingFiles?.length) parts.push(`MISSING FILES (not available in this session, ask the user to attach again): ${r.missingFiles.join(", ")}`);
  if (r.stdout.trim()) parts.push(`STDOUT:\n${clip(r.stdout, 8000)}`);
  if (r.stderr.trim()) parts.push(`STDERR (warnings):\n${clip(r.stderr, 1500)}`);
  for (const t of r.tables.slice(0, 5)) {
    const head = ["", ...t.columns].join(",");
    const rows = t.rows.slice(0, 25).map((row, i) => [t.index[i], ...row.map((v) => (v === null ? "" : String(v)))].join(","));
    parts.push(`TABLE${t.title ? ` "${t.title}"` : ""} (${t.total} rows × ${t.columns.length} cols; first ${Math.min(25, t.rows.length)} shown):\n${clip([head, ...rows].join("\n"), 4000)}`);
  }
  if (r.images.length) parts.push(`CHARTS: ${r.images.length} chart(s) were shown to the user.`);
  if (r.files.length) parts.push(`FILES created for the user to download: ${r.files.map((f) => f.name).join(", ")}`);
  if (r.error) parts.push(`ERROR:\n${clip(r.error, 3000)}`);
  if (!r.stdout.trim() && !r.tables.length && !r.images.length && !r.files.length && !r.error) parts.push("(The code ran without printing anything.)");
  return parts.join("\n\n");
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + `\n…[${s.length - n} more characters cut]` : s);
