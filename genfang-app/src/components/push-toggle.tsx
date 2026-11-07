"use client";
import { useEffect, useState } from "react";

type S = "checking" | "unsupported" | "ios-install-first" | "default" | "granted" | "denied";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle() {
  const [s, setS] = useState<S>("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) { setS(ios && !standalone ? "ios-install-first" : "unsupported"); return; }
    setS(Notification.permission as S);
  }, []);

  async function enable() {
    // Tilladelse spørges KUN efter et aktivt tryk – aldrig automatisk.
    const p = await Notification.requestPermission();
    setS(p as S);
    if (p !== "granted") return;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (reg && vapid && "pushManager" in reg) {
      try {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid) });
        await fetch("/api/v1/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        setMsg("Enheden er registreret. Udsendelse af push er slået fra i testversionen.");
      } catch {
        setMsg("Kunne ikke registrere push på denne enhed.");
      }
    } else {
      setMsg("Tilladelse givet. Push-server er ikke sat op i testversionen.");
    }
  }

  async function test() {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const opts = { body: "Ny akut sag venter. Åbn appen for detaljer.", tag: "genfang-test", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", data: { url: "/henvendelser" } };
    if (reg) await reg.showNotification("GENFANG", opts);
    else new Notification("GENFANG", opts);
  }

  const label: Record<S, string> = {
    checking: "Tjekker…",
    unsupported: "Ikke understøttet i denne browser",
    "ios-install-first": "Installer appen først (iPhone kræver det)",
    default: "Slået fra",
    granted: "Slået til",
    denied: "Blokeret i browserens indstillinger",
  };

  return (
    <>
      <ul className="kv">
        <li><span>Akutte sager<small>Kun neutral tekst på låseskærmen – aldrig navn, adresse eller besked.</small></span><span>{label[s]}</span></li>
      </ul>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {s === "default" ? <button className="btn btn-primary" onClick={enable}>Slå notifikationer til</button> : null}
        {s === "granted" ? <button className="btn btn-quiet" onClick={test}>Send testnotifikation</button> : null}
      </div>
      {msg ? <p className="notice">{msg}</p> : null}
    </>
  );
}
