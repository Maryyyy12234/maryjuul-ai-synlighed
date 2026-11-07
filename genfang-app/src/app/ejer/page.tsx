import { notFound } from "next/navigation";
import { EmergencyStop, PauseTenant } from "@/components/admin-controls";
import { LogoutButton } from "@/components/logout-button";
import { Prov, ProvLegend } from "@/components/prov";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { clock, dayLabel, dkk } from "@/lib/format";
import { adminOverview } from "@/lib/store";

export default async function OwnerPanel() {
  const s = await requireSession();
  const now = nowMs();
  const r = adminOverview(s.uid, now);
  if (!r.ok) notFound();
  const { totals, tenants, platform, costModel } = r;
  return (
    <>
      <header className="topbar"><span className="wordmark"><i />GENFANG · Ejerpanel</span><span className="tenant">Kun for platformens ejer</span></header>
      <main className="main">
        <p className="eyebrow">Kontrolrum</p>
        <h1 className="title">Drift og økonomi</h1>
        <p className="lede-sm">Samlede tal pr. virksomhed. Ingen kundenavne, beskeder eller adresser vises her.</p>
        <ProvLegend />

        <EmergencyStop on={platform.emergencyStop} reason={platform.reason} />

        <div className="kpis" style={{ marginTop: 24 }}>
          <div className="kpi"><div className="label">Abonnementsomsætning pr. md.</div><div className="value">{dkk(totals.mrr)}</div><div className="delta">{dkk(totals.arr)} årligt ved samme kunder</div><Prov p="testdata" /></div>
          <div className="kpi"><div className="label">Omkostninger pr. md.</div><div className="value">{dkk(totals.cost)}</div><div className="delta">Hosting, AI, SMS, gebyrer</div><Prov p="estimat" /></div>
          <div className="kpi"><div className="label">Dækningsbidrag pr. md.</div><div className="value">{dkk(totals.margin)}</div><div className="delta">Før skat og din egen tid</div><Prov p="estimat" /></div>
          <div className="kpi"><div className="label">Virksomheder</div><div className="value">{totals.tenants}</div><div className="delta">{tenants.filter((t) => t.paused).length} på pause</div><Prov p="testdata" /></div>
          <div className="kpi"><div className="label">Worker-fejl (30 dage)</div><div className="value">{totals.errors30d}</div><div className="delta">Se tabel</div><Prov p="testdata" /></div>
          <div className="kpi"><div className="label">AI-forbrug (30 dage)</div><div className="value">{tenants.reduce((a, t) => a + t.aiTokens30d, 0)} tokens</div><div className="delta">Ingen modelkald i testversionen</div><Prov p="testdata" /></div>
        </div>
        <p className="notice">Beløb ekskl. moms. Abonnementsomsætning er ikke din løn: Fratræk omkostninger, skat og din egen arbejdstid.</p>

        <section className="section">
          <div className="section-head"><h2>Virksomheder</h2><span>{tenants.length}</span></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Virksomhed</th><th>Plan</th><th className="num">Pris</th><th className="num">Omk.</th><th className="num">Bidrag</th><th className="num">Henv. 30 d</th><th>Køer</th><th>Workers</th><th>DPA</th><th></th></tr></thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><br /><small>{t.trade}{t.paused ? " · PAUSE" : ""}</small></td>
                    <td>{t.plan.name}</td>
                    <td className="num">{dkk(t.mrr)}</td>
                    <td className="num">{dkk(t.cost)}</td>
                    <td className="num">{dkk(t.margin)}</td>
                    <td className="num">{t.usage.inquiries30d}</td>
                    <td><small>{t.queues.pendingApprovals} til godkendelse<br />{t.queues.escalationsOpen} åbne eskaleringer<br />{t.queues.outboxBlocked} blokeret i outbox</small></td>
                    <td><small>{t.workers.map((w) => `${w.id.slice(-2)} ${w.state}`).join(" · ")}{t.lastError ? <><br /><span style={{ color: t.workers.some((w) => w.state === "fejl") ? "var(--warn)" : "var(--ink-2)" }}>{t.workers.some((w) => w.state === "fejl") ? "Aktuel fejl" : "Seneste fejl (løst)"} {dayLabel(t.lastError.at, now)} kl. {clock(t.lastError.at)}: {t.lastError.error}</span></> : null}</small></td>
                    <td>{t.dpaSigned ? "Ja" : <span style={{ color: "var(--warn)" }}>Mangler</span>}</td>
                    <td><PauseTenant id={t.id} paused={t.paused} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>Omkostningsmodel</h2><Prov p="estimat" /></div>
          <ul className="kv">
            <li><span>Hosting pr. virksomhed</span><span>{dkk(costModel.hostingPerTenant)}/md.</span></li>
            <li><span>AI pr. 1.000 tokens</span><span>{costModel.aiPer1kTokens.toString().replace(".", ",")} kr.</span></li>
            <li><span>SMS pr. besked</span><span>{costModel.smsPerMessage.toString().replace(".", ",")} kr.</span></li>
            <li><span>Betalingsgebyr</span><span>{(costModel.paymentFeePct * 100).toString().replace(".", ",")} %</span></li>
          </ul>
          <p className="notice">Antagelser – erstattes af faktiske fakturaer fra Vercel, Anthropic, SMS-udbyder og Stripe, når de er forbundet.</p>
        </section>
        <div style={{ marginTop: 28, maxWidth: 320 }}><LogoutButton /></div>
      </main>
    </>
  );
}
