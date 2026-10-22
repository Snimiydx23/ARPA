// ARPA — AI usage & cost tracking (one row per AI call). Never throws: tracking must not break chat.
import { db } from "@/lib/db";
import type { ModelInfo, Usage } from "./types";

export type UsageKind = "chat" | "title" | "image" | "vision" | "enhance" | "tool" | "canvas";

export async function recordUsage(e: {
  userId: string;
  kind: UsageKind;
  model?: ModelInfo | null;
  modelId?: string;
  usage?: Usage;
  latencyMs: number;
  ok: boolean;
  error?: string;
  routeReason?: string;
}) {
  try {
    const u = e.usage || { inputTokens: 0, outputTokens: 0, estimated: true };
    const cost = e.model ? (u.inputTokens * e.model.costIn + u.outputTokens * e.model.costOut) / 1_000_000 : 0;
    await db.usageEvent.create({
      data: {
        userId: e.userId,
        kind: e.kind,
        model: e.model?.id || e.modelId || "",
        provider: e.model?.provider || "",
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        estimated: u.estimated,
        costUsd: cost,
        latencyMs: Math.round(e.latencyMs),
        ok: e.ok,
        error: e.error ? e.error.slice(0, 300) : null,
        routeReason: e.routeReason ? e.routeReason.slice(0, 200) : null,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "ai.usage", event: "record.fail", error: (err as Error)?.message }));
  }
}
