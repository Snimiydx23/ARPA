// ARPA — original bytes of attached data files (CSV / Excel / JSON…), kept in browser memory for the Python sandbox.
// Never uploaded; lost on page reload (the user is asked to re-attach if code needs them).
const store = new Map<string, Uint8Array>();
const MAX_TOTAL = 60 * 1024 * 1024;
export const DATA_FILE_RE = /\.(csv|tsv|txt|json|xlsx|xlsm|xls|ods|xml|parquet)$/i;

export const isDataFile = (name: string) => DATA_FILE_RE.test(name);

/** Safe name used inside the sandbox: /data/<name> */
export const sandboxName = (name: string) => name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").slice(0, 120) || "file";

export async function keepRawFile(f: File): Promise<string | null> {
  if (!isDataFile(f.name) || f.size > 40 * 1024 * 1024) return null;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const name = sandboxName(f.name);
  store.set(name, bytes);
  let total = 0;
  for (const [k, v] of [...store.entries()].reverse()) { total += v.byteLength; if (total > MAX_TOTAL) store.delete(k); }
  return name;
}

export const getRawFile = (name: string) => store.get(name);
export const hasRawFile = (name: string) => store.has(name);
export const rawFileList = () => [...store.keys()];
