import { authed, fail, json } from "@/lib/api.ts";
import { can } from "@/lib/permissions.ts";
import { listFollowUps } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!can(a.session.role, "approve_followup")) return fail("forbidden", "Kun for ejeren.", 403);
  return json({ followUps: listFollowUps(a.session.tid) });
}
