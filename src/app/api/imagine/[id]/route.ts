// GET /api/imagine/[id] — serve an AI-generated image (id is an unguessable cuid, so <img src> works without auth).
// ?download=1 → forces a file download.
import { db } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/i.test(id || "")) return new Response("Not found", { status: 404 });
  const row = await db.generatedImage.findUnique({ where: { id }, select: { data: true, mime: true } });
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(row.data, "base64");
  const ext = row.mime === "image/png" ? "png" : row.mime === "image/webp" ? "webp" : "jpg";
  const download = new URL(req.url).searchParams.get("download");
  return new Response(bytes, {
    headers: {
      "content-type": row.mime,
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      ...(download ? { "content-disposition": `attachment; filename="ARPA-image-${id.slice(-6)}.${ext}"` } : {}),
    },
  });
}
