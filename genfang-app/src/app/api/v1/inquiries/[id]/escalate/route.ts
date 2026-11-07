import { commit } from "@/lib/persistence-runtime.ts";
import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { escalate } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let body: { reason?: unknown };
  try { body = (await readJson(req, 2048)) as typeof body; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const { id } = await ctx.params;
  const result = escalate(a.session.tid, a.session.uid, id, String(body.reason ?? ""));
  await commit();
  return respond(result, (ok) => ({ inquiry: ok.inquiry, delivery: "blokeret_testversion" }));
}
