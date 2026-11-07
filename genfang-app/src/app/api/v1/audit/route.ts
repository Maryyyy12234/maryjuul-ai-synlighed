import { authed, fail, json } from "@/lib/api.ts";
import { can } from "@/lib/permissions.ts";
import { listAudit } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!can(a.session.role, "view_audit")) return fail("forbidden", "Kun for ejeren.", 403);
  return json({ audit: listAudit(a.session.tid).slice(0, 200) });
}
