import { notFound } from "next/navigation";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getTenant } from "@/lib/store";

export const metadata = { title: "Databehandling" };

const PROCESSORS = [
  { name: "Vercel", role: "Hosting af app og API", region: "Skal sættes til EU (fra1/arn1)", status: "Databehandleraftale ikke underskrevet" },
  { name: "Supabase", role: "Database (når den kobles på)", region: "EU (Frankfurt) anbefales", status: "Ikke i brug endnu" },
  { name: "Anthropic", role: "Sprogmodel til svarudkast (når den kobles på)", region: "Kontrollér aktuelle vilkår for databehandling", status: "Ikke i brug – ingen modelkald" },
  { name: "SMS/telefoni", role: "Eskalering til vagt", region: "Vælg EU-leverandør", status: "Ikke valgt" },
];

export default async function GdprPage() {
  const s = await requireSession();
  if (!can(s.role, "view_audit")) notFound();
  const t = getTenant(s.tid)!;
  return (
    <>
      <TopBar tenant={t.name} back={{ href: "/mere", label: "Mere" }} />
      <main className="main">
        <p className="eyebrow">GDPR</p>
        <h1 className="title">Databehandling</h1>
        <div className="banner" data-tone={t.dpaSigned ? "info" : "stop"}><span><b>{t.dpaSigned ? "Databehandleraftale underskrevet." : "Ingen databehandleraftale endnu."}</b> {t.dpaSigned ? "" : "Rigtige kundedata må ikke behandles i GENFANG, før aftalen mellem jer og GENFANG er underskrevet."}</span></div>
        <section className="section">
          <div className="section-head"><h2>Roller</h2></div>
          <ul className="kv">
            <li><span>Dataansvarlig</span><span>{t.name.replace(" (testdata)", "")}</span></li>
            <li><span>Databehandler</span><span>GENFANG</span></li>
            <li><span>Opbevaring af sager</span><span>{t.retentionDays} dage (forslag)</span></li>
          </ul>
        </section>
        <section className="section">
          <div className="section-head"><h2>Underdatabehandlere</h2></div>
          <ul className="kv">{PROCESSORS.map((p) => <li key={p.name}><span>{p.name}<small>{p.role} · {p.region}</small></span><span>{p.status}</span></li>)}</ul>
        </section>
        <section className="section">
          <div className="section-head"><h2>Kontroller i appen</h2></div>
          <ul className="method">
            <li>Virksomhedsadskillelse: alle opslag kræver virksomheds-id – andres data giver »ikke fundet«.</li>
            <li>Roller: ejer, medarbejder og GENFANG-ejer med forskellige rettigheder.</li>
            <li>Sletning: anonymisering af en kunde fra sagssiden (logges).</li>
            <li>Auditlog over godkendelser, eskaleringer, sletninger og nødstop.</li>
            <li>Ingen kundedata i push-beskeder eller i telefonens cache.</li>
            <li>GENFANGs ejerpanel viser kun samlede tal – ingen kundenavne eller beskeder.</li>
          </ul>
          <p className="notice">Dette er ikke juridisk rådgivning. Få en jurist til at gennemgå databehandleraftale og privatlivspolitik før første betalende kunde.</p>
        </section>
      </main>
    </>
  );
}
