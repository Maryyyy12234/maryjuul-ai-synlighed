import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { clock, dayLabel, relTime } from "@/lib/format";
import { getTenant, listWorkerRuns, workerStatuses } from "@/lib/store";

export const metadata = { title: "AI-workers" };

const STATE: Record<string, string> = { aktiv: "Aktiv", fejl: "Fejl ved seneste kørsel", stoppet: "Stoppet" };
const RUN: Record<string, string> = { ok: "OK", fejl: "Fejl", blokeret: "Blokeret af sikkerhedslag", stoppet: "Stoppet" };

export default async function WorkersPage() {
  const s = await requireSession();
  const now = nowMs();
  const workers = workerStatuses(s.tid, now);
  const runs = listWorkerRuns(s.tid, undefined, 25);
  return (
    <>
      <TopBar tenant={getTenant(s.tid)!.name} back={{ href: "/mere", label: "Mere" }} />
      <main className="main">
        <p className="eyebrow">Fire workers · ét fælles sikkerhedslag</p>
        <h1 className="title">AI-workers</h1>
        <p className="lede-sm">I testversionen kører workers som regler uden sprogmodel. Ingen AI-kald, ingen udsendelser.</p>
        {workers.map((w) => (
          <section className="section" key={w.id}>
            <div className="section-head"><h2><span className="dot" data-state={w.state} style={{ display: "inline-block", marginRight: 8 }} />{w.id.replace("worker-", "Worker ")} · {w.name}</h2><span>{STATE[w.state]}</span></div>
            <p style={{ margin: "10px 0 0", fontWeight: 500 }}>{w.role}</p>
            <ul className="method">{w.does.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="notice">{w.needsApproval}</p>
            <p className="basis">Seneste kørsel: {w.lastRunAt ? `${relTime(w.lastRunAt, now)} siden` : "aldrig"} · {w.runs24h} kørsler seneste døgn</p>
            {w.lastError ? <div className="guard" data-ok="false" role="alert"><strong>Fejl</strong>{w.lastError}</div> : null}
          </section>
        ))}
        <section className="section">
          <div className="section-head"><h2>Log</h2><span>Seneste {runs.length}</span></div>
          <ul className="kv">
            {runs.map((r) => (
              <li key={r.id}>
                <span>{r.worker.replace("worker-", "W")} · {r.summary}{r.error ? <small style={{ color: "var(--warn)" }}>{r.error}</small> : null}</span>
                <span>{RUN[r.status]}<small>{dayLabel(r.at, now)} {clock(r.at)}</small></span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
