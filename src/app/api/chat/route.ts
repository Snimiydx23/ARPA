// POST /api/chat — streaming AI chat through the ARPA AI Gateway.
// validate → auth → rate limit → quota → build context → route (AUTO/FAST/BALANCED/QUALITY or manual model)
// → stream with retry + model fallback → usage tracking. SSE output format is unchanged for the client:
//   data: {"choices":[{"delta":{"content":"…"},"finish_reason":null}]}  …  data: "[DONE]"
import { db } from "@/lib/db";
import { CFG, bearerUid, status, takeQuota, refundQuota, json, systemPrompt, blockedResponse, codeInterpreterPrompt } from "@/lib/arpa";
import { parseBody, ChatRequestSchema } from "@/lib/validate";
import { enforceRate } from "@/lib/rate-limit";
import { logger } from "@/lib/log";
import { streamChat, GatewayError } from "@/services/ai/gateway";
import { recordUsage } from "@/services/ai/usage";
import type { AIMessage, Usage } from "@/services/ai/types";
import { projectContext } from "@/services/projects";
import { memoryContext } from "@/services/memory";
import { runAgent, isAgentRequest, stripAgentCommand } from "@/services/agent";
import { research, researchAvailable, researchMode, buildSourcesBlock, publicSources, type ResearchResult } from "@/services/research";

const MAX_CTX_CHARS = CFG.maxCtx;
const FILE_CHARS = Number(process.env.MAX_FILE_CHARS || 150000); // attached document text per message
const HEARTBEAT_MS = 15_000;
export const maxDuration = 300;

type Ctx = { role: "user" | "assistant"; content: string; images?: string[] };

