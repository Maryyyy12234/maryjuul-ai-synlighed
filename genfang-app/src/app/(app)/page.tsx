import Link from "next/link";
import { redirect } from "next/navigation";
import { Prov } from "@/components/prov";
import { TopBar } from "@/components/topbar";
import { IconChevron } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { EMERGENCY, dkk, minStr, pctStr, ppStr, relStr, relTime, today } from "@/lib/format";
import { nowMs } from "@/lib/clock";
import { getOverview } from "@/lib/store";

export default async function OverviewPage() {
  const s = await requireSession();
  const now = nowMs();
  const o = getOverview(s.tid, s.uid, now);
  if (!o) redirect("/login");
  const a = o.analytics;
  const nonUrgentPending = o.pending.filter((p) => p.urgency !== "akut");
  const firstName = o.user.name.trim().split(" ")[0];
  const nextHref = o.urgent[0] ? `/henvendelser/${o.urgent[0].id}` : nonUrgentPending.length ? "/henvendelser?filter=aabne" : o.quotesAwaiting.length && s.role === "owner" ? "/tilbud" : o.counts.followUps ? "/tilbud#opfoelgning" : "/henvendelser";
  const activeWorkers = o.workers.filter((w) => w.state === "aktiv").length;

  return (
    <>
      <TopBar tenant={o.tenant.name} />
      <main className="main">
        <p className="eyebrow">Overblik / {today(now)}</p>
        <h1 className="title dashboard-title">Hej, {firstName}.</h1>
        <p className="dashboard-intro">Her er det vigtigste for din virksomhed lige nu.</p>
        {o.stopped ? <div className="banner" data-tone="stop" role="alert"><span><b>Automatik stoppet.</b> {o.stopped}</span></div> : null}

        <section className="focus-card" aria-labelledby="focus-title">
          <div>
            <span className="focus-eyebrow">{o.counts.actionTotal > 0 ? "Din næste opgave" : "Godt arbejde"}</span>
            <h2 id="focus-title">{o.counts.actionTotal > 0 ? <><span className="focus-number">{o.counts.actionTotal}</span> {o.counts.actionTotal === 1 ? "opgave venter" : "opgaver venter"}</> : "Du er ajour."}</h2>
            <p>{o.urgent.length ? "Start med de akutte henvendelser." : nonUrgentPending.length ? "Der er svar, som du kan gennemgå og godkende." : o.counts.actionTotal ? "Gennemgå de opgaver, der venter på dig." : "Der er ingen opgaver, der kræver din handling lige nu."}</p>
          </div>
          <Link href={nextHref} className="focus-link">{o.counts.actionTotal > 0 ? "Gå til opgaver" : "Se alle sager"} <span aria-hidden="true">↗</span></Link>
        </section>

        <nav className="dashboard-shortcuts" aria-label="Hurtigt overblik">
          <Link href="/henvendelser?filter=aabne"><strong>{o.counts.openInquiries}</strong><span>Åbne sager</span></Link>
          <Link href="/henvendelser?filter=aabne"><strong>{o.counts.pendingApprovals}</strong><span>Svar klar</span></Link>
          <Link href="/tilbud"><strong>{o.counts.quotesAwaiting}</strong><span>Tilbud til tjek</span></Link>
        </nav>

        <section className="section dashboard-priority" aria-labelledby="h-act">
          <div className="section-head"><h2 id="h-act">Kræver din handling</h2><span>{o.counts.actionTotal} opgaver</span></div>
          {o.counts.actionTotal === 0 ? <p className="empty">Alt er håndteret.</p> : (
            <ul className="actions-list">
              {o.urgent.map((i) => (
                <li className="act" data-kind="akut" key={i.id}>
                  <Link href={`/henvendelser/${i.id}`}>
                    <span className="mark" aria-hidden />
                    <span style={{ minWidth: 0 }}><b>{i.customerName} · {i.emergencyKind ? EMERGENCY[i.emergencyKind] : "Akut"}</b><span className="sub">{i.escalated ? "Eskaleret til vagten" : "Ikke eskaleret"} · modtaget for {relTime(i.receivedAt, now)} siden</span></span>
                    <IconChevron />
                  </Link>
                </li>
              ))}
              {nonUrgentPending.length ? (
                <li className="act" data-kind="godkend">
                  <Link href="/henvendelser?filter=aabne">
                    <span className="mark" aria-hidden />
                    <span style={{ minWidth: 0 }}><b>{nonUrgentPending.length} svar klar til godkendelse</b><span className="sub">{nonUrgentPending.map((p) => p.customerName).join(", ")}</span></span>
                    <IconChevron />
                  </Link>
                </li>
              ) : null}
              {s.role === "owner" && o.quotesAwaiting.length ? (
                <li className="act" data-kind="tilbud">
                  <Link href="/tilbud">
                    <span className="mark" aria-hidden />
                    <span style={{ minWidth: 0 }}><b>{o.quotesAwaiting.length} tilbud venter på din godkendelse</b><span className="sub">Samlet {dkk(o.quotesAwaiting.reduce((x, q) => x + q.amountDkk, 0))}</span></span>
                    <IconChevron />
                  </Link>
                </li>
              ) : null}
              {o.counts.followUps ? (
                <li className="act" data-kind="opfoelg">
                  <Link href="/tilbud#opfoelgning">
                    <span className="mark" aria-hidden />
                    <span style={{ minWidth: 0 }}><b>{o.counts.followUps} opfølgninger foreslået</b><span className="sub">Ubesvarede tilbud og manglende svar · kræver godkendelse</span></span>
                    <IconChevron />
                  </Link>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {a ? (
          <section className="section" aria-labelledby="h-res">
            <div className="section-head"><h2 id="h-res">Resultater de sidste 30 dage</h2><Link href="/indsigt">Se alle tal</Link></div>
            <div className="kpis">
              <Kpi label="Betalt omsætning" value={dkk(a.cur.revenuePaid)} delta={relStr(a.changes.revenuePaid.rel)} dir={a.changes.revenuePaid.abs} prov="testdata" />
              <Kpi label="Tilbud accepteret" value={pctStr(a.cur.acceptRate)} delta={ppStr(a.changes.acceptRate.pp)} dir={a.changes.acceptRate.pp} prov="testdata" />
              <Kpi label="Median svartid" value={minStr(a.cur.medianResponseMin)} delta={a.prev.medianResponseMin !== null ? `fra ${minStr(a.prev.medianResponseMin)}` : ""} dir={a.changes.medianResponseMin.abs !== null ? -a.changes.medianResponseMin.abs : null} prov="testdata" />
             </div>
            <p className="dashboard-fineprint">Tal i denne version er testdata. <Link href="/indsigt">Se metode og øvrige målinger</Link>.</p>
          </section>
        ) : null}

        <section className="section" aria-labelledby="h-money">
          <div className="section-head"><h2 id="h-money">Tilbud og betaling</h2><Link href="/tilbud">Se tilbud</Link></div>
          <div className="dashboard-revenue"><div><span>Betalt i alt</span><strong>{dkk(o.quoteTotals.paid)}</strong><small>Testdata · ikke verificeret med økonomisystem</small></div><Link href="/tilbud">Åbn tilbud <IconChevron /></Link></div>
          <details className="dashboard-disclosure">
            <summary>Vis hele økonomioverblikket</summary>
            <ul className="money">
              <li data-real="false"><span>Potentielle tilbud</span><b>{dkk(o.quoteTotals.potential)}</b></li>
              <li data-real="false"><span>Accepteret, ikke faktureret</span><b>{dkk(o.quoteTotals.acceptedNotInvoiced)}</b></li>
              <li data-real="false"><span>Faktureret, ikke betalt</span><b>{dkk(o.quoteTotals.invoicedUnpaid)}</b></li>
            </ul>
          </details>
        </section>

        {a && a.recommendations.length ? (
          <section className="section" aria-labelledby="h-ins">
            <div className="section-head"><h2 id="h-ins">GENFANG Insights</h2><Link href="/indsigt#forslag">Alle forslag</Link></div>
            {a.recommendations.slice(0, 1).map((r) => (
              <div className="insight" key={r.id}>
                <h3>{r.title}</h3>
                <p>{r.why} {r.action}</p>
                <div className="meta-row"><span>Forslag fra Worker 04 · Analytics</span><Prov p={r.provenance} /></div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="section dashboard-workers" aria-labelledby="h-workers">
          <div className="section-head"><h2 id="h-workers">Automatik</h2><Link href="/workers">Se status</Link></div>
          <Link href="/workers" className="dashboard-worker-line">
            <span className="dot" data-state={activeWorkers === o.workers.length ? "aktiv" : "fejl"} />
            <span>{activeWorkers} af {o.workers.length} workers aktive</span>
            <span className="dashboard-worker-end">Se detaljer <IconChevron /></span>
          </Link>
        </section>
      </main>
    </>
  );
}

function Kpi({ label, value, delta, dir, prov }: { label: string; value: string; delta: string; dir: number | null; prov: "testdata" | "estimat" | "verificeret" }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta ? <div className="delta" data-dir={dir === null || dir === 0 ? undefined : dir > 0 ? "up" : "down"}>{delta}</div> : null}
      <Prov p={prov} />
    </div>
  );
}
