import Link from "next/link";
import { InquiryRows, QuoteRows } from "@/components/rows";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { greeting, today } from "@/lib/format";
import { getOverview } from "@/lib/store";
import { redirect } from "next/navigation";

export default async function OverviewPage() {
  const s = await requireSession();
  const o = getOverview(s.tid, s.uid);
  if (!o) redirect("/login");
  const now = Date.now();
  const firstUrgent = o.pendingApprovals.find((i) => i.urgency === "akut") ?? o.newInquiries.find((i) => i.urgency === "akut");
  const followToday = o.quotes.filter((q) => q.followUpAt && new Date(q.followUpAt).getTime() < now + 86_400_000).length;

  return (
    <>
      <TopBar tenant={o.tenant.name} />
      <main className="main">
        <p className="eyebrow">{today(now)}</p>
        <h1 className="title">{greeting(now)}, {o.user.name}.<br /><em>{o.counts.pendingApprovals === 0 ? "Alt er godkendt." : `${o.counts.pendingApprovals} svar venter på dig.`}</em></h1>

        {firstUrgent ? (
          <Link className="urgent-band" href={`/henvendelser/${firstUrgent.id}`}>
            <span><strong>{o.counts.urgent === 1 ? "1 akut sag" : `${o.counts.urgent} akutte sager`}</strong><small>{firstUrgent.subject}</small></span>
            <span className="pulse" aria-hidden />
          </Link>
        ) : null}

        <div className="stats">
          <Link className="stat" href="/henvendelser?filter=aabne" data-hot={o.counts.pendingApprovals > 0}><b>{o.counts.pendingApprovals}</b><span>Afventer<br />godkendelse</span></Link>
          <Link className="stat" href="/henvendelser?filter=aabne"><b>{o.counts.newInquiries}</b><span>Nye<br />henvendelser</span></Link>
          <Link className="stat" href="/tilbud"><b>{o.counts.openQuotes}</b><span>Åbne<br />tilbud</span></Link>
        </div>

        <section className="section" aria-labelledby="h-approve">
          <div className="section-head"><h2 id="h-approve">Afventer din godkendelse</h2><Link href="/henvendelser?filter=aabne">Se alle</Link></div>
          <InquiryRows items={o.pendingApprovals} now={now} empty="Ingen svar venter. Worker 02 lægger nye udkast her." />
        </section>

        <section className="section" aria-labelledby="h-new">
          <div className="section-head"><h2 id="h-new">Nye henvendelser</h2><span>{o.counts.newInquiries}</span></div>
          <InquiryRows items={o.newInquiries} now={now} empty="Ingen nye henvendelser." />
        </section>

        <section className="section" aria-labelledby="h-quotes">
          <div className="section-head"><h2 id="h-quotes">Tilbud</h2><Link href="/tilbud">{followToday ? `${followToday} til opfølgning` : "Se alle"}</Link></div>
          <QuoteRows items={o.quotes.slice(0, 3)} now={now} empty="Ingen åbne tilbud." />
        </section>

        <section className="section" aria-labelledby="h-workers">
          <div className="section-head"><h2 id="h-workers">AI-workers</h2><Link href="/mere">Status</Link></div>
          <div className="workers">
            {o.workers.map((w) => (
              <div className="worker" key={w.id}>
                <b><span className="dot" data-state={w.state} />{w.id.slice(-2)}</b>
                <span>{w.job}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
