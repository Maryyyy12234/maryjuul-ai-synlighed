"use client";
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallHint() {
  const [mode, setMode] = useState<"hidden" | "installed" | "ios" | "prompt" | "manual">("hidden");
  const [evt, setEvt] = useState<BIP | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) { setMode("installed"); return; }
    setMode(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "manual");
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIP); setMode("prompt"); };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  if (mode === "hidden") return null;
  return (
    <ul className="kv">
      <li>
        <span>App på hjemmeskærmen
          <small>
            {mode === "installed" && "Du bruger den installerede app."}
            {mode === "ios" && "I Safari: tryk på Del-ikonet og vælg »Føj til hjemmeskærm«."}
            {mode === "manual" && "I Chrome/Edge: åbn browsermenuen og vælg »Installer app«."}
            {mode === "prompt" && "Installer GENFANG som app på denne enhed."}
          </small>
        </span>
        {mode === "prompt" && evt ? (
          <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={async () => { await evt.prompt(); setEvt(null); setMode("manual"); }}>Installer</button>
        ) : <span>{mode === "installed" ? "Installeret" : ""}</span>}
      </li>
    </ul>
  );
}
