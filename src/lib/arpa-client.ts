// ARPA V3 — client API helper + types
export type Plan = { id: string; label: string; price: number; days: number };
export type Model = { id: string; label: string };
export type SubStatus = {
  state: "paid" | "trial" | "expired";
  until: number;
  daysLeft: number;
  plan: string;
  limit: number;
};
export type ArpaUser = { name: string; email: string; picture: string };
export type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  model?: string;
  error?: string;
  code?: string;
  cut?: boolean;
  ms?: number;
  streaming?: boolean;
  edited?: boolean;
  reaction?: "up" | "down" | null;
};
export type Chat = {
  id: string;
  title: string;
  at: number;
  msgs: ChatMsg[];
  pinned?: boolean;
  tags?: string[];
  shared?: boolean;
  archived?: boolean;
  systemPrompt?: string;
};

export type AppConfig = {
  app: string;
  dev: boolean;
  trialDays: number;
  limitPaid: number;
  limitTrial: number;
  plans: Plan[];
  models: Model[];
  support: string;
  paymentMode: "live" | "simulated";
};

const TOKEN_KEY = "arpa_token";
const MODEL_KEY = "arpa_model";
const THEME_KEY = "arpa_theme";

export const ls = {
  get<T>(k: string, d: T): T {
    if (typeof window === "undefined") return d;
    try { const v = window.localStorage.getItem(k); return v == null ? d : JSON.parse(v) as T; }
    catch { return d; }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
  del(k: string) {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(k); } catch {}
  },
};

export const tokenStore = {
  get: () => (typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) || ""),
  set: (t: string) => ls.set(TOKEN_KEY, t),
  clear: () => ls.del(TOKEN_KEY),
};

export const modelStore = {
  get: () => ls.get<string>(MODEL_KEY, ""),
  set: (m: string) => ls.set(MODEL_KEY, m),
};

export const themeStore = {
  get: () => ls.get<"light" | "dark" | "auto">("arpa_theme", "auto"),
  set: (t: "light" | "dark" | "auto") => ls.set("arpa_theme", t),
};

// Authenticated fetch wrapper
export async function api<T = any>(
  path: string,
  opt: RequestInit = {}
): Promise<{ status: number; data: T }> {
  const token = tokenStore.get();
  const headers = new Headers(opt.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const r = await fetch(path, { ...opt, headers });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { status: r.status, data };
}

// SSE streaming fetch — returns the reader + headers
export async function streamChat(
  body: { messages: { role: string; content: string }[]; model: string; temperature?: number; systemPrompt?: string },
  signal: AbortSignal
): Promise<{ response: Response }> {
  const token = tokenStore.get();
  const r = await fetch("/api/chat", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response: r };
}

export function rupee(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

export function fmtDate(t: number) {
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// V3.1 user settings (persisted locally)
export type ArpaSettings = {
  temperature: number; // 0..1.5
  voice: string; // TTS voice id
  ttsSpeed: number; // 0.5..2
};

const SETTINGS_KEY = "arpa_settings";
export const settingsStore = {
  get: (): ArpaSettings =>
    ls.get<ArpaSettings>(SETTINGS_KEY, { temperature: 0.3, voice: "tongtong", ttsSpeed: 1 }),
  set: (s: Partial<ArpaSettings>) => {
    const cur = settingsStore.get();
    ls.set(SETTINGS_KEY, { ...cur, ...s });
    return { ...cur, ...s } as ArpaSettings;
  },
};

// Convert a chat to markdown for export
export function chatToMarkdown(title: string, msgs: ChatMsg[]) {
  const lines: string[] = [`# ${title}`, ""];
  for (const m of msgs) {
    if (m.role === "user") {
      lines.push("**You:**", "", m.content, "");
    } else if (m.error) {
      lines.push(`> ⚠️ ${m.error}`, "");
    } else if (m.content) {
      lines.push(`**ARPA${m.model ? ` (${m.model})` : ""}:**`, "", m.content, "");
    }
  }
  return lines.join("\n");
}

// Trigger a browser download
export function downloadFile(filename: string, content: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

// V3.10: Export chat as JSON (backup/restore format)
export function chatToJson(title: string, msgs: ChatMsg[]) {
  const data = {
    title,
    exportedAt: new Date().toISOString(),
    version: 3,
    messageCount: msgs.length,
    messages: msgs.filter((m) => !m.streaming).map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.model ? { model: m.model } : {}),
      ...(m.ms ? { ms: m.ms } : {}),
      ...(m.edited ? { edited: true } : {}),
      ...(m.reaction ? { reaction: m.reaction } : {}),
    })),
  };
  return JSON.stringify(data, null, 2);
}

