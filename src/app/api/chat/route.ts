// POST /api/chat — AI streaming chat (V3: replaces V2 api/chat.js)
// Uses NVIDIA Nemotron via NIM's OpenAI-compatible API (src/lib/llm.ts).
// Upstream SSE is parsed and re-emitted as per-token SSE in the same format the client expects.
import { nvChat, noThinking, VISION_MODEL } from "@/lib/llm";
import { db } from "@/lib/db";
import {
  CFG, models, bearerUid, status, takeQuota, json, systemPrompt,
} from "@/lib/arpa";

const MAX_CTX_CHARS = CFG.maxCtx;
// Allow long streamed answers on Vercel (seconds)
export const maxDuration = 300;

function pickTemperature(body: unknown): number {
  if (!body || typeof body !== "object") return 0.3;
  const v = (body as { temperature?: unknown }).temperature;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1.5) return 0.3;
  return n;
}

export async function POST(req: Request) {
  const uid = bearerUid(req);
  if (!uid) return json({ error: "Session expired, please log in again." }, 401);

  // fetch user + subscription
  const dbUser = await db.user.findUnique({ where: { uid } });
  if (!dbUser) return json({ error: "User record not found. Please log in again." }, 401);

  const st = status(dbUser);
  if (st.state === "expired") {
    return json({ error: "Your free trial has ended. Please pick a plan to keep chatting.", code: "EXPIRED" }, 402);
  }
  const q = await takeQuota(dbUser.id, st.limit);
  if (!q.ok) {
    return json({
      error: `Today's limit (${st.limit} messages) has been reached. Please try again tomorrow` +
        (st.state === "trial" ? " or upgrade your plan." : "."),
      code: "LIMIT",
    }, 429);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const list = models();
  const model = list.some(m => m.id === body.model) ? body.model : list[0].id;
  const temperature = pickTemperature(body);
  // V3.5: optional per-chat custom system prompt (persona/instructions)
  const customPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.slice(0, 2000) : "";

  // History trim — keep recent messages within context budget
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m: any) => {
      const o: { role: string; content: string; image?: string } = { role: m.role as string, content: m.content.slice(0, 40000) };
      // optional attached image (data-URL) on user messages — max ~6MB
      if (m.role === "user" && typeof m.image === "string" && /^data:image\/[a-z+]+;base64,/i.test(m.image) && m.image.length < 6_000_000) {
        o.image = m.image;
      }
      return o;
    });
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") {
    return json({ error: "Message is empty" }, 400);
  }
  let total = 0, start = msgs.length;
  while (start > 0 && total + msgs[start - 1].content.length <= MAX_CTX_CHARS) {
    total += msgs[start - 1].content.length;
    start--;
  }
  if (start === msgs.length) start = msgs.length - 1;

  // V3.5: build the system prompt — base ARPA prompt + optional custom persona
  let basePrompt = systemPrompt(dbUser.name || "User");
  if (customPrompt.trim()) {
    basePrompt += `\n\nADDITIONAL PERSONA/INSTRUCTIONS FOR THIS CHAT:\n${customPrompt.trim()}`;
  }
  const recent = msgs.slice(start);
  // if any message in context carries an image → use the multimodal model for this turn
  const hasImage = recent.some((m: any) => m.image);
  const useModel = hasImage ? VISION_MODEL : model;
  const messages = [
    { role: "system", content: basePrompt },
    ...recent.map((m: any) =>
      m.image
        ? { role: m.role, content: [{ type: "text", text: m.content }, { type: "image_url", image_url: { url: m.image } }] }
        : { role: m.role, content: m.content }
    ),
  ];
  // per-model extras: Nemotron → thinking off; vision model → optional reasoning_effort
  const extras: Record<string, unknown> = hasImage
    ? (process.env.VISION_REASONING_EFFORT ? { reasoning_effort: process.env.VISION_REASONING_EFFORT } : {})
    : noThinking;

  // Build SSE stream from NVIDIA NIM and re-emit per-token `data:` frames.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      try {
        const upstream = await nvChat({
          model: useModel,
          messages,
          stream: true,
          temperature: hasImage ? 0.6 : temperature,
          top_p: 0.95,
          max_tokens: CFG.maxTokens,
          ...extras,
        }, req.signal);

        let buf = "";
        const handleText = (text: string) => {
          buf += text;
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const ln of lines) {
            const t = ln.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload) continue;
            if (payload === "[DONE]") return;
            try {
              const j = JSON.parse(payload);
              const choice = j?.choices?.[0];
              if (choice?.delta?.content) {
                send({ choices: [{ delta: { content: choice.delta.content }, finish_reason: null }] });
              }
              if (choice?.finish_reason) {
                send({ choices: [{ delta: {}, finish_reason: choice.finish_reason }] });
              }
            } catch {}
          }
        };

        const reader = upstream.body!.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          handleText(dec.decode(value, { stream: true }));
        }
        if (buf.trim()) handleText("\n");
        send("[DONE]");
      } catch (e: any) {
        send({ error: { message: e?.message || "AI stream error" } });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "x-arpa-model": hasImage ? "ARPA Vision" : (list.find(m => m.id === model)?.label || model),
      "x-arpa-used": String(q.used),
      "x-arpa-limit": String(st.limit),
    },
  });
}
