import { commit } from "@/lib/persistence-runtime.ts";
import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { decideQuote } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let body: { decision?: unknown; expectedVersion?: unknown };
  try { body = (await readJson(req, 1024)) as typeof body; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (body.decision !== "approve" && body.decision !== "reject") return fail("invalid", "Ukendt handling.", 400);
  const { id } = await ctx.params;
  const result = decideQuote(a.session.tid, a.session.uid, id, { decision: body.decision, expectedVersion: Number(body.expectedVersion) });
  await commit();
  return respond(result, (ok) => ({ quote: ok.quote }));
}
