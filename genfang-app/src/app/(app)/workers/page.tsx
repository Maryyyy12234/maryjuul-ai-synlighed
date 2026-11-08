import { TopBar } from "@/components/topbar";
import { WorkerToggle } from "@/components/worker-toggle";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { clock, dayLabel, relTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getTenant, listWorkerRuns, workerStatuses } from "@/lib/store";

export const metadata = { title: "Automatik" };

const STATE: Record<string, string> = { aktiv: "Kører", fejl: "Fejl ved seneste kørsel", stoppet: "Stoppet (nødstop)", pause: "Sat på pause" };
const RUN: Record<string, string> = { ok: "OK", fejl: "Fejl", blokeret: "Stoppet af kontrollen", stoppet: "Pause" };

export default async function WorkersPage() {
  const s = await requireSession();
  const now = nowMs();
  const workers = workerStatuses(s.tid, now);
  const runs = listWorkerRuns(s.tid, undefined, 25);
  const owner = can(s.role, "pause_workers");
  return (
    <>
      <TopBar tenant={getTenant(s.tid)!.name} back={{ href: "/mere", label: "Mere" }} />
      <main className="main">
        <p className="eyebrow">Mere / Automatik</p>
        <h1 className="title">Automatik</h1>
        <p className="dashboard-intro">Fire hjælpere arbejder for dig. Intet sendes til kunder, før et menneske har godkendt det.</p>

        <ul className="worker-cards">
          {workers.map((w) => (
            <li key={w.id} className="worker-card" data-state={w.state}>
              <div className="worker-card-head">
                <span className="dot" data-state={w.state === "aktiv" ? "aktiv" : w.state === "pause" ? "pause" : "fejl"} aria-hidden />
                <div className="worker-card-title">
                  <h2>{w.label}</h2>
                  <p>{w.role}</p>
                </div>
                {owner && w.state !== "stoppet" ? <WorkerToggle id={w.id} label={w.label} paused={w.state === "pause"} /> : null}
              </div>
              <p className="worker-card-meta">
                <span>{STATE[w.state]}</span>
                <span>{w.lastRunAt ? `Senest ${relTime(w.lastRunAt, now)} siden` : "Ikke kørt endnu"}</span>
              </p>
              {w.lastError && w.state === "fejl" ? <p className="worker-card-error" role="alert">{w.lastError}</p> : null}
              <details className="dashboard-disclosure">
                <summary>Det gør den</summary>
                <ul className="method">{w.does.map((d) => <li key={d}>{d}</li>)}</ul>
                <p className="notice">{w.needsApproval}</p>
                <p className="fineprint">Teknisk navn: {w.id.replace("worker-", "Worker ")} · {w.name}</p>
              </details>
            </li>
          ))}
        </ul>

        <section className="section">
          <details className="dashboard-disclosure">
            <summary>Vis seneste aktivitet ({runs.length})</summary>
            <ul className="kv">
              {runs.map((r) => (
                <li key={r.id}>
                  <span>{r.summary}{r.error ? <small style={{ color: "var(--warn)" }}>{r.error}</small> : null}</span>
                  <span>{RUN[r.status]}<small>{dayLabel(r.at, now)} {clock(r.at)}</small></span>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <p className="notice" style={{ marginTop: 24 }}>Akutte sager genkendes altid – også når Modtagelse er på pause – så en vandskade aldrig overses.</p>
      </main>
    </>
  );
}
