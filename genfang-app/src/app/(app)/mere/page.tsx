import { InstallHint } from "@/components/install-hint";
import { LogoutButton } from "@/components/logout-button";
import { PushToggle } from "@/components/push-toggle";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { relTime } from "@/lib/format";
import { getOverview, getUser } from "@/lib/store";

export const metadata = { title: "Mere" };

export default async function MorePage() {
  const s = await requireSession();
  const o = getOverview(s.tid, s.uid)!;
  const u = getUser(s.tid, s.uid)!;
  const now = Date.now();
  return (
    <>
      <TopBar tenant={o.tenant.name} />
      <main className="main">
        <p className="eyebrow">Indstillinger</p>
        <h1 className="title">Mere</h1>

        <section className="section">
          <div className="section-head"><h2>AI-workers</h2><span>Kører på serveren</span></div>
          <ul className="kv">
            {o.workers.map((w) => (
              <li key={w.id}>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="dot" data-state={w.state} /><span>{w.name}<small>{w.job}{w.note ? ` · ${w.note}` : ""}</small></span></span>
                <span>{w.state}<small>{relTime(w.lastRunAt, now)} siden</small></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <div className="section-head"><h2>Notifikationer</h2></div>
          <PushToggle />
        </section>

        <section className="section">
          <div className="section-head"><h2>App</h2></div>
          <InstallHint />
        </section>

        <section className="section">
          <div className="section-head"><h2>Konto</h2></div>
          <ul className="kv">
            <li><span>Navn</span><span>{u.name}</span></li>
            <li><span>E-mail</span><span>{u.email}</span></li>
            <li><span>Virksomhed</span><span>{o.tenant.name}</span></li>
            <li><span>Rolle</span><span>{u.role === "owner" ? "Ejer" : "Medarbejder"}</span></li>
          </ul>
          <div style={{ marginTop: 20 }}><LogoutButton /></div>
        </section>

        <p className="notice" style={{ marginTop: 28 }}>Testversion. Alle data er opdigtede. Der sendes ingen mails, SMS eller betalinger.</p>
      </main>
    </>
  );
}
