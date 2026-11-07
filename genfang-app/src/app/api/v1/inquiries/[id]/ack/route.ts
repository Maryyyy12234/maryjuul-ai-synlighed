import { authed, respond } from "@/lib/api.ts";
import { ackEscalation } from "@/lib/store.ts";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const { id } = await ctx.params;
  return respond(ackEscalation(a.session.tid, a.session.uid, id), (ok) => ({ inquiry: ok.inquiry }));
}
