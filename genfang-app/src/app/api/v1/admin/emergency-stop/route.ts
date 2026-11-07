import { authed, fail, readJson, requireSuper, respond } from "@/lib/api.ts";
import { setEmergencyStop } from "@/lib/store.ts";

export async function POST(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!requireSuper(a.session)) return fail("not_found", "Ikke fundet.", 404);
  let b: { on?: unknown; reason?: unknown };
  try { b = (await readJson(req, 1024)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (typeof b.on !== "boolean") return fail("invalid", "Angiv on: true/false.", 400);
  return respond(setEmergencyStop(a.session.uid, b.on, String(b.reason ?? "")), (ok) => ({ emergencyStop: ok.emergencyStop }));
}
