import { QuoteRows } from "@/components/rows";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { dkk } from "@/lib/format";
import { getOverview, listQuotes } from "@/lib/store";

export const metadata = { title: "Tilbud" };

export default async function QuotesPage() {
  const s = await requireSession();
  const quotes = listQuotes(s.tid);
  const o = getOverview(s.tid, s.uid)!;
  const outstanding = quotes.filter((q) => q.status === "sendt").reduce((a, q) => a + q.amountDkk, 0);
  const won = quotes.filter((q) => q.status === "accepteret").reduce((a, q) => a + q.amountDkk, 0);
  const now = Date.now();
  return (
    <>
      <TopBar tenant={o.tenant.name} />
      <main className="main">
        <p className="eyebrow">Opfølgning via Worker 03</p>
        <h1 className="title">Tilbud</h1>
        <div className="stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="stat"><b style={{ fontSize: "clamp(28px, 8vw, 40px)" }}>{dkk(outstanding)}</b><span>Udestående<br />(sendt, ikke svaret)</span></div>
          <div className="stat"><b style={{ fontSize: "clamp(28px, 8vw, 40px)" }}>{dkk(won)}</b><span>Accepteret<br />(testdata)</span></div>
        </div>
        <section className="section">
          <div className="section-head"><h2>Alle tilbud</h2><span>{quotes.length}</span></div>
          <QuoteRows items={quotes} now={now} empty="Ingen tilbud endnu." />
        </section>
        <p className="notice">Automatiske opfølgningsmails er slået fra i testversionen. Worker 03 planlægger kun.</p>
      </main>
    </>
  );
}