export async function POST(req: Request) {
  const log = logger("chat", req);
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Session expired, please log in again." }, 401);

  const limited = await enforceRate("chat", uid);
  if (limited) return limited;

  const { data: body, error } = await parseBody(req, ChatRequestSchema);
  if (error) return error;

  const dbUser = await db.user.findUnique({ where: { uid } });
  if (!dbUser) return json({ error: "User record not found. Please log in again." }, 401);
  if (dbUser.blocked) return blockedResponse();
  const st = status(dbUser);
  if (st.state === "expired") {
    return json({ error: "Your free trial has ended. Please pick a plan to keep chatting.", code: "EXPIRED" }, 402);
  }

  // ---- build context (history trimmed to the char budget, newest first) ----
  const msgs: Ctx[] = body.messages
    .filter((m) => m.content.trim())
    .map((m) => {
      const o: Ctx = { role: m.role, content: m.content.slice(0, 40000) };
      if (m.role === "user") {
        if (m.file?.text?.trim()) {
          const name = m.file.name.replace(/["<>]/g, "").slice(0, 200) || "file";
          o.content = `[Attached file: ${name}]\n<file name="${name}">\n${m.file.text.slice(0, FILE_CHARS)}\n</file>\n\n${o.content}`;
        }
        const imgs = [m.image, ...(m.images || [])].filter((u): u is string => !!u).slice(0, 5);
        if (imgs.length) o.images = imgs;
      }
      return o;
    });
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "Message is empty" }, 400);

  let total = 0, start = msgs.length;
  while (start > 0 && total + msgs[start - 1].content.length <= MAX_CTX_CHARS) {
    total += msgs[start - 1].content.length;
    start--;
  }
  if (start === msgs.length) start = msgs.length - 1;
  const recent = msgs.slice(start);
  const hasImage = recent.some((m) => m.images?.length);

  // system prompt = ARPA base (+ memory rules) + saved memories + project instructions/knowledge + chat persona
  const memoryOn = dbUser.memoryEnabled;
  // retrieval query for project files = the latest user message (+ the previous one, for follow-ups like "aur DSCR?")
  const userTexts = body.messages.filter((m) => m.role === "user").map((m) => m.content);
  const ragQuery = userTexts.slice(-2).join("\n").slice(-2000);
  const [memBlock, projCtx] = await Promise.all([
    memoryOn ? memoryContext(dbUser.id).catch(() => "") : Promise.resolve(""),
    body.projectId ? projectContext(dbUser.id, body.projectId, ragQuery).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  if (body.projectId && projCtx === null) return json({ error: "Project not found" }, 404);
  const projBlock = projCtx?.block;
  const fileSources = projCtx?.fileSources || [];
  let sys = systemPrompt(dbUser.name || "User", { memory: memoryOn, web: researchAvailable() });
  if (memBlock) sys += `\n\n${memBlock}`;
  if (projBlock) sys += `\n\n${projBlock}`;
  if (body.codeInterpreter) sys += `\n\n${codeInterpreterPrompt(body.codeInterpreter.files)}`;
  if (body.systemPrompt?.trim()) sys += `\n\nADDITIONAL PERSONA/INSTRUCTIONS FOR THIS CHAT:\n${body.systemPrompt.trim()}`;
  const messages: AIMessage[] = [
    { role: "system", content: sys },
    ...recent.map((m): AIMessage =>
      m.images?.length
        ? { role: m.role, content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url" as const, image_url: { url } }))] }
        : { role: m.role, content: m.content },
    ),
  ];

  // ---- quota (after validation so bad requests don't cost a message) ----
  const q = await takeQuota(dbUser.id, st.limit);
  if (!q.ok) {
    return json({
      error: `Today's limit (${st.limit} messages) has been reached. Please try again tomorrow` + (st.state === "trial" ? " or upgrade your plan." : "."),
      code: "LIMIT",
    }, 429);
  }

  // ---- web research? (heuristic, free) → stream-first path so the user sees progress ----
  const last = body.messages[body.messages.length - 1];
  const agentMode = isAgentRequest(body.model, last.content);
  const mode = !agentMode && researchAvailable()
    ? researchMode(last.content, { hasAttachment: !!(last.file?.text || last.image || last.images?.length) })
    : null;
  const t0 = Date.now();
  const routeInput = { requested: agentMode ? "quality" : body.model, hasImage, totalChars: total, lastUserText: recent[recent.length - 1].content.slice(-4000) };
  const baseHeaders = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "x-accel-buffering": "no",
    "x-arpa-used": String(q.used),
    "x-arpa-limit": String(st.limit),
    "x-request-id": log.rid,
    ...(projCtx ? { "x-arpa-project-context": projCtx.mode } : {}),
  };

  if (agentMode) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (s: string) => { try { controller.enqueue(encoder.encode(s)); } catch {} };
        const send = (obj: unknown) => write(`data: ${JSON.stringify(obj)}\n\n`);
        const hb = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
        try {
          if (fileSources.length) send({ arpa: { fileSources } });
          const context = recent.slice(-7, -1).map((m) => `${m.role}: ${m.content.slice(0, 600)}`).join("\n");
          const question = stripAgentCommand(last.content);
          const attached = last.file?.text ? `\n\nATTACHED FILE "${last.file.name.slice(0, 100)}" (start):\n${last.file.text.slice(0, 8000)}` : "";
          const result = await runAgent({
            question: question + attached, context, userId: dbUser.id, projectId: body.projectId, signal: req.signal, fileOffset: fileSources.length,
            onEvent: (e) => send({ arpa: e.fileSources ? { ...e, fileSources: [...fileSources, ...e.fileSources] } : e }),
          });
          log.info("agent.done", { uid, steps: result.steps.length, stoppedBy: result.stoppedBy, tools: result.steps.map((x) => x.tool) });
          void recordUsage({ userId: dbUser.id, kind: "tool", modelId: "agent", latencyMs: Date.now() - t0, ok: true, routeReason: `agent: ${result.steps.length} steps (${result.stoppedBy})` });

          // same conversation as a normal turn (attachments kept), with the "/agent" command removed
          const stripCmd = (c: string) => c.replace(/(^|\n)\s*\/agent\b\s*/i, "$1");
          const lastMsg = messages[messages.length - 1];
          const cleanedLast: AIMessage = typeof lastMsg.content === "string"
            ? { ...lastMsg, content: stripCmd(lastMsg.content) }
            : { ...lastMsg, content: (lastMsg.content as any[]).map((p) => (p.type === "text" ? { ...p, text: stripCmd(p.text) } : p)) } as AIMessage;
          const rMessages: AIMessage[] = [
            { role: "system", content: result.notes ? `${sys}\n\n${result.notes}` : sys },
            ...messages.slice(1, -1),
            cleanedLast,
          ];
          let conn: Awaited<ReturnType<typeof streamChat>>;
          try {
            conn = await streamChat(
              { ...routeInput, totalChars: total + result.notes.length },
              { messages: rMessages, temperature: body.temperature ?? 0.3, maxTokens: CFG.maxTokens, signal: req.signal },
            );
          } catch (e: any) {
            if (e?.name === "AbortError") throw e;
            await refundQuota(dbUser.id);
            log.error("route.fail", e, { uid, mode: "agent" });
            send({ error: { message: e instanceof GatewayError ? e.message : "The AI service is temporarily unavailable. Please try again.", code: "AI_UNAVAILABLE" } });
            send("[DONE]");
            return;
          }
          send({ arpa: { model: conn.model.label, status: null } });
          await pipe(conn, send, { userId: dbUser.id, uid, t0, log, routeReason: `${conn.decision.policy}: agent` });
        } catch (e: any) {
          if (e?.name !== "AbortError") {
            log.error("agent.stream.fail", e, { uid });
            send({ error: { message: "The answer was interrupted. Press Continue or Regenerate." } });
          }
        } finally {
          clearInterval(hb);
          try { controller.close(); } catch {}
        }
      },
    });
    return new Response(stream, { headers: { ...baseHeaders, "x-arpa-route": "agent" } });
  }

  if (mode) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (s: string) => { try { controller.enqueue(encoder.encode(s)); } catch {} };
        const send = (obj: unknown) => write(`data: ${JSON.stringify(obj)}\n\n`);
        const hb = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
        try {
          if (fileSources.length) send({ arpa: { fileSources } });
          let result: ResearchResult;
          try {
            const context = recent.slice(-5, -1).map((m) => `${m.role}: ${m.content.slice(0, 400)}`).join("\n");
            result = await research(last.content, mode, {
              userId: dbUser.id, context, signal: req.signal,
              onStatus: (s) => send({ arpa: { status: s } }),
            });
          } catch (e: any) {
            if (e?.name === "AbortError" || req.signal.aborted) throw e;
            log.warn("research.fail", { uid, err: e?.message });
            result = { mode, queries: [], sources: [] };
          }
          void recordUsage({ userId: dbUser.id, kind: "tool", modelId: "tavily:web_search", latencyMs: Date.now() - t0, ok: result.sources.length > 0, routeReason: `${mode}: ${result.queries.length} queries` });
          if (result.sources.length) send({ arpa: { sources: publicSources(result.sources) } });
          send({ arpa: { status: mode === "deep" ? "Writing report…" : "Writing answer…" } });

          const block = buildSourcesBlock(result);
          const rMessages: AIMessage[] = [{ role: "system", content: `${sys}\n\n${block}` }, ...messages.slice(1)];
          let conn: Awaited<ReturnType<typeof streamChat>>;
          try {
            conn = await streamChat(
              { ...routeInput, requested: mode === "deep" && (!body.model || body.model === "auto") ? "quality" : body.model, totalChars: total + block.length },
              { messages: rMessages, temperature: body.temperature ?? 0.3, maxTokens: CFG.maxTokens, signal: req.signal },
            );
          } catch (e: any) {
            if (e?.name === "AbortError") throw e;
            await refundQuota(dbUser.id);
            const attempts = e instanceof GatewayError ? e.attempts : [];
            log.error("route.fail", e, { uid, attempts, mode });
            void recordUsage({ userId: dbUser.id, kind: "chat", modelId: attempts[0]?.model, latencyMs: Date.now() - t0, ok: false, error: e?.message });
            send({ error: { message: e instanceof GatewayError ? e.message : "The AI service is temporarily unavailable. Please try again.", code: "AI_UNAVAILABLE" } });
            send("[DONE]");
            return;
          }
          log.info("route.ok", { uid, model: conn.model.id, policy: conn.decision.policy, mode, sources: result.sources.length, connectMs: Date.now() - t0 });
          send({ arpa: { model: conn.model.label, status: null } });
          await pipe(conn, send, { userId: dbUser.id, uid, t0, log, routeReason: `${conn.decision.policy}: ${mode} research` });
        } catch (e: any) {
          if (e?.name !== "AbortError") {
            log.error("research.stream.fail", e, { uid });
            send({ error: { message: "The answer was interrupted. Press Continue or Regenerate." } });
          }
        } finally {
          clearInterval(hb);
          try { controller.close(); } catch {}
        }
      },
    });
    return new Response(stream, { headers: { ...baseHeaders, "x-arpa-route": `research-${mode}` } });
  }

  // ---- route + connect (fallback happens here, before any byte is sent) ----
  let conn: Awaited<ReturnType<typeof streamChat>>;
  try {
    conn = await streamChat(routeInput, { messages, temperature: body.temperature ?? 0.3, maxTokens: CFG.maxTokens, signal: req.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") return new Response(null, { status: 499 });
    await refundQuota(dbUser.id);
    const attempts = e instanceof GatewayError ? e.attempts : [];
    log.error("route.fail", e, { uid, attempts });
    void recordUsage({ userId: dbUser.id, kind: "chat", modelId: attempts[0]?.model, latencyMs: Date.now() - t0, ok: false, error: e?.message });
    return json({ error: e instanceof GatewayError ? e.message : "The AI service is temporarily unavailable. Please try again.", code: "AI_UNAVAILABLE" }, 503);
  }
  const { model, decision, attempts } = conn;
  log.info("route.ok", { uid, model: model.id, policy: decision.policy, reason: decision.reason, attempts: attempts.length, connectMs: Date.now() - t0 });

  // ---- stream to client ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (s: string) => { try { controller.enqueue(encoder.encode(s)); } catch {} };
      const send = (obj: unknown) => write(`data: ${JSON.stringify(obj)}\n\n`);
      // SSE comment heartbeat keeps proxies from closing idle connections while the model thinks
      const hb = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
      try {
        if (fileSources.length) send({ arpa: { fileSources } });
        await pipe(conn, send, { userId: dbUser.id, uid, t0, log, routeReason: `${decision.policy}: ${decision.reason}` });
      } finally {
        clearInterval(hb);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...baseHeaders,
      "x-arpa-model": model.label,
      "x-arpa-model-id": model.id,
      "x-arpa-route": decision.policy,
    },
  });
}

