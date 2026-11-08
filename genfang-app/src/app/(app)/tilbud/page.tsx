import { Prov } from "@/components/prov";
import { FollowUpCard, QuoteApproval } from "@/components/quote-actions";
import { QuoteRows } from "@/components/rows";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { QUOTE_STATUS, dkk } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getTenant, listFollowUps, listQuotes, quoteTotals } from "@/lib/store";
import type { QuoteStatus } from "@/lib/types";

export const metadata = { title: "Tilbud" };

const GROUPS: { title: string; statuses: QuoteStatus[]; note?: string }[] = [
  { title: "Afventer din godkendelse", statuses: ["afventer_godkendelse"] },
  { title: "Sendt – venter på kunden", statuses: ["sendt"], note: "Potentielle indtægter – ikke vundet endnu." },
  { title: "Kladder", statuses: ["kladde"] },
  { title: "Vundet", statuses: ["accepteret", "faktureret"], note: "Accepteret er ikke betalt. Kun betalte fakturaer er realiseret omsætning." },
  { title: "Tabt", statuses: ["afvist", "udloebet"] },
];

export default async function QuotesPage() {
  const s = await requireSession();
  const now = nowMs();
  const quotes = listQuotes(s.tid, now);
  const t = quoteTotals(quotes);
  const owner = can(s.role, "approve_quote");
  const followUps = can(s.role, "approve_followup") ? listFollowUps(s.tid, now) : [];
  const FU = followUps.length ? (
          <section className="section" id="opfoelgning">
            <div className="section-head"><h2>Foreslåede opfølgninger</h2><span>{followUps.length}</span></div>
            <ul className="rows">{followUps.map((f) => <FollowUpCard key={f.id} {...f} />)}</ul>
            <p className="notice">GENFANG sender intet selv. Kun opfølgning på konkrete tilbud og sager – aldrig reklame uden samtykke. Højst {2} opfølgninger pr. tilbud.</p>
          </section>
        ) : null;

  return (
    <>
      <TopBar tenant={getTenant(s.tid)!.name} />
      <main className="main">

        <p className="eyebrow">Kunder og betaling</p>
        <h1 className="title">Tilbud</h1>
        <p className="dashboard-intro">Se tilbud, der venter på dig, og følg op på kunder.</p>
        <div className="quote-topline">
          <div><span>Afventer godkendelse</span><strong>{quotes.filter((q) => q.status === "afventer_godkendelse").length}</strong></div>
          <div><span>Betalt i alt</span><strong>{dkk(t.paid)}</strong></div>
        </div>
        <details className="dashboard-disclosure quote-disclosure">
          <summary>Se alle økonomital</summary>
          <ul className="money">
            <li data-real="false"><span>Mulige indtægter</span><b>{dkk(t.potential)}</b></li>
            <li data-real="false"><span>Accepteret, ikke faktureret</span><b>{dkk(t.acceptedNotInvoiced)}</b></li>
            <li data-real="false"><span>Faktureret, ikke betalt</span><b>{dkk(t.invoicedUnpaid)}</b></li>
            <li data-real="true"><span>Betalt</span><b>{dkk(t.paid)}</b><small><Prov p="testdata" /> · ikke verificeret via økonomisystem</small></li>
          </ul>
        </details>

        {GROUPS.map((g, gi) => {
          const items = quotes.filter((q) => g.statuses.includes(q.status));
          const fuSection = gi === 0 ? FU : null;
          if (!items.length) return <div key={g.title}>{fuSection}</div>;
          return (
            <div key={g.title}>
            <section className="section" data-group={g.statuses[0]}>
              <div className="section-head"><h2>{g.title}</h2><span>{items.length} · {dkk(items.reduce((a, q) => a + q.amountDkk, 0))}</span></div>
              <QuoteRows items={items} now={now} empty="" showStatus={g.statuses.length > 1} actions={owner ? (q) => (q.status === "afventer_godkendelse" ? <QuoteApproval id={q.id} version={q.version} /> : null) : undefined} />
              {g.note ? <p className="notice">{g.note}</p> : null}
            </section>
            {fuSection}
            </div>
          );
        })}
        <p className="notice" style={{ marginTop: 24 }}>Statusser: {Object.values(QUOTE_STATUS).join(" · ")}. Sendte tilbud udløber automatisk efter gyldighedsperioden.</p>
      </main>
    </>
  );
}
