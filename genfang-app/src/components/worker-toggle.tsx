"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WorkerToggle({ id, label, paused }: { id: string; label: string; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button className={`btn btn-sm ${paused ? "btn-primary" : "btn-quiet"}`} disabled={busy} aria-label={`${paused ? "Start" : "Sæt på pause"}: ${label}`}
        onClick={async () => {
          if (!paused && !window.confirm(`Sæt »${label}« på pause? Nye henvendelser gemmes stadig.`)) return;
          setBusy(true); setErr("");
          const r = await fetch(`/api/v1/workers/${encodeURIComponent(id)}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !paused }) }).catch(() => null);
          setBusy(false);
          if (r?.ok) router.refresh(); else setErr("Mislykkedes.");
        }}>{busy ? "…" : paused ? "Start igen" : "Sæt på pause"}</button>
      {err ? <span role="alert" className="inline-error">{err}</span> : null}
    </>
  );
}
