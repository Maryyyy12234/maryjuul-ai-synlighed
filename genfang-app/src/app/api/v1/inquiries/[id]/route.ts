import { authed, fail, json } from "@/lib/api.ts";
import { getInquiry } from "@/lib/store.ts";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const { id } = await ctx.params;
  const inquiry = getInquiry(a.session.tid, id);
  return inquiry ? json({ inquiry }) : fail("not_found", "Sagen findes ikke.", 404);
}
