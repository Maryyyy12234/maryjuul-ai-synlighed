"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function QuoteApproval({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function go(decision: "approve" | "reject") {
    if (busy) return;
    setBusy(decision); setErr("");
    const r = await fetch(`/api/v1/quotes/${encodeURIComponent(id)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, expectedVersion: version }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(null);
    if (r?.ok) router.refresh(); else setErr(d?.error?.message ?? "Noget gik galt.");
  }
  return (
    <>
      <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => go("approve")}>{busy === "approve" ? "Sender…" : "Godkend og send"}</button>
      <button className="btn btn-sm btn-quiet" disabled={!!busy} onClick={() => go("reject")}>Ret først</button>
      {err ? <span role="alert" style={{ color: "var(--warn)", fontSize: 13, flexBasis: "100%" }}>{err}</span> : null}
    </>
  );
}

export function FollowUpCard(f: { id: string; version: number; customerName: string; reason: string; draft: string; legalBasis: string; allowed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function go(decision: "approve" | "reject") {
    if (busy) return;
    setBusy(decision); setErr("");
    const r = await fetch(`/api/v1/followups/${encodeURIComponent(f.id)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, expectedVersion: f.version }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(null);
    if (r?.ok) router.refresh(); else setErr(d?.error?.message ?? "Noget gik galt.");
  }
  return (
    <li className="row followup" style={{ padding: "14px 0" }}>
      <div style={{ display: "block", padding: 0 }}>
        <b>{f.customerName}</b> <span style={{ color: "var(--ink-2)", fontSize: 14 }}>· {f.reason}</span>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 14, minHeight: 32 }}>Se forslag til besked</summary>
          <pre style={{ whiteSpace: "pre-wrap", font: "inherit", fontSize: 14, background: "#fbfaf6", border: "1px solid var(--rule)", borderRadius: 6, padding: 12 }}>{f.draft}</pre>
        </details>
        {f.allowed ? (
          <details className="legal-note"><summary>✓ Må gerne sendes</summary><p>{f.legalBasis}</p></details>
        ) : <p className="notice" style={{ marginTop: 6 }}>Må ikke sendes: {f.legalBasis}</p>}
        <span style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm btn-primary" disabled={!!busy || !f.allowed} onClick={() => go("approve")}>{busy === "approve" ? "Godkender…" : "Godkend og send"}</button>
          <button className="btn btn-sm btn-quiet" disabled={!!busy} onClick={() => go("reject")}>Afvis forslag</button>
        </span>
        {err ? <p role="alert" style={{ color: "var(--warn)", fontSize: 13 }}>{err}</p> : null}
      </div>
    </li>
  );
}
