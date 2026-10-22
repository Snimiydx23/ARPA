// ARPA — tool executor: lookup → availability → permission check → input validation → run (with timeout).
import type { Tool, ToolContext } from "./types";
import { ToolError } from "./types";
import { toolsList as webTools } from "./web";
import { calculatorTool } from "./calculator";
import { projectSearchTool } from "./project";

const toolsList: Tool<any, any>[] = [...webTools, calculatorTool, projectSearchTool];

const registry = new Map<string, Tool<any, any>>(toolsList.map((t) => [t.name, t]));

export function getTool(name: string) {
  return registry.get(name);
}

export function listTools() {
  return [...registry.values()].map((t) => ({ name: t.name, description: t.description, permissions: t.permissions, available: t.available() }));
}

export function toolAvailable(name: string) {
  return !!registry.get(name)?.available();
}

export async function runTool<O = unknown>(name: string, rawInput: unknown, ctx: ToolContext, timeoutMs = 20_000): Promise<O> {
  const tool = registry.get(name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`, "NOT_FOUND");
  if (!tool.available()) throw new ToolError(`${name} is not available in this deployment.`, "UNAVAILABLE");
  const missing = tool.permissions.filter((p) => !ctx.granted.includes(p));
  if (missing.length) throw new ToolError(`${name} needs permission: ${missing.join(", ")}`, "FORBIDDEN");
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) throw new ToolError(`Invalid input for ${name}: ${parsed.error.issues[0]?.message}`, "BAD_INPUT");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const onParentAbort = () => ac.abort();
  ctx.signal?.addEventListener("abort", onParentAbort);
  try {
    return (await tool.execute(parsed.data, { ...ctx, signal: ac.signal })) as O;
  } catch (e: any) {
    if (e instanceof ToolError) throw e;
    if (e?.name === "AbortError") throw new ToolError(`${name} timed out`, "FAILED");
    throw new ToolError(`${name} failed: ${e?.message || e}`, "FAILED");
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener("abort", onParentAbort);
  }
}
