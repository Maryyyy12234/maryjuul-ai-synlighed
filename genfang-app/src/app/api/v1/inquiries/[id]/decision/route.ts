import { commit } from "@/lib/persistence-runtime.ts";
import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { decide } from "@/lib/store.ts";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const { tid, uid } = a.session;
  const rl = rateLimit(`decide:${uid}`, 30, 60_000);
  if (!rl.ok) return fail("rate_limited", "For mange handlinger. Vent et øjeblik.", 429, { "Retry-After": String(rl.retryAfterSec) });
  let body: { decision?: unknown; expectedVersion?: unknown; editedText?: unknown };
  try { body = (await readJson(req)) as typeof body; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (body.decision !== "approve" && body.decision !== "reject") return fail("invalid", "Ukendt handling.", 400);
  if (body.editedText !== undefined && typeof body.editedText !== "string") return fail("invalid", "Ugyldig tekst.", 400);
  const { id } = await ctx.params;
  const r = decide(tid, uid, id, { decision: body.decision, expectedVersion: Number(body.expectedVersion), editedText: body.editedText as string | undefined });
  const result = r;
  await commit();
  return respond(result, (ok) => ({ inquiry: ok.inquiry, delivery: "blokeret_testversion" }));
}
