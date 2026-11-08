import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { commit } from "@/lib/persistence-runtime.ts";
import { setWorkerPaused } from "@/lib/store.ts";
import type { WorkerId } from "@/lib/types.ts";

// Ejeren kan sætte en enkelt worker på pause eller starte den igen.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let b: { paused?: unknown };
  try { b = (await readJson(req, 256)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (typeof b.paused !== "boolean") return fail("invalid", "Angiv paused: true/false.", 400);
  const { id } = await ctx.params;
  const result = setWorkerPaused(a.session.tid, a.session.uid, id as WorkerId, b.paused);
  await commit();
  return respond(result, (ok) => ({ paused: ok.paused }));
}
