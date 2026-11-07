import { authed, fail, json } from "@/lib/api.ts";
import { getInquiryView } from "@/lib/store.ts";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const { id } = await ctx.params;
  const v = getInquiryView(a.session.tid, id);
  return v ? json(v) : fail("not_found", "Sagen findes ikke.", 404);
}
