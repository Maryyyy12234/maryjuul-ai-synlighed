import { authed, readJson, fail, respond } from "@/lib/api.ts";
import { anonymizeCustomer } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let body: { confirm?: unknown };
  try { body = (await readJson(req, 512)) as typeof body; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (body.confirm !== "ANONYMISER") return fail("invalid", "Bekræft med teksten ANONYMISER.", 400);
  const { id } = await ctx.params;
  return respond(anonymizeCustomer(a.session.tid, a.session.uid, id), (ok) => ({ affected: ok.affected }));
}
