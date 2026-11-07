"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = {
  vand: { name: "Testkunde Akut", phone: "00000099", channel: "formular", subject: "Vand i kælderen", message: "Et rør er sprunget, og der løber vand ud på gulvet i kælderen. Hvad gør vi?" },
  service: { name: "Testkunde Service", email: "service@example.test", channel: "mail", subject: "Radiator larmer", message: "Radiatoren i soveværelset larmer, når varmen er tændt. Kan I kigge på det?" },
} as const;

export function SimulateIntake() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(form: Record<string, string>) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/v1/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) { setMsg(d.duplicate ? "Dublet genkendt – samlet med eksisterende sag." : "Sag oprettet."); router.push(`/henvendelser/${d.inquiry.id}`); }
    else setMsg(d?.error?.message ?? "Mislykkedes.");
  }
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); send(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => send({ ...EXAMPLES.vand })}>Eksempel: vandskade</button>
        <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => send({ ...EXAMPLES.service })}>Eksempel: service</button>
      </div>
      <label>Navn<input name="name" required maxLength={120} /></label>
      <label>E-mail<input name="email" type="email" maxLength={200} /></label>
      <label>Telefon<input name="phone" inputMode="tel" maxLength={30} /></label>
      <label>Kanal<select name="channel" defaultValue="formular"><option value="formular">Formular</option><option value="mail">Mail</option><option value="telefon">Telefon</option></select></label>
      <label>Emne<input name="subject" required maxLength={160} /></label>
      <label>Besked<textarea name="message" required maxLength={4000} /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Behandler…" : "Send gennem Intake"}</button>
      {msg ? <p className="notice" role="status">{msg}</p> : null}
    </form>
  );
}
