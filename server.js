// MARY JUUL – AI-synlighed. Webserver til Render.
// Viser salgssiden og kører AI-tjekket på /api/check. Ingen afhængigheder.

const http = require("http");
const fs = require("fs");
const path = require("path");
const handler = require("./check.js");

const PORT = process.env.PORT || 10000;
const page = fs.readFileSync(path.join(__dirname, "index.html"));

// Simpel beskyttelse mod misbrug: max 20 tjek pr. IP pr. 10 minutter.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 20;
}

http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (req.url.startsWith("/api/check")) {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "For mange tjek på kort tid. Prøv igen om lidt." }));
    }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
    req.on("end", () => { req.body = body; handler(req, res); });
    return;
  }

  if (req.url === "/healthz") { res.end("ok"); return; }

  if (req.url === "/robots.txt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("User-agent: *\nAllow: /\nDisallow: /api/\n");
  }
  if (req.url === "/llms.txt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("# MARY JUUL\n\nWebdesign og AI-synlighed for lokale virksomheder i Aarhus (caféer, saloner, butikker).\n\n- AI-klar: tjek og rettelser af hjemmeside og Google-profil, 1.495 kr.\n- Ny hjemmeside: fra 4.500 kr.\n- Månedlig pleje: 399 kr./md.\n- Kontakt: Marie, telefon 28 34 64 04, Aarhus.\n");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(page);
}).listen(PORT, () => console.log("Kører på port " + PORT));
