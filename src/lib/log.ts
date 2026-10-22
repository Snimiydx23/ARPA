// ARPA — structured server logging (JSON lines → readable in Vercel / any log drain).
// Usage: const log = logger("chat", req); log.info("stream.start", { model }); log.error("stream.fail", err)
import crypto from "node:crypto";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

/** Request id: reuse Vercel's id when present, otherwise generate one. */
export function requestId(req?: Request): string {
  return (
    req?.headers.get("x-vercel-id")?.split("::").pop() ||
    req?.headers.get("x-request-id") ||
    crypto.randomBytes(6).toString("hex")
  );
}

function emit(level: Level, scope: string, rid: string, event: string, fields?: Fields) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, scope, rid, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errFields(e: unknown): Fields {
  if (e instanceof Error) return { error: e.message, name: e.name };
  return { error: String(e) };
}

export function logger(scope: string, req?: Request) {
  const rid = requestId(req);
  return {
    rid,
    debug: (event: string, f?: Fields) => process.env.LOG_DEBUG === "true" && emit("debug", scope, rid, event, f),
    info: (event: string, f?: Fields) => emit("info", scope, rid, event, f),
    warn: (event: string, f?: Fields) => emit("warn", scope, rid, event, f),
    error: (event: string, e?: unknown, f?: Fields) => emit("error", scope, rid, event, { ...errFields(e), ...f }),
  };
}