/** Forward gateway events as OpenAI-style SSE chunks, then record usage. Never throws. */
async function pipe(
  conn: Awaited<ReturnType<typeof streamChat>>,
  send: (obj: unknown) => void,
  meta: { userId: string; uid: string; t0: number; log: ReturnType<typeof logger>; routeReason: string },
) {
  const { model } = conn;
  let usage: Usage | undefined;
  let ok = true, errMsg: string | undefined, firstTokenMs = 0;
  try {
    for await (const ev of conn.stream) {
      if (ev.type === "text") {
        if (!firstTokenMs) firstTokenMs = Date.now() - meta.t0;
        send({ choices: [{ delta: { content: ev.text }, finish_reason: null }] });
      } else if (ev.type === "finish") {
        send({ choices: [{ delta: {}, finish_reason: ev.reason }] });
      } else if (ev.type === "usage") {
        usage = ev.usage;
      }
    }
    send("[DONE]");
  } catch (e: any) {
    ok = false;
    errMsg = e?.message || "AI stream error";
    if (e?.name !== "AbortError") {
      meta.log.error("stream.fail", e, { uid: meta.uid, model: model.id });
      send({ error: { message: "The answer was interrupted. Press Continue or Regenerate." } });
    }
  } finally {
    meta.log.info("stream.end", { uid: meta.uid, model: model.id, ok, firstTokenMs, totalMs: Date.now() - meta.t0, in: usage?.inputTokens, out: usage?.outputTokens });
    await recordUsage({ userId: meta.userId, kind: "chat", model, usage, latencyMs: Date.now() - meta.t0, ok, error: errMsg, routeReason: meta.routeReason });
  }
}
