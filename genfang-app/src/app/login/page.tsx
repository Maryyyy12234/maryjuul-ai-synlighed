"use client";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
      });
      if (res.ok) { const d = await res.json().catch(() => ({})); window.location.replace(d.role === "superadmin" ? "/ejer" : "/"); return; }
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.message ?? "Login mislykkedes.");
    } catch {
      setError("Ingen forbindelse. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-hero">
        <div className="mark" aria-hidden><i /></div>
        <h1>GENFANG</h1>
        <p>Nye henvendelser, svarudkast og tilbud – samlet ét sted og klar til din godkendelse.</p>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <label className="field"><span>E-mail</span>
          <input name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" required />
        </label>
        <label className="field"><span>Adgangskode</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <p className="form-error" role="alert">{error}</p>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? "Logger ind…" : "Log ind"}</button>
        <p className="hint">Testversion med syntetiske data. Testkonto: <code>ejer@hansen-vvs.test</code>. Adgangskoden udleveres separat.</p>
      </form>
    </main>
  );
}
