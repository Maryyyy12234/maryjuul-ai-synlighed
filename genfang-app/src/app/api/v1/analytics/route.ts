import { authed, fail, json } from "@/lib/api.ts";
import { can } from "@/lib/permissions.ts";
import { analytics } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!can(a.session.role, "view_analytics")) return fail("forbidden", "Kun for ejeren.", 403);
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const v = analytics(a.session.tid, [7, 30, 60].includes(days) ? days : 30);
  return v ? json(v) : fail("not_found", "Ingen data.", 404);
}
