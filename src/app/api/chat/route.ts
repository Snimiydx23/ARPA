// POST /api/chat — AI streaming chat (V3: replaces V2 api/chat.js)
// Uses z-ai-web-dev-sdk instead of NVIDIA Nemotron. The SDK yields Uint8Array
// chunks containing raw SSE text, so we parse them and re-emit as per-token SSE.
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import {
  CFG, models, bearerUid, status, takeQuota, json, systemPrompt,
} from "@/lib/arpa";

const MAX_CTX_CHARS = CFG.maxCtx;

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
    .map((m: any) => ({ role: m.role as string, content: m.content.slice(0, 40000) }));
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
  const messages = [
    { role: "assistant", content: basePrompt },
    ...msgs.slice(start),
  ];

  // Build SSE stream from z-ai-web-dev-sdk.
  // The SDK yields Uint8Array chunks containing raw SSE text; we parse those
  // and re-emit per-token `data:` frames so the client can render token-by-token.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      try {
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages,
          stream: true,
          temperature,
          thinking: { type: "disabled" },
        });

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

        for await (const chunk of completion as any) {
          if (chunk instanceof Uint8Array) {
            handleText(Buffer.from(chunk).toString("utf8"));
          } else if (typeof chunk === "string") {
            handleText(chunk);
          } else if (chunk?.choices?.[0]?.delta?.content) {
            send({ choices: [{ delta: { content: chunk.choices[0].delta.content }, finish_reason: chunk.choices[0].finish_reason || null }] });
          }
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
      "x-arpa-model": model,
      "x-arpa-used": String(q.used),
      "x-arpa-limit": String(st.limit),
    },
  });
}
