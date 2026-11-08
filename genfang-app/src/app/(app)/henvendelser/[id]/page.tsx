import { notFound } from "next/navigation";
import { AnonymizeButton } from "@/components/anonymize-button";
import { CaseActions } from "@/components/case-actions";
import { AckButton } from "@/components/escalation-box";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { CATEGORY, CHANNEL, EMERGENCY, clock, dkk, relTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getInquiryView, getTenant } from "@/lib/store";

export const metadata = { title: "Sag" };

const fmtSlot = (label: string) => {
  const [s, e] = label.split("|");
  const d = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(new Date(s));
  return `${d}–${clock(e)}`;
};

export default async function InquiryPage(props: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await props.params;
  const now = nowMs();
  const v = getInquiryView(s.tid, id, now);
  if (!v) notFound(); // også når sagen tilhører en anden virksomhed
  const i = v.inquiry;
  const tenant = getTenant(s.tid)!;
  const basis = [
    v.basisSlots.length ? `Tider fra kalenderen: ${v.basisSlots.map((b) => fmtSlot(b.label)).join("; ")}.` : "",
    v.basisPrices.length ? `Pris fra prislisten: ${v.basisPrices.map((p) => `${p.label} ${dkk(p.amountDkk)}`).join("; ")}.` : "",
    i.draft?.basis?.note ?? "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <TopBar tenant={tenant.name} back={{ href: "/henvendelser", label: "Sager" }} />
      <main className="main" data-has-actions={i.status === "udkast_klar"}>
        <p className="eyebrow" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {i.urgency === "akut" ? <span className="tag" data-kind="akut">Akut</span> : null}
          <span>{i.urgency === "akut" ? "" : `${CATEGORY[i.category]} · `}Sorteret automatisk</span>
        </p>
        <h1 className="title">{i.customerName}</h1>
        <p className="lede" style={{ color: "var(--ink)", fontWeight: 500 }}>{i.subject}</p>
        <div className="meta">
          <span>{CHANNEL[i.channel]}</span>
          <span>Modtaget kl. {clock(i.receivedAt)} ({relTime(i.receivedAt, now)} siden)</span>
          {i.address ? <span>{i.address}</span> : null}
        </div>

        {i.emergency ? (
          <section className="emergency" aria-labelledby="h-em">
            <h2 id="h-em">{EMERGENCY[i.emergency.kind]} – sikker vejledning til kunden</h2>
            <p>{i.emergency.guidance}</p>
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Genkendt på: »{i.emergency.signals.join(", ")}«. Der loves ikke et besøg, før vagthavende har bekræftet det.</p>
            {i.escalation ? (
              <div className="esc-state">
                <span>
                  {i.escalation.state === "afventer_kvittering"
                    ? <><b>Eskaleret til {i.escalation.toName}</b> for {relTime(i.escalation.at, now)} siden · afventer kvittering{v.onCall ? ` · ${v.onCall.phone}` : ""}</>
                    : <><b>{i.escalation.toName} har kvitteret</b> kl. {clock(i.escalation.ackAt!)}</>}
                  <br /><small>SMS/opkald til vagten er blokeret i testversionen.</small>
                </span>
                {i.escalation.state === "afventer_kvittering" ? <AckButton id={i.id} /> : null}
              </div>
            ) : null}
          </section>
        ) : i.escalation ? (
          <div className="banner" data-tone="info" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>{i.escalation.state === "afventer_kvittering" ? `Eskaleret til ${i.escalation.toName}: ${i.escalation.reason}` : `${i.escalation.toName} har kvitteret kl. ${clock(i.escalation.ackAt!)}`}</span>
            {i.escalation.state === "afventer_kvittering" ? <AckButton id={i.id} /> : null}
          </div>
        ) : null}

        <ul className="facts" aria-label="Fakta fra Intake">
          <li>{i.knownCustomer || v.previousCases > 0 ? `Kendt kunde · ${v.previousCases} tidligere sag${v.previousCases === 1 ? "" : "er"}` : "Ny kunde"}</li>
          {i.missingInfo.map((m) => <li key={m} data-missing="true">Mangler: {m.toLowerCase()}</li>)}
        </ul>

        <blockquote className="message">{i.message}</blockquote>

        <CaseActions
          id={i.id} status={i.status} version={i.version} draft={i.draft?.text} draftBy={i.draft?.generatedBy}
          decidedAt={i.decidedAt} guard={v.guard} stopped={v.stopped} emergency={!!i.emergency} escalated={!!i.escalation} basis={basis || undefined}
        />

        {can(s.role, "anonymize_customer") ? (
          <details className="danger">
            <summary>GDPR: slet kundens personoplysninger</summary>
            <p>Anonymiserer navn, kontaktoplysninger og beskeder i alle sager og tilbud for denne kunde. Kan ikke fortrydes. Handlingen logges.</p>
            <AnonymizeButton id={i.id} />
          </details>
        ) : null}
      </main>
    </>
  );
}
