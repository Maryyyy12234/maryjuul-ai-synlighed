"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GuardResult } from "@/lib/types";

type Props = {
  id: string;
  status: "ny" | "udkast_klar" | "godkendt" | "afvist";
  version: number;
  draft?: string;
  draftBy?: string;
  decidedAt?: string;
  guard: GuardResult | null;
  stopped: string | null;
  emergency: boolean;
  escalated: boolean;
  basis?: string;
};

type Msg = { tone: "ok" | "warn"; text: string } | null;

function clock(iso?: string) {
  return iso ? new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(new Date(iso)) : "";
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export function GuardBox({ guard, checking }: { guard: GuardResult | null; checking?: boolean }) {
  if (checking) return <div className="guard" data-ok="true" role="status">Kontrollerer svaret…</div>;
  if (!guard) return null;
  if (guard.ok) return <div className="guard" data-ok="true" role="status">Sikkerhedskontrol bestået: ingen tider eller priser uden grundlag.</div>;
  return (
    <div className="guard" data-ok="false" role="alert">
      <strong>Sikkerhedskontrollen stopper godkendelsen</strong>
      <ul>
        {guard.issues.map((i, n) => (
          <li key={n}>{i.message}{i.excerpt ? <q>{i.excerpt}</q> : null}</li>
        ))}
      </ul>
    </div>
  );
}

export function CaseActions(p: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.draft ?? "");
  const [guard, setGuard] = useState<GuardResult | null>(p.guard);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const inFlight = useRef(false);
  const open = p.status === "udkast_klar";

  useEffect(() => { setText(p.draft ?? ""); setGuard(p.guard); setEditing(false); }, [p.draft, p.version, p.guard]);

  // Live-kontrol, mens der redigeres (efter en kort pause i skrivningen).
  useEffect(() => {
    if (!editing || text === p.draft) { if (text === p.draft) setGuard(p.guard); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const { res, data } = await post(`/api/v1/inquiries/${encodeURIComponent(p.id)}/check`, { text });
        if (res.ok) setGuard(data.guard);
      } finally { setChecking(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [text, editing, p.id, p.draft, p.guard]);

  async function run(kind: string, url: string, body: unknown, okText: string) {
    if (inFlight.current) return; // forhindrer dobbelttryk
    inFlight.current = true;
    setBusy(kind);
    setMsg(null);
    try {
      const { res, data } = await post(url, body);
      if (res.status === 401) { router.replace("/login"); return; }
      if (res.status === 422 && data.guard) { setGuard(data.guard); setMsg({ tone: "warn", text: data.error.message }); return; }
      if (!res.ok) {
        setMsg({ tone: "warn", text: (data?.error?.message ?? "Noget gik galt. Intet er ændret.") + (res.status === 409 ? " Visningen er opdateret." : "") });
        if (res.status === 409) router.refresh();
        return;
      }
      navigator.vibrate?.(12);
      setMsg({ tone: "ok", text: okText });
      router.refresh();
    } catch {
      setMsg({ tone: "warn", text: "Ingen forbindelse. Intet er ændret – prøv igen, når du er online." });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const base = `/api/v1/inquiries/${encodeURIComponent(p.id)}`;
  const approve = () => run("approve", `${base}/decision`, { decision: "approve", expectedVersion: p.version, editedText: text !== p.draft ? text : undefined }, "Godkendt. Udsendelse er blokeret i testversionen.");
  const reject = () => { if (window.confirm("Afvis udkastet? Sagen skal så besvares manuelt.")) run("reject", `${base}/decision`, { decision: "reject", expectedVersion: p.version }, "Udkast afvist."); };
  const regenerate = () => run("regen", `${base}/draft`, { expectedVersion: p.version }, "Worker 02 har skrevet et nyt udkast ud fra kalender og prisliste.");
  const escalate = () => {
    const reason = window.prompt("Hvorfor skal sagen eskaleres? (Sendes til vagthavende – ikke til kunden)", p.emergency ? "Akut sag – ring kunden op" : "");
    if (reason !== null) run("esc", `${base}/escalate`, { reason }, "Eskaleret til vagthavende. Besked er blokeret i testversionen.");
  };

  const canApprove = open && !busy && !checking && !!guard?.ok && !p.stopped && text.trim().length > 1;

  return (
    <>
      <div className="draft-label">
        <h2>{open ? "Svarudkast" : p.draft ? "Svar" : "Svarudkast"}</h2>
        <span>{p.draftBy === "legacy" ? "Gammelt udkast (før sikkerhedslag)" : p.draft ? "Skrevet af Worker 02" : ""}</span>
      </div>

      {p.draft || open ? (
        <>
          <label className="sr-only" htmlFor="draft">Svarudkast</label>
          <textarea id="draft" className="draft" value={text} readOnly={!editing || !open || !!busy} maxLength={5000} onChange={(e) => setText(e.target.value)} rows={10} />
          {p.basis ? <details className="dashboard-disclosure"><summary>Hvor kommer forslaget fra?</summary><p className="basis">{p.basis}</p></details> : null}
          {open ? <GuardBox guard={guard} checking={checking} /> : null}
        </>
      ) : <p className="empty">Worker 02 har endnu ikke skrevet et udkast.</p>}

      {open || p.status === "ny" ? (
        <div className="toolbar">
          <button className="btn btn-sm btn-quiet" onClick={regenerate} disabled={!!busy || !!p.stopped}>{busy === "regen" ? "Skriver…" : "Nyt udkast"}</button>
          {!p.escalated ? <button className="btn btn-sm btn-warn" onClick={escalate} disabled={!!busy}>{busy === "esc" ? "Eskalerer…" : "Eskalér"}</button> : null}
          {open ? <button className="btn btn-sm btn-quiet" onClick={reject} disabled={!!busy}>Afvis</button> : null}
        </div>
      ) : null}

      <p className="notice">Testversion: svar sendes ikke til kunden endnu.</p>
      {p.stopped ? <div className="banner" data-tone="stop" role="alert"><span><b>Stoppet.</b> {p.stopped}</span></div> : null}

      {p.status === "godkendt" ? <div className="result" data-tone="ok" role="status"><b>Godkendt</b> kl. {clock(p.decidedAt)}. Udsendelse er blokeret i testversionen.</div>
        : p.status === "afvist" ? <div className="result" role="status">Afvist kl. {clock(p.decidedAt)}. Sagen skal besvares manuelt.</div> : null}
      {msg ? <div className="result" data-tone={msg.tone} role={msg.tone === "warn" ? "alert" : "status"}>{msg.text}</div> : null}

      {open ? (
        <div className="actionbar">
          <button className="btn btn-quiet" onClick={() => setEditing((e) => !e)} aria-pressed={editing} disabled={!!busy}>{editing ? "Færdig" : "Rediger"}</button>
          <button className="btn btn-primary" disabled={!canApprove} onClick={approve} aria-describedby="approve-why">
            {busy === "approve" ? "Godkender…" : "Godkend og send"}
          </button>
          <span id="approve-why" className="sr-only">{guard?.ok ? "" : "Deaktiveret: sikkerhedskontrollen har fundet problemer."}</span>
        </div>
      ) : null}
    </>
  );
}
