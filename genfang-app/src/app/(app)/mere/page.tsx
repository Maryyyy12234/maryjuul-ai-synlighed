import Link from "next/link";
import { IconChevron } from "@/components/icons";
import { InstallHint } from "@/components/install-hint";
import { LogoutButton } from "@/components/logout-button";
import { PushToggle } from "@/components/push-toggle";
import { SimulateIntake } from "@/components/simulate-intake";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { getTenant, getUser } from "@/lib/store";

export const metadata = { title: "Mere" };

const WD = ["", "Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export default async function MorePage() {
  const s = await requireSession();
  const t = getTenant(s.tid)!;
  const u = getUser(s.tid, s.uid)!;
  const owner = can(s.role, "view_audit");
  const links = [
    ...(owner ? [{ href: "/indsigt", label: "Resultater", sub: "Omsætning, udvikling og forslag" }] : []),
    { href: "/workers", label: "AI-workers", sub: "Opgaver, status, fejl og log" },
    ...(owner ? [{ href: "/mere/audit", label: "Auditlog", sub: "Hvem gjorde hvad og hvornår" }, { href: "/mere/gdpr", label: "Databehandling og GDPR", sub: "Databehandlere, sletning, opbevaring" }] : []),
  ];
  return (
    <>
      <TopBar tenant={t.name} />
      <main className="main">
        <p className="eyebrow">Indstillinger</p>
        <h1 className="title">Mere</h1>

        <section className="section">
          <ul className="actions-list">
            {links.map((l) => (
              <li className="act" key={l.href}><Link href={l.href}><span className="mark" aria-hidden /><span><b>{l.label}</b><span className="sub">{l.sub}</span></span><IconChevron /></Link></li>
            ))}
          </ul>
        </section>

        <section className="section">
          <div className="section-head"><h2>Team og vagt</h2></div>
          <ul className="kv">
            {t.employees.map((e) => <li key={e.id}><span>{e.name}<small>{e.title}</small></span><span>{e.onCall ? "Vagthavende" : ""}<small>{e.phone}</small></span></li>)}
          </ul>
          <p className="notice">Akutte sager eskaleres til vagthavende. I testversionen sendes ingen SMS eller opkald.</p>
        </section>

        <section className="section">
          <div className="section-head"><h2>Åbningstider og priser</h2><span>Bruges af sikkerhedslaget</span></div>
          <ul className="kv">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <li key={d}><span>{WD[d]}</span><span>{t.openingHours[d] ? `${t.openingHours[d]!.open}–${t.openingHours[d]!.close}` : "Lukket"}</span></li>)}
            {t.priceList.map((p) => <li key={p.id}><span>{p.label}</span><span>{p.amountDkk.toLocaleString("da-DK")} kr.{p.unit === "pr_time" ? "/time" : ""}</span></li>)}
          </ul>
          <p className="notice">Kalender: testkalender (ikke forbundet til Google/Outlook endnu). Tidszone: {t.timezone}.</p>
        </section>

        <section className="section"><div className="section-head"><h2>Notifikationer</h2></div><PushToggle /></section>
        <section className="section"><div className="section-head"><h2>App</h2></div><InstallHint /></section>

        {can(s.role, "simulate_intake") ? (
          <section className="section">
            <div className="section-head"><h2>Simulér ny henvendelse</h2><span>Test af Intake → Responder</span></div>
            <SimulateIntake />
          </section>
        ) : null}

        <section className="section">
          <div className="section-head"><h2>Konto</h2></div>
          <ul className="kv">
            <li><span>Navn</span><span>{u.name}</span></li>
            <li><span>E-mail</span><span>{u.email}</span></li>
            <li><span>Rolle</span><span>{ROLE_LABEL[u.role]}</span></li>
            <li><span>Abonnement</span><span>{t.plan.name}</span></li>
          </ul>
          <div style={{ marginTop: 20 }}><LogoutButton /></div>
        </section>
        <p className="notice" style={{ marginTop: 28 }}>Testversion. Alle data er opdigtede. Der sendes ingen mails, SMS eller betalinger.</p>
      </main>
    </>
  );
}
