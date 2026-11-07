"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EmergencyStop({ on, reason }: { on: boolean; reason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function toggle() {
    let why = "";
    if (!on) {
      const r = window.prompt("NØDSTOP stopper alle workers og al udsendelse for ALLE virksomheder. Skriv årsagen:");
      if (!r) return;
      why = r;
    } else if (!window.confirm("Genoptag drift for alle virksomheder?")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/v1/admin/emergency-stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !on, reason: why }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh(); else setErr("Handlingen mislykkedes.");
  }
  return (
    <div className="stop-box" data-on={on}>
      <div><b>{on ? "NØDSTOP ER AKTIVT" : "Nødstop"}</b>{on && reason ? ` · ${reason}` : ""}</div>
      <div style={{ fontSize: 14 }}>{on ? "Ingen workers kører, og ingen beskeder kan godkendes til udsendelse." : "Stopper øjeblikkeligt alle workers og al udsendelse på tværs af virksomheder."}</div>
      <div><button className={on ? "btn btn-primary" : "btn btn-warn"} style={on ? { background: "var(--lime)", color: "var(--ink)" } : undefined} disabled={busy} onClick={toggle}>{busy ? "Arbejder…" : on ? "Genoptag drift" : "Aktivér nødstop"}</button></div>
      {err ? <div role="alert">{err}</div> : null}
    </div>
  );
}

export function PauseTenant({ id, paused }: { id: string; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-sm btn-quiet" disabled={busy} onClick={async () => {
      if (!paused && !window.confirm("Sæt automatik på pause for denne virksomhed?")) return;
      setBusy(true);
      await fetch(`/api/v1/admin/tenants/${encodeURIComponent(id)}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !paused }) }).catch(() => null);
      setBusy(false);
      router.refresh();
    }}>{paused ? "Genoptag" : "Pause"}</button>
  );
}

export function ResetDemo() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  return (
    <div style={{ marginTop: 16 }}>
      <button className="btn btn-sm btn-quiet" onClick={async () => {
        const c = window.prompt("Nulstil ALLE testdata til udgangspunktet? Skriv NULSTIL.");
        if (c !== "NULSTIL") return;
        const r = await fetch("/api/v1/admin/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: c }) }).catch(() => null);
        setMsg(r?.ok ? "Testdata er nulstillet." : "Mislykkedes.");
        router.refresh();
      }}>Nulstil testdata</button>
      {msg ? <span role="status" style={{ marginLeft: 10, fontSize: 14 }}>{msg}</span> : null}
    </div>
  );
}
