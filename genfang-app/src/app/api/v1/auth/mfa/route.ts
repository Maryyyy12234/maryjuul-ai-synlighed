import { fail, readJson } from "@/lib/api.ts";
import { issueSession } from "@/lib/issue-session.ts";
import { commit } from "@/lib/persistence-runtime.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { mfaTicketSecret, verifySession } from "@/lib/session.ts";
import { checkMfaCode, getUser } from "@/lib/store.ts";

export const runtime = "nodejs";

// Andet trin af login: MFA-billet + 6-cifret kode → session.
export async function POST(req: Request) {
  let b: { ticket?: unknown; code?: unknown };
  try { b = (await readJson(req, 4096)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const t = await verifySession(typeof b.ticket === "string" ? b.ticket : "", { secret: mfaTicketSecret() });
  if (!t) return fail("unauthorized", "Login er udløbet. Start forfra.", 401);
  const rl = rateLimit(`mfa:${t.uid}`, 5, 15 * 60_000);
  if (!rl.ok) return fail("rate_limited", "For mange forsøg. Prøv igen om lidt.", 429, { "Retry-After": String(rl.retryAfterSec) });
  const user = getUser(t.tid, t.uid);
  if (!user) return fail("unauthorized", "Login er udløbet. Start forfra.", 401);
  const ok = checkMfaCode(t.tid, t.uid, String(b.code ?? ""));
  if (!ok) { await commit(); return fail("unauthorized", "Koden passer ikke.", 401); }
  return issueSession(req, user, true);
}
