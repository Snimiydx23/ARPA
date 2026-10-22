// ARPA — project_search tool: hybrid search inside the chat's project knowledge files (RAG).
import { z } from "zod";
import type { Tool } from "./types";
import { ToolError } from "./types";
import { db } from "@/lib/db";
import { ensureIndexed, searchProject, snippetAround } from "@/services/knowledge";

export const projectSearchInput = z.object({
  query: z.string().trim().min(2).max(400),
  maxResults: z.number().int().min(1).max(8).default(5),
});

export type ProjectHit = { fileId: string; name: string; label: string; text: string; excerpt: string };

export const projectSearchTool: Tool<typeof projectSearchInput, ProjectHit[]> = {
  name: "project_search",
  description: "Search the user's project knowledge files (DPRs, CMA, statements, policies…) and return the most relevant excerpts with file name and page/sheet.",
  inputSchema: projectSearchInput,
  permissions: ["data:project"],
  available: () => true,
  async execute(input, ctx) {
    if (!ctx.projectId) throw new ToolError("This chat is not inside a project.", "UNAVAILABLE");
    const files: any[] = (await db.projectFile.findMany({ where: { projectId: ctx.projectId, userId: ctx.userId }, select: { id: true, name: true } })) || [];
    if (!files.length) return [];
    await ensureIndexed(ctx.userId, ctx.projectId);
    const names = new Map(files.map((f) => [f.id, f.name as string]));
    const hits = await searchProject(ctx.userId, ctx.projectId, input.query);
    return hits.slice(0, input.maxResults).map((h) => ({
      fileId: h.fileId, name: names.get(h.fileId) || "file", label: h.label, text: h.text.slice(0, 2500), excerpt: snippetAround(h.text, input.query),
    }));
  },
};
