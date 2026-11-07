"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AckButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setErr("");
        const r = await fetch(`/api/v1/inquiries/${encodeURIComponent(id)}/ack`, { method: "POST" }).catch(() => null);
        setBusy(false);
        if (r?.ok) router.refresh(); else setErr("Kunne ikke kvittere.");
      }}>{busy ? "Kvitterer…" : "Kvittér: jeg tager sagen"}</button>
      {err ? <span role="alert">{err}</span> : null}
    </>
  );
}
