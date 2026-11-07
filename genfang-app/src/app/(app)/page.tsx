import Link from "next/link";
import { redirect } from "next/navigation";
import { Prov, ProvLegend } from "@/components/prov";
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
  const headline = !a ? `${o.counts.actionTotal === 0 ? "Intet kræver dig lige nu." : `${o.counts.actionTotal} ting kræver dig.`}`
    : a.changes.bookingRate.pp !== null && a.changes.bookingRate.pp > 0 ? "Flere henvendelser bliver til opgaver."
    : a.changes.bookingRate.pp !== null && a.changes.bookingRate.pp < 0 ? "Færre henvendelser bliver til opgaver."
    : "Sådan går det.";

  return (
    <>
      <TopBar tenant={o.tenant.name} />
      <main className="main">
        <p className="eyebrow">Overblik · {today(now)}</p>
        <h1 className="title">Hej {o.user.name}. {a ? <em>{headline}</em> : <em>{headline}</em>}</h1>
        {a ? <p className="lede-sm">Seneste 30 dage sammenlignet med de 30 dage før. <Prov p="testdata" /></p> : null}
        {o.stopped ? <div className="banner" data-tone="stop" role="alert"><span><b>Automatik stoppet.</b> {o.stopped}</span></div> : null}

        <section className="section" aria-labelledby="h-act" style={{ marginTop: 24 }}>
          <div className="section-head"><h2 id="h-act">Kræver handling</h2><span>{o.counts.actionTotal}</span></div>
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
            <div className="section-head"><h2 id="h-res">Resultater</h2><Link href="/indsigt">Detaljer</Link></div>
            <div className="kpis">
              <Kpi label="Betalt omsætning" value={dkk(a.cur.revenuePaid)} delta={relStr(a.changes.revenuePaid.rel)} dir={a.changes.revenuePaid.abs} prov="testdata" />
              <Kpi label="Tilbud accepteret" value={pctStr(a.cur.acceptRate)} delta={ppStr(a.changes.acceptRate.pp)} dir={a.changes.acceptRate.pp} prov="testdata" />
              <Kpi label="Median svartid" value={minStr(a.cur.medianResponseMin)} delta={a.prev.medianResponseMin !== null ? `fra ${minStr(a.prev.medianResponseMin)}` : ""} dir={a.changes.medianResponseMin.abs !== null ? -a.changes.medianResponseMin.abs : null} prov="testdata" />
              <Kpi label="Bookingrate" value={pctStr(a.cur.bookingRate)} delta={ppStr(a.changes.bookingRate.pp)} dir={a.changes.bookingRate.pp} prov="testdata" />
              <Kpi label="Tid sparet" value={minStr(a.cur.minutesSaved)} delta="Beregnet ud fra antagelser" dir={null} prov="estimat" />
              <Kpi label="Mulig ekstra omsætning" value={a.estimate.value !== null ? dkk(a.estimate.value) : "–"} delta={a.estimate.value === null ? "For lille datagrundlag" : "Ikke bevist effekt"} dir={null} prov="estimat" />
            </div>
            <ProvLegend />
          </section>
        ) : null}

        <section className="section" aria-labelledby="h-money">
          <div className="section-head"><h2 id="h-money">Tilbud og penge</h2><Link href="/tilbud">Se tilbud</Link></div>
          <ul className="money">
            <li data-real="false"><span>Potentiel – ikke vundet endnu</span><b>{dkk(o.quoteTotals.potential)}</b><small>Kladder, tilbud til godkendelse og sendte tilbud.</small></li>
            <li data-real="false"><span>Accepteret – ikke faktureret</span><b>{dkk(o.quoteTotals.acceptedNotInvoiced)}</b></li>
            <li data-real="false"><span>Faktureret – ikke betalt</span><b>{dkk(o.quoteTotals.invoicedUnpaid)}</b></li>
            <li data-real="true"><span>Betalt</span><b>{dkk(o.quoteTotals.paid)}</b><small>Kun betalte fakturaer er realiseret omsætning. <Prov p="testdata" /></small></li>
          </ul>
        </section>

        {a && a.recommendations.length ? (
          <section className="section" aria-labelledby="h-ins">
            <div className="section-head"><h2 id="h-ins">GENFANG Insights</h2><Link href="/indsigt#forslag">Alle forslag</Link></div>
            {a.recommendations.slice(0, 2).map((r) => (
              <div className="insight" key={r.id}>
                <h3>{r.title}</h3>
                <p>{r.why} {r.action}</p>
                <div className="meta-row"><span>Forslag fra Worker 04 · Analytics</span><Prov p={r.provenance} /></div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="section" aria-labelledby="h-workers">
          <div className="section-head"><h2 id="h-workers">AI-workers</h2><Link href="/workers">Status og log</Link></div>
          <div className="workers">
            {o.workers.map((w) => (
              <Link className="worker" key={w.id} href="/workers">
                <b><span className="dot" data-state={w.state} />{w.id.slice(-2)}</b>
                <span>{w.name}{w.state !== "aktiv" ? ` · ${w.state}` : ""}</span>
              </Link>
            ))}
          </div>
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
