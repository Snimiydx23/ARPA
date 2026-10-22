// ARPA — request validation (Zod). Routes call parseBody(req, Schema) and get typed data or a 400 Response.
import { z } from "zod";

const dataImage = z.string().max(6_000_000).regex(/^data:image\/[a-z+.-]+;base64,/i, "image must be a data:image/... URL");

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(200_000),
  image: dataImage.optional(),
  images: z.array(dataImage).max(5).optional(),
  file: z.object({ name: z.string().max(300), text: z.string().max(400_000) }).optional(),
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(400),
  model: z.string().max(200).optional(),                 // a model id OR a policy: auto | fast | balanced | quality
  temperature: z.number().min(0).max(1.5).optional(),
  systemPrompt: z.string().max(4000).optional(),
  projectId: z.string().max(40).nullable().optional(),
  // browser Python sandbox is available for this turn (data files the code can open at /data/<name>)
  codeInterpreter: z.object({ files: z.array(z.string().max(120)).max(10).default([]) }).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ImagineRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Please describe the image you want.").max(2000),
  quality: z.enum(["fast", "hd"]).optional(),
  aspect: z.enum(["square", "portrait", "landscape"]).optional(),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
});

export const EmailLoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Please enter a valid email."),
  name: z.string().trim().max(60).optional(),
  picture: z.string().max(500).optional(),
});

export const GoogleLoginSchema = z.object({ credential: z.string().min(20).max(8000) });

export const PlanSchema = z.object({ plan: z.string().min(1).max(40) });

export const PayVerifySchema = z.object({
  plan: z.string().min(1).max(40),
  razorpay_order_id: z.string().max(100).optional(),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().max(200).optional(),
});

export const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1, "Project name is required.").max(80),
  description: z.string().max(300).optional(),
  instructions: z.string().max(8000).optional(),
  emoji: z.string().max(8).optional(),
});
export const ProjectUpdateSchema = ProjectCreateSchema.partial();

export const ProjectFileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(0).max(100_000_000).optional(),
  text: z.string().min(1, "File has no readable text.").max(400_000),
});

export const MemoryCreateSchema = z.object({
  content: z.string().trim().min(2).max(500),
  source: z.enum(["user", "ai"]).optional(),
});
export const MemoryUpdateSchema = z.object({ content: z.string().trim().min(2).max(500) });
export const MemorySettingsSchema = z.object({ enabled: z.boolean() });

export const AdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), days: z.number().int().min(-3650).max(3650).refine((d) => d !== 0, "days cannot be 0"), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("block"), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("role"), role: z.enum(["user", "admin"]) }),
]);

const canvasContent = z.string().max(200_000, "Canvas is too large (max 200,000 characters).");
export const CanvasCreateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  kind: z.enum(["doc", "code"]).default("doc"),
  language: z.string().trim().max(30).regex(/^[a-z0-9+#.\-]*$/i).optional(),
  content: canvasContent,
  chatId: z.string().max(40).optional(),
});
export const CanvasUpdateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  content: canvasContent.optional(),
  language: z.string().trim().max(30).regex(/^[a-z0-9+#.\-]*$/i).optional(),
  version: z.string().trim().max(60).optional(), // when set, also store a snapshot with this label
});
export const CanvasEditSchema = z.object({
  content: canvasContent,
  kind: z.enum(["doc", "code"]).default("doc"),
  language: z.string().max(30).optional(),
  instruction: z.string().trim().min(2, "Tell ARPA what to change.").max(2000),
  selection: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).refine((s) => s.end > s.start, "empty selection").optional(),
});

/** Parse JSON body against a schema → { data } or { error: Response(400) }. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T>; error?: undefined } | { data?: undefined; error: Response }> {
  let raw: unknown;
  try { raw = await req.json(); } catch { return { error: bad("Request body must be valid JSON.") }; }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return { error: bad(`${where}${first?.message || "Invalid request."}`) };
  }
  return { data: r.data };
}

function bad(msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg, code: "BAD_REQUEST" }), {
    status: 400,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
