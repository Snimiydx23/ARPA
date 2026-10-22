// ARPA — long-term user memory. Only saved after the user confirms; fully viewable/editable/deletable.
import { db } from "@/lib/db";

export const MEMORY_LIMITS = { maxItems: 100, maxContextChars: 4000 };

// Things we never store, even if suggested (defence in depth — the UI also asks the user first)
const SENSITIVE_RE = /\b(password|passcode|pin\b|otp|cvv|card number|credit card|debit card|aadhaar|aadhar|pan (no|number)|account number|ifsc|ssn|passport|api key|secret key|private key|token)\b|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}(?:[\s-]?\d{4})?\b/i;

export function isSensitive(text: string) { return SENSITIVE_RE.test(text); }

export async function listMemories(userId: string) {
  const rows = await db.memory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: MEMORY_LIMITS.maxItems, select: { id: true, content: true, source: true, createdAt: true } });
  return rows.map((r: any) => ({ ...r, createdAt: r.createdAt.getTime() }));
}

export async function addMemory(userId: string, content: string, source: "user" | "ai" = "user") {
  const text = content.trim().replace(/\s+/g, " ");
  if (isSensitive(text)) throw new MemoryError("For your safety ARPA does not store passwords, card/account/ID numbers or keys.");
  const count = await db.memory.count({ where: { userId } });
  if (count >= MEMORY_LIMITS.maxItems) throw new MemoryError(`Memory is full (${MEMORY_LIMITS.maxItems} items). Delete some first.`);
  const dup = await db.memory.findFirst({ where: { userId, content: { equals: text, mode: "insensitive" } }, select: { id: true } });
  if (dup) return { id: dup.id, duplicate: true };
  const r = await db.memory.create({ data: { userId, content: text, source }, select: { id: true } });
  return { id: r.id, duplicate: false };
}

export async function updateMemory(userId: string, id: string, content: string) {
  const text = content.trim().replace(/\s+/g, " ");
  if (isSensitive(text)) throw new MemoryError("For your safety ARPA does not store passwords, card/account/ID numbers or keys.");
  return (await db.memory.updateMany({ where: { id, userId }, data: { content: text } })).count > 0;
}

export async function deleteMemory(userId: string, id: string) {
  return (await db.memory.deleteMany({ where: { id, userId } })).count > 0;
}

export async function clearMemories(userId: string) {
  return (await db.memory.deleteMany({ where: { userId } })).count;
}

export async function setMemoryEnabled(userId: string, enabled: boolean) {
  await db.user.update({ where: { id: userId }, data: { memoryEnabled: enabled } });
}

/** System-prompt block with the user's memories (newest first, within budget). */
export async function memoryContext(userId: string): Promise<string> {
  const items = await db.memory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 60, select: { content: true } });
  return buildMemoryBlock(items.map((i: any) => i.content), MEMORY_LIMITS.maxContextChars);
}

export function buildMemoryBlock(items: string[], budget: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const it of items) {
    if (used + it.length > budget) break;
    lines.push(`- ${it}`);
    used += it.length + 3;
  }
  return lines.length
    ? `WHAT YOU KNOW ABOUT THE USER (saved memories — use when relevant, don't repeat them back unprompted):\n${lines.join("\n")}`
    : "";
}

export class MemoryError extends Error { constructor(m: string) { super(m); this.name = "MemoryError"; } }
