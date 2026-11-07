import { notFound } from "next/navigation";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { clock, dayLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { db, getTenant, listAudit } from "@/lib/store";

export const metadata = { title: "Auditlog" };

const LABEL: Record<string, string> = {
  approve: "Godkendte svar", reject: "Afviste svar", login: "Loggede ind", push_subscribe: "Slog notifikationer til", escalate: "Eskalerede sag",
  escalation_ack: "Kvitterede for eskalering", regenerate: "Bad om nyt udkast", quote_approve: "Godkendte tilbud", quote_reject: "Sendte tilbud tilbage til kladde",
  followup_approve: "Godkendte opfølgning", followup_reject: "Afviste opfølgning", anonymize: "Anonymiserede kunde", emergency_stop: "GENFANG aktiverede nødstop",
  emergency_resume: "GENFANG genoptog drift", tenant_pause: "GENFANG satte automatik på pause", tenant_resume: "GENFANG genoptog automatik",
  intake_simulated: "Simulerede henvendelse", guard_block: "Sikkerhedslaget blokerede godkendelse",
};

export default async function AuditPage() {
  const s = await requireSession();
  if (!can(s.role, "view_audit")) notFound();
  const now = nowMs();
  const users = db().users;
  const log = listAudit(s.tid).slice(0, 100);
  return (
    <>
      <TopBar tenant={getTenant(s.tid)!.name} back={{ href: "/mere", label: "Mere" }} />
      <main className="main">
        <p className="eyebrow">Sikkerhed</p>
        <h1 className="title">Auditlog</h1>
        <p className="lede-sm">Gemmes i hukommelsen i testversionen. I produktion skal loggen gemmes varigt og ikke kunne ændres.</p>
        <section className="section">
          <div className="section-head"><h2>Seneste hændelser</h2><span>{log.length}</span></div>
          {log.length ? (
            <ul className="kv">
              {log.map((a, n) => (
                <li key={n}><span>{LABEL[a.action] ?? a.action}<small>{users.find((u) => u.id === a.userId)?.name ?? a.userId}{a.target ? ` · ${a.target}` : ""}{a.detail ? ` · ${a.detail}` : ""}</small></span><span>{clock(a.at)}<small>{dayLabel(a.at, now)}</small></span></li>
              ))}
            </ul>
          ) : <p className="empty">Ingen hændelser endnu.</p>}
        </section>
      </main>
    </>
  );
}
