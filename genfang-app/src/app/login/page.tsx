"use client";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const done = (role?: string) => window.location.replace(role === "superadmin" ? "/ejer" : "/");

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const { res, data } = await post("/api/v1/auth/login", { email: f.get("email"), password: f.get("password") });
      if (res.ok && data.mfaRequired) { setTicket(data.ticket); return; }
      if (res.ok) { done(data.role); return; }
      setError(data?.error?.message ?? "Login mislykkedes.");
    } catch {
      setError("Ingen forbindelse. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await post("/api/v1/auth/mfa", { ticket, code });
      if (res.ok) { done(data.role); return; }
      if (res.status === 401 && /udløbet/.test(data?.error?.message ?? "")) setTicket(null);
      setError(data?.error?.message ?? "Koden passer ikke.");
      setCode("");
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
      {ticket ? (
        <form onSubmit={onCode} noValidate>
          <label className="field"><span>Kode fra din godkendelses-app</span>
            <input name="code" className="code-input code-input-lg" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required />
          </label>
          <p className="form-error" role="alert">{error}</p>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length !== 6}>{busy ? "Kontrollerer…" : "Bekræft"}</button>
          <button className="btn btn-quiet btn-block" type="button" style={{ marginTop: 10 }} onClick={() => { setTicket(null); setCode(""); setError(""); }}>Tilbage</button>
        </form>
      ) : (
        <form onSubmit={onPassword} noValidate>
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
      )}
    </main>
  );
}
