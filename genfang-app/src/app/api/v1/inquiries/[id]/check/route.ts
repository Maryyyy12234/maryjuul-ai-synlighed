import { authed, fail, json, readJson } from "@/lib/api.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { getInquiry, getTenant, guardFor } from "@/lib/store.ts";

// Kører sikkerhedskontrollen på en redigeret tekst uden at gemme noget.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const rl = rateLimit(`check:${a.session.uid}`, 120, 60_000);
  if (!rl.ok) return fail("rate_limited", "For mange tjek.", 429);
  let b: { text?: unknown };
  try { b = (await readJson(req)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const { id } = await ctx.params;
  const i = getInquiry(a.session.tid, id);
  const t = getTenant(a.session.tid);
  if (!i || !t) return fail("not_found", "Sagen findes ikke.", 404);
  return json({ guard: guardFor(t, i, String(b.text ?? "").slice(0, 5000)) });
}
