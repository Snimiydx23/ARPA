// GET /api/health — liveness: the app process is up (no external calls). Use for uptime monitors.
export const dynamic = "force-dynamic";
export function GET() {
  return new Response(JSON.stringify({ ok: true, service: "arpa", time: new Date().toISOString() }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
