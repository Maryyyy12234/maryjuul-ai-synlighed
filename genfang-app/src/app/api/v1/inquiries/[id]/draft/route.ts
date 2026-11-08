import { improveDraftWithAi } from "@/lib/store.ts";
import { commit } from "@/lib/persistence-runtime.ts";
import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { regenerateDraft } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let body: { expectedVersion?: unknown };
  try { body = (await readJson(req, 1024)) as typeof body; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const { id } = await ctx.params;
  const result = regenerateDraft(a.session.tid, a.session.uid, id, Number(body.expectedVersion));
  if (result.ok) await improveDraftWithAi(a.session.tid, result.inquiry.id);
  await commit();
  return respond(result, (ok) => ({ inquiry: ok.inquiry, guard: ok.guard }));
}
