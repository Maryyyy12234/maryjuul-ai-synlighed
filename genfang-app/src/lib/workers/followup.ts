// Worker 03 – Follow-up. Foreslår opfølgninger på konkrete sager. Sender aldrig selv.
// Juridisk udgangspunkt (ikke juridisk rådgivning): En opfølgning på et tilbud, kunden selv har
// bedt om, er en servicebesked i en igangværende kundedialog. Nye tilbud, rabatter eller
// "vi savner dig"-beskeder er markedsføring og kræver forudgående samtykke
// (markedsføringsloven § 10). Derfor: kun neutral opfølgning, højst 2 gange, aldrig efter afslag.

import type { FollowUpSuggestion, Inquiry, Quote } from "../types.ts";

const DAY = 86_400_000;
export const FOLLOWUP_AFTER_DAYS = 5;
export const MAX_FOLLOWUPS = 2;

export function quoteExpiresAt(q: Quote): number | null {
  return q.sentAt ? Date.parse(q.sentAt) + q.validDays * DAY : null;
}

export function suggestFollowUps(quotes: Quote[], inquiries: Inquiry[], nowMs: number, signer: string): Omit<FollowUpSuggestion, "id" | "version" | "state">[] {
  const out: Omit<FollowUpSuggestion, "id" | "version" | "state">[] = [];
  const createdAt = new Date(nowMs).toISOString();
  for (const q of quotes) {
    if (q.status !== "sendt" || !q.sentAt) continue;
    const age = Math.floor((nowMs - Date.parse(q.sentAt)) / DAY);
    const exp = quoteExpiresAt(q);
    if (age < FOLLOWUP_AFTER_DAYS || (exp !== null && exp <= nowMs)) continue;
    const allowed = q.followUps < MAX_FOLLOWUPS;
    const until = exp ? new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", timeZone: "Europe/Copenhagen" }).format(new Date(exp)) : null;
    out.push({
      tenantId: q.tenantId,
      kind: "tilbud_ubesvaret",
      quoteId: q.id,
      customerName: q.customerName,
      reason: `Tilbud sendt for ${age} dage siden uden svar.`,
      draft: `Hej ${q.customerName.split(" ")[0]}\n\nVi sendte dig for nylig et tilbud på ${q.title.toLowerCase()}. Har du haft mulighed for at kigge på det? Skriv eller ring, hvis du har spørgsmål.${until ? ` Tilbuddet gælder til ${until}.` : ""}\n\nVenlig hilsen\n${signer}`,
      legalBasis: allowed
        ? "Servicebesked om et konkret tilbud, kunden selv har bedt om. Ingen nye tilbud eller rabatter – derfor ikke markedsføring."
        : `Allerede fulgt op ${q.followUps} gange. Flere henvendelser frarådes.`,
      allowed,
      createdAt,
    });
  }
  for (const i of inquiries) {
    if (i.status !== "godkendt" || !i.decidedAt || i.missingInfo.length === 0) continue;
    if (nowMs - Date.parse(i.decidedAt) < 2 * DAY) continue;
    out.push({
      tenantId: i.tenantId,
      kind: "mangler_oplysninger",
      inquiryId: i.id,
      customerName: i.customerName,
      reason: `Venter stadig på: ${i.missingInfo.join(", ").toLowerCase()}.`,
      draft: `Hej ${i.customerName.split(" ")[0]}\n\nVi mangler stadig ${i.missingInfo.join(" og ").toLowerCase()} for at kunne hjælpe dig videre med "${i.subject.toLowerCase()}". Send det gerne, når du har tid.\n\nVenlig hilsen\n${signer}`,
      legalBasis: "Svar i en igangværende sag, kunden selv har startet. Ikke markedsføring.",
      allowed: true,
      createdAt,
    });
  }
  return out;
}
