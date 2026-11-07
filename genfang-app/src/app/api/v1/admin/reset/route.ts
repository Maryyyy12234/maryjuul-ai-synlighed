import { commit } from "@/lib/persistence-runtime.ts";
import { authed, fail, json, readJson, requireSuper } from "@/lib/api.ts";
import { audit, resetDb } from "@/lib/store.ts";

// Nulstiller ALLE testdata til udgangspunktet (fx før en kundedemo). Kun platformens ejer.
// Spærres automatisk, når der findes rigtige kundedata (GENFANG_REAL_DATA=1).
export async function POST(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  if (!requireSuper(a.session)) return fail("not_found", "Ikke fundet.", 404);
  if (process.env.GENFANG_REAL_DATA === "1") return fail("forbidden", "Nulstilling er slået fra, fordi der er rigtige data.", 403);
  let b: { confirm?: unknown };
  try { b = (await readJson(req, 256)) as typeof b; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  if (b.confirm !== "NULSTIL") return fail("invalid", "Bekræft med NULSTIL.", 400);
  resetDb();
  audit({ at: new Date().toISOString(), tenantId: "__platform__", userId: a.session.uid, action: "emergency_resume", detail: "testdata nulstillet" });
  await commit();
  return json({ ok: true });
}
