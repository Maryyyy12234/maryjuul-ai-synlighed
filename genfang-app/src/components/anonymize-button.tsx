"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnonymizeButton({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  return (
    <>
      <button className="btn btn-sm btn-warn" onClick={async () => {
        const c = window.prompt("Skriv ANONYMISER for at bekræfte.");
        if (c !== "ANONYMISER") return;
        const r = await fetch(`/api/v1/inquiries/${encodeURIComponent(id)}/anonymize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: c }) }).catch(() => null);
        const d = await r?.json().catch(() => ({}));
        if (r?.ok) { setMsg(`${d.affected} sag(er) anonymiseret.`); router.refresh(); } else setMsg(d?.error?.message ?? "Mislykkedes.");
      }}>Anonymisér kunde</button>
      {msg ? <p role="status">{msg}</p> : null}
    </>
  );
}
