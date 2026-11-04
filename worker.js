// MARY JUUL – baggrundsjob til Render Cron Jobs.
//
//   node worker.js vaek     Holder hjemmesiden vågen, så kunder ikke venter ~1 minut (kør hvert 10. minut).
//   node worker.js rapport  Kører AI-tjekket på alle sider i SITES og skriver en rapport i Render-loggen
//                           (kør fx hver mandag). SITES = kommasepareret liste, fx "maryjuul-ai-synlighed.onrender.com,kundecafe.dk".
//
// Jobbet gemmer intet og sender ingen beskeder. Resultaterne står i Render-loggen for jobbet.

const { analyse } = require("./check.js");

const SITE_URL = process.env.SITE_URL || "https://maryjuul-ai-synlighed.onrender.com";

async function vaek() {
  const t = Date.now();
  const res = await fetch(SITE_URL + "/healthz", { signal: AbortSignal.timeout(60000) });
  console.log(`[vaek] ${SITE_URL} svarede ${res.status} på ${Date.now() - t} ms`);
  if (!res.ok) process.exitCode = 1;
}

async function rapport() {
  const sites = (process.env.SITES || SITE_URL).split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`[rapport] Tjekker ${sites.length} side(r) – ${new Date().toISOString()}`);
  let fejl = 0;
  for (const site of sites) {
    try {
      const r = await analyse(site);
      const mangler = r.checks.filter((c) => c.status !== "ok").map((c) => `${c.status === "bad" ? "MANGLER" : "TJEK"}: ${c.title}`);
      console.log(`[rapport] ${r.host}: ${r.score}/100${mangler.length ? " | " + mangler.join(" | ") : " | alt ok"}`);
    } catch (e) {
      fejl++;
      console.log(`[rapport] ${site}: FEJL – ${e.message}`);
    }
  }
  if (fejl) process.exitCode = 1;
}

const mode = process.argv[2];
(mode === "vaek" ? vaek() : mode === "rapport" ? rapport() : Promise.reject(new Error("Brug: node worker.js vaek | rapport")))
  .catch((e) => { console.error("[worker] " + e.message); process.exitCode = 1; });
