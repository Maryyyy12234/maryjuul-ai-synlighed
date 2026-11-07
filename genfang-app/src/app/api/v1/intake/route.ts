import { commit } from "@/lib/persistence-runtime.ts";
import { authed, fail, readJson, respond } from "@/lib/api.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { ingest } from "@/lib/store.ts";

// Simulerer en indgående henvendelse gennem Intake → Responder. Kun syntetiske data.
// I produktion erstattes ruten af signerede webhooks fra mail/formular/telefoni.
export async function POST(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const rl = rateLimit(`intake:${a.session.uid}`, 20, 60_000);
  if (!rl.ok) return fail("rate_limited", "For mange forsøg.", 429);
  let b: Record<string, unknown>;
  try { b = (await readJson(req, 8192)) as Record<string, unknown>; } catch { return fail("invalid", "Ugyldig forespørgsel.", 400); }
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
  const result = ingest(a.session.tid, a.session.uid, { name: s("name") ?? "", email: s("email"), phone: s("phone"), address: s("address"), channel: (s("channel") ?? "formular") as "formular", subject: s("subject") ?? "", message: s("message") ?? "" });
  await commit();
  return respond(result,
    (ok) => ({ inquiry: ok.inquiry, duplicate: ok.duplicate }),
  );
}
