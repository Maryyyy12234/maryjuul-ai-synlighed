import { notFound } from "next/navigation";
import { Prov, ProvLegend } from "@/components/prov";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { dkk, minStr, pctStr, ppStr, relStr } from "@/lib/format";
import { can } from "@/lib/permissions";
import { analytics, getTenant } from "@/lib/store";
import { MIN_SAMPLE } from "@/lib/workers/analytics";

export const metadata = { title: "Indsigt" };

export default async function InsightPage() {
  const s = await requireSession();
  if (!can(s.role, "view_analytics")) notFound();
  const a = analytics(s.tid, 30, nowMs())!;
  const c = a.cur, p = a.prev;
  const steps = [
    { label: "Henvendelser", n: c.inquiries },
    { label: "Besvaret", n: c.responded },
    { label: "Booket eller tilbud sendt", n: c.bookedOrQuoted },
    { label: "Tilbud accepteret", n: c.quotesAccepted },
  ];
  const max = Math.max(1, c.inquiries);
  const fmtD = (iso: string) => new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" }).format(new Date(iso));
  const small = c.inquiries < MIN_SAMPLE || p.inquiries < MIN_SAMPLE;

  const rows: { label: string; cur: string; prev: string; change: string }[] = [
    { label: "Henvendelser", cur: String(c.inquiries), prev: String(p.inquiries), change: relStr(a.changes.inquiries.rel) },
    { label: "Svarprocent", cur: pctStr(c.responseRate), prev: pctStr(p.responseRate), change: ppStr(a.changes.responseRate.pp) },
    { label: "Median svartid", cur: minStr(c.medianResponseMin), prev: minStr(p.medianResponseMin), change: relStr(a.changes.medianResponseMin.rel) },
    { label: "Bookingrate", cur: pctStr(c.bookingRate), prev: pctStr(p.bookingRate), change: ppStr(a.changes.bookingRate.pp) },
    { label: `Tilbudsaccept (${c.quotesAccepted}/${c.quotesDecided} afgjorte)`, cur: pctStr(c.acceptRate), prev: pctStr(p.acceptRate), change: ppStr(a.changes.acceptRate.pp) },
    { label: "Betalt omsætning", cur: dkk(c.revenuePaid), prev: dkk(p.revenuePaid), change: relStr(a.changes.revenuePaid.rel) },
  ];

  return (
    <>
      <TopBar tenant={getTenant(s.tid)!.name} />
      <main className="main">
        <p className="eyebrow">Worker 04 · Analytics</p>
        <h1 className="title">Indsigt</h1>
        <p className="lede-sm">{fmtD(a.window.curFrom)}–{fmtD(a.window.to)} sammenlignet med {fmtD(a.window.prevFrom)}–{fmtD(a.window.curFrom)}.</p>
        <div className="banner" data-tone="info"><span>{a.provenanceNote}</span></div>
        <ProvLegend />
        {small ? <div className="banner" data-tone="info"><span>Lille datagrundlag ({c.inquiries} og {p.inquiries} henvendelser). Ændringer kan skyldes tilfældigheder.</span></div> : null}

        <section className="section">
          <div className="section-head"><h2>Kunderejsen</h2><span>Seneste 30 dage · <Prov p="testdata" /></span></div>
          <ul className="funnel">
            {steps.map((st) => (
              <li key={st.label}><span>{st.label}</span><b className="num">{st.n} <small style={{ color: "var(--ink-2)", fontWeight: 400 }}>{pctStr(st.n / max)}</small></b><span className="bar"><i style={{ width: `${Math.round((st.n / max) * 100)}%` }} /></span></li>
            ))}
            <li><span>Betalt i perioden (efter betalingsdato)</span><b className="num">{dkk(c.revenuePaid)}</b><span className="bar"><i style={{ width: c.revenuePaid > 0 ? "100%" : "0%" }} /></span></li>
          </ul>
        </section>

        <section className="section">
          <div className="section-head"><h2>Periodesammenligning</h2><span><Prov p="testdata" /></span></div>
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 0 }}>
              <thead><tr><th>Måling</th><th className="num">Nu</th><th className="num">Før</th><th className="num">Ændring</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.cur}</td><td className="num">{r.prev}</td><td className="num">{r.change || "–"}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="notice">Rater ændres i procentpoint. Andre tal vises som relativ ændring.</p>
        </section>

        <section className="section">
          <div className="section-head"><h2>Estimater</h2><span><Prov p="estimat" /></span></div>
          <ul className="money">
            <li data-real="false"><span>Tid sparet</span><b>{minStr(c.minutesSaved)}</b><small>{a.assumptions[0]}</small></li>
            <li data-real="false"><span>Mulig ekstra omsætning</span><b>{a.estimate.value !== null ? dkk(a.estimate.value) : "–"}</b><small>{a.estimate.formula} {a.estimate.caveat}</small></li>
          </ul>
        </section>

        <section className="section" id="forslag">
          <div className="section-head"><h2>Forslag til vækst</h2><span>{a.recommendations.length}</span></div>
          {a.recommendations.length ? a.recommendations.map((r) => (
            <div className="insight" key={r.id}>
              <h3>{r.title}</h3>
              <p><b>Datagrundlag:</b> {r.why}</p>
              <p><b>Forslag:</b> {r.action}</p>
              <div className="meta-row"><span>Effekt: {r.impact} · udfører ingen handling selv</span><Prov p={r.provenance} /></div>
            </div>
          )) : <p className="empty">Ingen forslag lige nu.</p>}
        </section>

        <section className="section">
          <div className="section-head"><h2>Metode</h2></div>
          <ul className="method">{a.assumptions.map((x) => <li key={x}>{x}</li>)}<li>Mulige årsager er forklaringer, ikke beviste sammenhænge.</li></ul>
        </section>
      </main>
    </>
  );
}
