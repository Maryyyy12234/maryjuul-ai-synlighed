import { authed, fail, json, readJson } from "@/lib/api.ts";
import { savePushSubscription } from "@/lib/store.ts";

// Gemmer kun abonnementets endpoint. Selve udsendelsen (web-push med privat VAPID-nøgle)
// er bevidst IKKE aktiveret i testversionen.
const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "wns2-par02p.notify.windows.com",
];

export async function POST(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  let body: { endpoint?: unknown };
  try {
    body = (await readJson(req, 4096)) as typeof body;
  } catch {
    return fail("invalid", "Ugyldig forespørgsel.", 400);
  }
  let url: URL;
  try {
    url = new URL(String(body.endpoint));
  } catch {
    return fail("invalid", "Ugyldigt endpoint.", 400);
  }
  const hostOk = url.protocol === "https:" &&
    (ALLOWED_PUSH_HOSTS.includes(url.hostname) || url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  if (!hostOk) return fail("invalid", "Ukendt push-tjeneste.", 400);
  savePushSubscription(a.session.tid, a.session.uid, url.toString());
  return json({ ok: true, sending: "slået_fra_i_testversion" });
}