// V3.9: Print a chat (opens browser print dialog → save as PDF)
export function printChat(title: string, msgs: ChatMsg[]) {
  const html = chatToHtml(title, msgs);
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { return false; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
  return true;
}

// Convert chat to a print-optimized HTML document
export function chatToHtml(title: string, msgs: ChatMsg[]) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = msgs.map(m => {
    if (m.role === "user") {
      return `<div class="msg user"><span class="role">You</span><div class="content">${esc(m.content)}</div></div>`;
    } else if (m.error) {
      return `<div class="msg ai error"><span class="role">ARPA</span><div class="content">⚠️ ${esc(m.error)}</div></div>`;
    } else if (m.content) {
      return `<div class="msg ai"><span class="role">ARPA${m.model ? ` <small>(${esc(m.model)})</small>` : ""}</span><div class="content">${esc(m.content)}</div></div>`;
    }
    return "";
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 2rem auto; padding: 0 1rem; color: #1a1a2e; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #6d28d9; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  .msg { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; }
  .msg.user { background: #f0f0f5; margin-left: 2rem; }
  .msg.ai { background: #faf5ff; border-left: 3px solid #6d28d9; margin-right: 2rem; }
  .msg.error { border-left-color: #e11d48; background: #fff1f2; }
  .role { font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #6d28d9; display: block; margin-bottom: 0.25rem; }
  .msg.user .role { color: #555; }
  .content { white-space: pre-wrap; word-wrap: break-word; }
  small { font-weight: 400; color: #888; }
  .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.75rem; color: #888; text-align: center; }
  @media print { body { margin: 0; max-width: 100%; } .msg { break-inside: avoid; } }
</style></head><body>
<h1>${esc(title)}</h1>
${body}
<div class="footer">Exported from ARPA · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
</body></html>`;
}

// Available TTS voices (subset of z-ai SDK voices, with friendly names)
export const TTS_VOICES = [
  { id: "tongtong", label: "Tongtong (default)", desc: "Balanced neutral voice" },
  { id: "chuichui", label: "Chuichui", desc: "Lighter, friendly" },
  { id: "xiaochen", label: "Xiaochen", desc: "Warm, mature" },
  { id: "jam", label: "Jam", desc: "Energetic" },
  { id: "kazi", label: "Kazi", desc: "Clear, neutral" },
  { id: "douji", label: "Douji", desc: "Soft, calm" },
  { id: "luodo", label: "Luodo", desc: "Deep" },
] as const;

// V3.8: Prompt templates (localStorage-based)
export type PromptTemplate = {
  id: string;
  title: string;
  body: string;
  icon?: string; // emoji
  builtin?: boolean;
};

const TEMPLATES_KEY = "arpa_templates_v38";

export const templatesStore = {
  get: (): PromptTemplate[] => {
    const builtin = BUILTIN_TEMPLATES;
    const custom = ls.get<PromptTemplate[]>(TEMPLATES_KEY, []);
    return [...builtin, ...custom];
  },
  getCustom: (): PromptTemplate[] => ls.get<PromptTemplate[]>(TEMPLATES_KEY, []),
  add: (t: Omit<PromptTemplate, "id">): PromptTemplate => {
    const custom = ls.get<PromptTemplate[]>(TEMPLATES_KEY, []);
    const newT: PromptTemplate = { ...t, id: uid(), builtin: false };
    custom.push(newT);
    ls.set(TEMPLATES_KEY, custom);
    return newT;
  },
  remove: (id: string) => {
    const custom = ls.get<PromptTemplate[]>(TEMPLATES_KEY, []);
    ls.set(TEMPLATES_KEY, custom.filter((t) => t.id !== id));
  },
};

export const BUILTIN_TEMPLATES: PromptTemplate[] = [
  { id: "b_email", title: "Professional email", body: "Write a professional email in which I ask [person/boss] for [request] regarding [purpose]. The tone should be polite and formal.", icon: "✉️", builtin: true },
  { id: "b_emi", title: "EMI calculation", body: "I want to take a loan of ₹[amount], at [rate]% interest, with a tenure of [years] years. Calculate the EMI, show the total interest, and show the working.", icon: "🧮", builtin: true },
  { id: "b_explain", title: "Explain concept", body: "Explain [concept] in simple terms for a beginner, with a real-life example. Answer in English.", icon: "💡", builtin: true },
  { id: "b_code", title: "Code with explanation", body: "Write a function in [language] that does [task]. Give the code with a step-by-step explanation in English.", icon: "💻", builtin: true },
  { id: "b_translate", title: "Translate text", body: "Provide both a Hindi and a Hinglish translation of this text:\n\n[paste text here]", icon: "🌐", builtin: true },
  { id: "b_summarize", title: "Summarize", body: "List the 5 main bullet points of the text below and give a one-line summary:\n\n[paste text here]", icon: "📋", builtin: true },
  { id: "b_leave", title: "Leave application", body: "Write a leave application for [days] day(s), reason: [reason]. Use a professional and polite tone.", icon: "📝", builtin: true },
  { id: "b_recipe", title: "Recipe suggestion", body: "Give a recipe for [dish] — ingredients (with quantities) and step-by-step instructions. Servings: [N] people.", icon: "🍳", builtin: true },
];
