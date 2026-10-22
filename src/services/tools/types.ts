// ARPA — universal tool framework. Every tool declares what it does, its input schema and the
// permissions it needs; the executor validates input and enforces permissions before running it.
import type { z } from "zod";

export type ToolPermission = "network:search" | "network:read" | "compute" | "data:project";

export interface ToolContext {
  userId: string;
  signal?: AbortSignal;
  /** permissions granted for this call (policy decided by the caller, never by the model) */
  granted: ToolPermission[];
  /** active project of the chat (project tools only work inside a project) */
  projectId?: string;
}

export interface Tool<I extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  description: string;
  inputSchema: I;
  permissions: ToolPermission[];
  /** true when the tool can run in this deployment (e.g. API key present) */
  available(): boolean;
  execute(input: z.infer<I>, ctx: ToolContext): Promise<O>;
}

export class ToolError extends Error {
  constructor(message: string, public code: "NOT_FOUND" | "UNAVAILABLE" | "FORBIDDEN" | "BAD_INPUT" | "FAILED") {
    super(message);
    this.name = "ToolError";
  }
}
