import { authed, fail, readJson, requireSuper, respond } from "@/lib/api.ts";
import { setTenantPaused } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!requireSuper(a.session)) return fail("not_found", "Ikke fundet.", 404);
  let b: { paused?: unknown };
  try { b = (await readJson(req, 512)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (typeof b.paused !== "boolean") return fail("invalid", "Angiv paused: true/false.", 400);
  const { id } = await ctx.params;
  return respond(setTenantPaused(a.session.uid, id, b.paused), (ok) => ({ paused: ok.paused }));
}
