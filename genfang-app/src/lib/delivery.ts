// Afsendelse af GODKENDTE beskeder fra outboxen via Resend.
// Kører kun for jobs med state "klar" (som kun oprettes, når udsendelse er slået til).
// Sender aldrig til reserverede test-domæner, og hvert job sendes højst én gang (idempotens-nøgle).

import { audit, db, getTenant } from "./store.ts";
import type { OutboxJob } from "./types.ts";

export type SendFn = (msg: { from: string; to: string; subject: string; text: string; replyTo?: string; idempotencyKey: string }) => Promise<{ id: string }>;

export const resendSend: SendFn = async (m) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": m.idempotencyKey,
    },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, reply_to: m.replyTo }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) throw new Error(`Resend ${res.status}: ${data.message ?? "ukendt fejl"}`);
  return { id: data.id };
};

const RESERVED = /@(?:[^@]+\.)?(example\.(com|org|net|test)|test|invalid|localhost)$/i;
export const isDeliverable = (email?: string) => !!email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !RESERVED.test(email);

function compose(job: OutboxJob): { to?: string; subject: string; text: string } | { error: string } {
  const d = db();
  const customerEmail = (customerId?: string) => d.customers.find((c) => c.id === customerId && c.tenantId === job.tenantId && !c.anonymized)?.email;
  if (job.kind === "svar") {
    const i = d.inquiries.find((x) => x.id === job.ref && x.tenantId === job.tenantId);
    if (!i?.draft || i.status !== "godkendt") return { error: "Sagen er ikke godkendt" };
    return { to: customerEmail(i.customerId), subject: `Re: ${i.subject}`, text: i.draft.text };
  }
  if (job.kind === "tilbud") {
    const q = d.quotes.find((x) => x.id === job.ref && x.tenantId === job.tenantId);
    if (!q || q.status !== "sendt") return { error: "Tilbuddet er ikke godkendt" };
    const t = getTenant(job.tenantId)!;
    return {
      to: customerEmail(q.customerId), subject: `Tilbud: ${q.title}`,
      text: `Hej ${q.customerName.split(" ")[0]}\n\nHer er vores tilbud på ${q.title.toLowerCase()}: ${q.amountDkk.toLocaleString("da-DK")} kr. inkl. moms.\nTilbuddet gælder i ${q.validDays} dage.\n\nVenlig hilsen\n${t.name.replace(/\s*\(testdata\)/, "")}`,
    };
  }
  if (job.kind === "opfoelgning") {
    const f = d.followUps.find((x) => x.id === job.ref && x.tenantId === job.tenantId);
    if (!f || f.state !== "godkendt") return { error: "Opfølgningen er ikke godkendt" };
    const q = f.quoteId ? d.quotes.find((x) => x.id === f.quoteId) : undefined;
    const i = f.inquiryId ? d.inquiries.find((x) => x.id === f.inquiryId) : undefined;
    return { to: customerEmail(q?.customerId ?? i?.customerId), subject: q ? `Dit tilbud: ${q.title}` : `Vedr. ${i?.subject ?? "din henvendelse"}`, text: f.draft };
  }
  return { error: "Eskaleringer sendes ikke automatisk" };
}

/** Sender alle klar-jobs. Returnerer antal sendte. Fejl markeres på jobbet og logges – de forsøges ikke igen automatisk. */
export async function deliverPending(send: SendFn = resendSend, now = Date.now()): Promise<number> {
  const from = process.env.GENFANG_FROM_EMAIL;
  let sent = 0;
  for (const job of db().outbox.filter((j) => j.state === "klar")) {
    if (db().platform.emergencyStop || getTenant(job.tenantId)?.paused) break;
    const c = compose(job);
    const failJob = (error: string) => {
      job.state = "fejlet"; job.error = error;
      audit({ at: new Date(now).toISOString(), tenantId: job.tenantId, userId: "system", action: "delivery_failed", target: job.ref, detail: error });
    };
    if ("error" in c) { failJob(c.error); continue; }
    if (!from) { failJob("Afsenderadresse mangler"); continue; }
    if (!isDeliverable(c.to)) { failJob(c.to ? "Testadresse – sendes ikke" : "Kunden har ingen e-mail – kontakt manuelt"); continue; }
    try {
      const r = await send({ from, to: c.to!, subject: c.subject, text: c.text, idempotencyKey: `genfang-${job.id}` });
      job.state = "sendt"; job.sentAt = new Date(now).toISOString(); job.providerId = r.id;
      audit({ at: job.sentAt, tenantId: job.tenantId, userId: "system", action: "delivered", target: job.ref, detail: job.kind });
      sent++;
    } catch (e) {
      failJob((e as Error).message.slice(0, 200));
    }
  }
  return sent;
}
