// The AI may end a reply with "[[MEMORY: fact]]" to PROPOSE a memory. The app strips it and shows
// a "Remember this?" chip — nothing is saved until the user clicks Save.
const END_RE = /\n?\s*\[\[\s*MEMORY\s*:\s*([^\]\n]{2,300})\]\]\s*$/i;

export function extractMemoryMarker(content: string): { memory?: string; content: string } {
  const m = content.match(END_RE);
  if (!m) return { content };
  return { memory: m[1].trim().replace(/^["']|["']$/g, ""), content: content.slice(0, m.index).trimEnd() };
}

/** While streaming, hide a memory marker that is still being typed at the end ("[[MEM…"). */
const PARTIAL_RE = /^\[\[\s*(?:M(?:E(?:M(?:O(?:R(?:Y)?)?)?)?)?)?(?:\s*:[^\]\n]*)?\]?$/i;
export function hideStreamingMemory(content: string): string {
  const full = extractMemoryMarker(content);
  if (full.memory) return full.content;
  const at = content.lastIndexOf("[[");
  if (at >= 0 && PARTIAL_RE.test(content.slice(at))) return content.slice(0, at).trimEnd();
  return content;
}
