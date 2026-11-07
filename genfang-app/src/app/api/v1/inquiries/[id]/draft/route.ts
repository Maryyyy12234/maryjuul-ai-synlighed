import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { regenerateDraft } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let body: { expectedVersion?: unknown };
  try { body = (await readJson(req, 1024)) as typeof body; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const { id } = await ctx.params;
  return respond(regenerateDraft(a.session.tid, a.session.uid, id, Number(body.expectedVersion)), (ok) => ({ inquiry: ok.inquiry, guard: ok.guard }));
}
