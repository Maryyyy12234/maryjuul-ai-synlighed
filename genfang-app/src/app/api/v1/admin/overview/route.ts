import { authed, fail, json, requireSuper } from "@/lib/api.ts";
import { adminOverview } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!requireSuper(a.session)) return fail("not_found", "Ikke fundet.", 404);
  const r = adminOverview(a.session.uid);
  return r.ok ? json(r) : fail("forbidden", r.message, 403);
}
