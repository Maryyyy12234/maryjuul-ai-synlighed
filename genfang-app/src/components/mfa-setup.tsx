"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(body: unknown) {
  const r = await fetch("/api/v1/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = await r?.json().catch(() => ({}));
  return { ok: !!r?.ok, d };
}

export function MfaSetup({ enabled, canDisable = true }: { enabled: boolean; canDisable?: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pretty = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

  if (enabled) {
    return (
      <div className="mfa">
        <p className="mfa-state"><span className="dot" data-state="aktiv" /> Totrinsbekræftelse er slået til.</p>
        {canDisable ? (
          <form className="mfa-row" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await call({ action: "disable", code }); setBusy(false); setMsg(r.ok ? "Slået fra." : r.d?.error?.message ?? "Mislykkedes."); if (r.ok) router.refresh(); }}>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Kode" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Kode fra din app" />
            <button className="btn btn-sm btn-quiet" disabled={busy || code.length !== 6}>Slå fra</button>
          </form>
        ) : null}
        {msg ? <p className="notice" role="status">{msg}</p> : null}
      </div>
    );
  }
  return (
    <div className="mfa">
      {!secret ? (
        <>
          <p className="lede-sm" style={{ marginTop: 0 }}>Beskyt kontoen med en kode fra din telefon (fx Google Authenticator, Microsoft Authenticator eller 1Password).</p>
          <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); const r = await call({ action: "start" }); setBusy(false); if (r.ok) setSecret(r.d); else setMsg(r.d?.error?.message ?? "Mislykkedes."); }}>Slå totrinsbekræftelse til</button>
        </>
      ) : (
        <ol className="mfa-steps">
          <li>Åbn din godkendelses-app, og tilføj en konto. På telefonen kan du trykke <a href={secret.uri}>her</a>.</li>
          <li>Eller indtast nøglen manuelt: <code className="mfa-key">{pretty(secret.secret)}</code></li>
          <li>
            Skriv den 6-cifrede kode, appen viser:
            <form className="mfa-row" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await call({ action: "confirm", code }); setBusy(false); setMsg(r.ok ? "Totrinsbekræftelse er slået til." : r.d?.error?.message ?? "Mislykkedes."); if (r.ok) router.refresh(); }}>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Kode fra din app" autoFocus />
              <button className="btn btn-primary btn-sm" disabled={busy || code.length !== 6}>Bekræft</button>
            </form>
          </li>
        </ol>
      )}
      {msg ? <p className="notice" role="status">{msg}</p> : null}
    </div>
  );
}
