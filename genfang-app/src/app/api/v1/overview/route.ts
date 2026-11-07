import { authed, fail, json } from "@/lib/api.ts";
import { getOverview } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const o = getOverview(a.session.tid, a.session.uid);
  return o ? json(o) : fail("unauthorized", "Log ind igen.", 401);
}
