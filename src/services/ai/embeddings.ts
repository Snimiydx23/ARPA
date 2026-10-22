// ARPA — text embeddings (OpenAI-compatible /embeddings). Default: NVIDIA NIM llama-3.2-nv-embedqa-1b-v2.
// Env: EMBEDDING_MODEL, EMBEDDING_BASE_URL (default NVIDIA_BASE_URL), EMBEDDING_API_KEY (default NVIDIA_API_KEY),
//      EMBEDDING_DIM (default 384 — small vectors keep storage and search cheap), EMBEDDINGS=off to disable.
export type EmbedKind = "query" | "passage";

const cfg = () => {
  const e = process.env;
  const key = e.EMBEDDING_API_KEY || e.NVIDIA_API_KEY || "";
  return {
    on: e.EMBEDDINGS !== "off" && !!key,
    key,
    base: (e.EMBEDDING_BASE_URL || e.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, ""),
    model: e.EMBEDDING_MODEL || "nvidia/llama-3.2-nv-embedqa-1b-v2",
    dim: Math.min(4096, Math.max(4, Number(e.EMBEDDING_DIM || 384))),
    batch: 32,
  };
};

export const embeddingsEnabled = () => cfg().on;

export function normalize(v: number[] | Float32Array): Float32Array {
  const out = Float32Array.from(v);
  let n = 0;
  for (let i = 0; i < out.length; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

/** Cosine similarity of two L2-normalised vectors (dot product). Different lengths → 0. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export const toBytes = (v: Float32Array): Uint8Array<ArrayBuffer> => new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer);
export function fromBytes(b: Uint8Array | null | undefined): Float32Array | null {
  if (!b || b.byteLength < 4 || b.byteLength % 4) return null;
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

async function call(texts: string[], kind: EmbedKind, withDim: boolean, signal?: AbortSignal) {
  const c = cfg();
  const r = await fetch(`${c.base}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
    body: JSON.stringify({
      model: c.model,
      input: texts,
      input_type: kind,
      encoding_format: "float",
      truncate: "END",
      ...(withDim ? { dimensions: c.dim } : {}),
    }),
    signal,
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || j?.detail || `Embedding error ${r.status}`), { status: r.status });
  const data: any[] = Array.isArray(j?.data) ? j.data : [];
  if (data.length !== texts.length) throw new Error("Embedding response size mismatch");
  return data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding as number[]);
}

/** Embed texts (batched). Vectors are cut to EMBEDDING_DIM (Matryoshka) and L2-normalised. */
export async function embed(texts: string[], kind: EmbedKind, opts: { signal?: AbortSignal } = {}): Promise<Float32Array[]> {
  const c = cfg();
  if (!c.on) throw new Error("Embeddings are not configured");
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += c.batch) {
    const part = texts.slice(i, i + c.batch).map((t) => t.slice(0, 6000) || " ");
    let vecs: number[][];
    try {
      vecs = await call(part, kind, true, opts.signal);
    } catch (e: any) {
      // some models don't accept "dimensions" → ask for the full vector and truncate ourselves
      if (e?.status === 400 || e?.status === 422) vecs = await call(part, kind, false, opts.signal);
      else throw e;
    }
    for (const v of vecs) out.push(normalize(v.slice(0, c.dim)));
  }
  return out;
}
