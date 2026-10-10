// POST /api/auth/logout — stateless in V3 (client just drops the token).
// Kept for API parity with V2.
import { json } from "@/lib/arpa";
export async function POST() {
  return json({ ok: true });
}
