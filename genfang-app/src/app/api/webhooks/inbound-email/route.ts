import { NextResponse } from "next/server";
import { commit } from "@/lib/persistence-runtime.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { improveDraftWithAi, ingestSystem } from "@/lib/store.ts";
import { parseAddress, verifySvix } from "@/lib/webhook.ts";

export const runtime = "nodejs";

// Indgående mail fra Resend (event "email.received"). Kræver gyldig signatur.
// Mail til virksomhedens adresse bliver til en sag via Intake → Responder → sikkerhedslag → menneskelig godkendelse.
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const tenantId = process.env.INBOUND_TENANT_ID;
  if (!secret || !tenantId) return NextResponse.json({ error: "Indgående mail er ikke sat op." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "x").split(",")[0];
  if (!rateLimit(`inbound:${ip}`, 120, 60_000).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await req.text();
  if (body.length > 256_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const ok = verifySvix(body, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, secret);
  if (!ok) return NextResponse.json({ error: "Ugyldig signatur." }, { status: 401 });

  let evt: { type?: string; data?: { email_id?: string; from?: string; subject?: string; text?: string } };
  try { evt = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  if (evt.type !== "email.received" || !evt.data?.from) return NextResponse.json({ ignored: true });

  let text = evt.data.text;
  if (!text && evt.data.email_id && process.env.RESEND_API_KEY) {
    // Hent mailens indhold fra Resend (webhooken indeholder kun metadata).
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(evt.data.email_id)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { text?: string } | null;
    text = d?.text ?? undefined;
  }
  const sender = parseAddress(evt.data.from);
  const result = ingestSystem(tenantId, {
    name: sender.name.slice(0, 120), email: sender.email, channel: "mail",
    subject: (evt.data.subject || "(intet emne)").slice(0, 160),
    message: (text || "(Mailens tekst kunne ikke hentes – se mailen i Resend.)").slice(0, 4000),
  });
  if (!result.ok) { await commit(); return NextResponse.json({ error: result.message }, { status: 409 }); }
  if (!result.duplicate) await improveDraftWithAi(tenantId, result.inquiry.id);
  await commit();
  return NextResponse.json({ ok: true, inquiry: result.inquiry.id, duplicate: result.duplicate });
}
