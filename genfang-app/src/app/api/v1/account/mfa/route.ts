import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { commit } from "@/lib/persistence-runtime.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { confirmMfa, disableMfa, startMfa } from "@/lib/store.ts";

export const runtime = "nodejs";

// Opsætning af MFA for den indloggede bruger: { action: "start" | "confirm" | "disable", code? }
export async function POST(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const { tid, uid } = a.session;
  if (!rateLimit(`mfa-setup:${uid}`, 10, 15 * 60_000).ok) return fail("rate_limited", "For mange forsøg.", 429);
  let b: { action?: unknown; code?: unknown };
  try { b = (await readJson(req, 1024)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const code = String(b.code ?? "");
  const result = b.action === "start" ? startMfa(tid, uid) : b.action === "confirm" ? confirmMfa(tid, uid, code) : b.action === "disable" ? disableMfa(tid, uid, code) : null;
  if (!result) return fail("invalid", "Ukendt handling.", 400);
  await commit();
  return respond(result as never, (ok: Record<string, unknown>) => { const { ok: _ok, ...rest } = ok; return rest; });
}
