"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Props = {
  id: string;
  status: "ny" | "udkast_klar" | "godkendt" | "afvist";
  version: number;
  draft?: string;
  decidedAt?: string;
};

type State =
  | { kind: "idle" }
  | { kind: "busy"; action: "approve" | "reject" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

function clock(iso?: string) {
  return iso ? new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(new Date(iso)) : "";
}

export function DecisionPanel({ id, status, version, draft, decidedAt }: Props) {
  const router = useRouter();
  const [text, setText] = useState(draft ?? "");
  const [state, setState] = useState<State>({ kind: "idle" });
  const inFlight = useRef(false);
  const open = status === "udkast_klar";

  async function send(decision: "approve" | "reject") {
    if (inFlight.current) return; // forhindrer dobbelttryk
    if (decision === "reject" && !window.confirm("Afvis udkastet? Sagen skal så besvares manuelt.")) return;
    inFlight.current = true;
    setState({ kind: "busy", action: decision });
    try {
      const res = await fetch(`/api/v1/inquiries/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ decision, expectedVersion: version, editedText: decision === "approve" ? text : undefined }),
      });
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setState({ kind: "conflict", message: data?.error?.message ?? "Sagen er ændret et andet sted." });
        router.refresh();
        return;
      }
      if (!res.ok) { setState({ kind: "error", message: data?.error?.message ?? "Noget gik galt. Intet er ændret." }); return; }
      if ("vibrate" in navigator) navigator.vibrate?.(12);
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Ingen forbindelse. Intet er godkendt – prøv igen, når du er online." });
    } finally {
      inFlight.current = false;
    }
  }

  if (!draft) {
    return (
      <>
        <div className="draft-label"><h2>Svarudkast</h2><span>Worker 02</span></div>
        <p className="empty">Worker 02 har endnu ikke lavet et udkast til denne henvendelse.</p>
      </>
    );
  }

  const busy = state.kind === "busy";
  return (
    <>
      <div className="draft-label">
        <h2>{open ? "Svarudkast – ret og godkend" : "Svar"}</h2>
        <span>Skrevet af Worker 02</span>
      </div>
      <label className="sr-only" htmlFor="draft">Svarudkast</label>
      <textarea
        id="draft" className="draft" value={text} readOnly={!open || busy} maxLength={5000}
        onChange={(e) => setText(e.target.value)} rows={10}
      />
      <p className="notice">Testversion: godkendte svar registreres, men sendes ikke til kunden.</p>

      {status === "godkendt" ? (
        <div className="result" data-tone="ok" role="status"><b>Godkendt</b> kl. {clock(decidedAt)}. Udsendelse er blokeret i testversionen.</div>
      ) : status === "afvist" ? (
        <div className="result" role="status">Afvist kl. {clock(decidedAt)}. Sagen skal besvares manuelt.</div>
      ) : null}
      {state.kind === "conflict" ? <div className="result" data-tone="warn" role="alert">{state.message} Visningen er opdateret.</div> : null}
      {state.kind === "error" ? <div className="result" data-tone="warn" role="alert">{state.message}</div> : null}

      {open ? (
        <div className="actionbar">
          <button className="btn btn-quiet" disabled={busy} onClick={() => send("reject")}>
            {busy && state.action === "reject" ? "Afviser…" : "Afvis"}
          </button>
          <button className="btn btn-primary" disabled={busy || text.trim().length < 2} onClick={() => send("approve")}>
            {busy && state.action === "approve" ? "Godkender…" : "Godkend svar"}
          </button>
        </div>
      ) : null}
    </>
  );
}
