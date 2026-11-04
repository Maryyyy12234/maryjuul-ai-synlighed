// MARY JUUL – AI-synlighedstjek
// Tjekker teknisk, om en hjemmeside er læsbar for søgemaskiner og AI-søgning.
// Gemmer ingen data. Spørger ikke ChatGPT – ser kun på selve hjemmesiden.

const dns = require("dns").promises;
const net = require("net");

const TIMEOUT_MS = 9000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (compatible; MaryJuulTjek/1.1; +https://maryjuul-ai-synlighed.onrender.com)";

const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Google-Extended"];

// ---------- Sikkerhed: tillad kun offentlige adresser ----------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    return (
      p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224
    );
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") ||
    l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") ||
    l.startsWith("::ffff:192.168.") || l.startsWith("::ffff:169.254.");
}

async function assertPublic(urlObj) {
  if (!["http:", "https:"].includes(urlObj.protocol)) throw new Error("Kun http og https er tilladt.");
  if (process.env.ALLOW_PRIVATE === "1") return; // kun til lokal test
  if (urlObj.port && !["80", "443"].includes(urlObj.port)) throw new Error("Kun almindelige web-porte er tilladt.");
  const host = urlObj.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Adressen er ikke offentlig.");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Adressen er ikke offentlig.");
}

async function safeFetch(rawUrl) {
  let url = new URL(rawUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html,text/plain,*/*" } });
    } finally {
      clearTimeout(t);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url);
      continue;
    }
    const text = await readLimited(res);
    return { status: res.status, url: url.toString(), text, type: res.headers.get("content-type") || "" };
  }
  throw new Error("For mange viderestillinger.");
}

async function readLimited(res) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { try { reader.cancel(); } catch (_) {} break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

// ---------- Analyse ----------
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return "";
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : "";
}

const LOCAL_TYPES = ["LocalBusiness", "CafeOrCoffeeShop", "Restaurant", "FoodEstablishment", "Bakery", "BarOrPub",
  "Store", "ClothingStore", "BeautySalon", "HairSalon", "HealthAndBeautyBusiness", "DaySpa", "Organization", "ProfessionalService"];

function structuredData(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const items = [];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1].trim());
      const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x && x["@graph"] ? flat(x["@graph"]) : x ? [x] : []);
      items.push(...flat(data));
    } catch (_) { /* ugyldig JSON tæller ikke */ }
  }
  const types = items.flatMap((i) => [].concat(i["@type"] || []));
  const local = items.find((i) => [].concat(i["@type"] || []).some((t) => LOCAL_TYPES.includes(t)));
  return {
    count: items.length,
    types: [...new Set(types)].slice(0, 6),
    hasLocal: !!local,
    hasAddress: !!(local && local.address),
    hasPhone: !!(local && local.telephone),
    hasHours: !!(local && (local.openingHours || local.openingHoursSpecification)),
  };
}

function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (!lastWasAgent) { cur = { agents: [], disallowAll: false, allowRoot: false }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "disallow" && val === "/") cur.disallowAll = true;
      if (key === "allow" && val === "/") cur.allowRoot = true;
    }
  }
  const blocked = [];
  for (const bot of AI_BOTS) {
    const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    const g = own || groups.find((x) => x.agents.includes("*"));
    if (g && g.disallowAll && !g.allowRoot) blocked.push(bot);
  }
  return blocked;
}

function check(status, title, explain, fix, points, max) {
  return { status, title, explain, fix, points, max };
}

async function analyse(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("Skriv en hjemmesideadresse.");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  const start = new URL(raw);

  const page = await safeFetch(start.toString());
  if ([401, 403, 429, 503].includes(page.status)) {
    throw new Error("Hjemmesiden afviste vores tjek (den blokerer automatiske besøg). Det kan også betyde, at nogle AI-tjenester bliver afvist. Kontakt mig, så kigger jeg på den manuelt.");
  }
  if (page.status === 404) throw new Error("Siden findes ikke (fejl 404). Tjek adressen.");
  if (page.status >= 400) throw new Error(`Hjemmesiden svarede med fejl ${page.status}.`);
  if (page.type && !/html|xml|text\/plain/i.test(page.type)) throw new Error("Adressen peger ikke på en almindelig hjemmeside. Prøv forsidens adresse.");
  const base = new URL(page.url);
  const html = page.text;

  const [robots, llms] = await Promise.all([
    safeFetch(new URL("/robots.txt", base).toString()).catch(() => null),
    safeFetch(new URL("/llms.txt", base).toString()).catch(() => null),
  ]);

  const text = visibleText(html);
  const words = text ? text.split(" ").length : 0;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "";
  const desc = metaContent(html, "description");
  const sd = structuredData(html);
  const hasPhone = /(\+45[\s.]?)?\b\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}\b/.test(text);
  // Postnummer + by. Årstal (1900–2099) tæller kun, hvis der står en gadeadresse foran ("Ryesgade 28, 2000 Frederiksberg").
  const postalHits = text.match(/\b[1-9]\d{3}\s+[A-ZÆØÅ][a-zæøå]+/g) || [];
  const streetBeforePostal = /[A-ZÆØÅa-zæøå]{3,}\s+\d{1,3}[A-Za-z]?(?:,?\s*[\w.]{0,12})?,\s*[1-9]\d{3}\s+[A-ZÆØÅ][a-zæøå]+/.test(text);
  const hasPostal = streetBeforePostal || postalHits.some((h) => !/^(19|20)\d{2}\b/.test(h));
  const hasHoursText = /åbningstid|åbent|mandag|man\s*[-–]\s*fre|lørdag|søndag/i.test(text);
  // FAQ: et rigtigt FAQ-afsnit, FAQ-data, eller mindst 3 overskrifter/udfoldninger formuleret som spørgsmål.
  const questionHeadings = (html.match(/<(h[2-4]|summary|dt|button)[^>]*>([^<]{8,140}\?)\s*<\/\1>/gi) || []).length;
  const hasFaq = sd.types.includes("FAQPage") ||
    /\b(faq|ofte stillede spørgsmål|spørgsmål\s*(og|&|&amp;)\s*svar)\b/i.test(text) ||
    questionHeadings >= 3;
  const blockedBots = robots && robots.status < 400 && !/<html/i.test(robots.text) ? parseRobots(robots.text) : [];
  const hasLlms = !!(llms && llms.status === 200 && llms.text.trim().length > 20 && !/<html/i.test(llms.text));

  const checks = [];

  checks.push(base.protocol === "https:"
    ? check("ok", "Sikker forbindelse (https)", "Siden bruger https.", "", 5, 5)
    : check("bad", "Sikker forbindelse (https)", "Siden bruger ikke https. Det sænker tilliden hos både kunder og AI.", "Slå SSL/https til hos jeres udbyder.", 0, 5));

  checks.push(words >= 150
    ? check("ok", "AI kan læse jeres tekst", `Vi fandt ca. ${words} ord direkte i sidens kode.`, "", 25, 25)
    : words >= 50
      ? check("warn", "AI kan læse jeres tekst", `Kun ca. ${words} ord kan læses uden JavaScript. Meget tekst kan være skjult for AI.`, "Skriv mere tekst direkte på forsiden: hvem I er, hvad I tilbyder, hvor I ligger.", 12, 25)
      : check("bad", "AI kan læse jeres tekst", `Næsten ingen tekst kan læses uden JavaScript (ca. ${words} ord). Mange AI-crawlere ser en tom side.`, "Siden skal vise tekst direkte i koden – ofte kræver det en ny eller ombygget side.", 0, 25));

  checks.push(blockedBots.length === 0
    ? check("ok", "AI-crawlere har adgang", "robots.txt blokerer ikke de kendte AI-crawlere.", "", 15, 15)
    : check("bad", "AI-crawlere har adgang", `Disse bliver blokeret: ${blockedBots.join(", ")}.`, "Ret robots.txt, så AI-crawlerne må læse siden.", 0, 15));

  if (sd.hasLocal && sd.hasAddress && sd.hasPhone) {
    checks.push(check("ok", "Strukturerede data (virksomhedskort)", `Fundet: ${sd.types.join(", ")}.${sd.hasHours ? "" : " Åbningstider mangler i data."}`, sd.hasHours ? "" : "Tilføj åbningstider til de strukturerede data.", sd.hasHours ? 20 : 15, 20));
  } else if (sd.hasLocal) {
    checks.push(check("warn", "Strukturerede data (virksomhedskort)", "Der er et virksomhedskort, men adresse eller telefon mangler.", "Udfyld adresse, telefon og åbningstider i de strukturerede data.", 8, 20));
  } else {
    checks.push(check("bad", "Strukturerede data (virksomhedskort)", sd.count ? `Der er data (${sd.types.join(", ")}), men intet virksomhedskort.` : "Siden har ingen strukturerede data. AI skal selv gætte, hvem I er.", "Tilføj et LocalBusiness-kort med navn, adresse, telefon og åbningstider.", 0, 20));
  }

  const contactScore = [hasPhone, hasPostal, hasHoursText].filter(Boolean).length;
  checks.push(contactScore === 3
    ? check("ok", "Kontakt, adresse og åbningstider som tekst", "Telefon, adresse og åbningstider står som tekst på siden.", "", 15, 15)
    : check(contactScore === 0 ? "bad" : "warn", "Kontakt, adresse og åbningstider som tekst",
      `Mangler som læsbar tekst: ${[!hasPhone && "telefon", !hasPostal && "adresse med postnummer", !hasHoursText && "åbningstider"].filter(Boolean).join(", ")}.`,
      "Skriv dem som almindelig tekst – ikke kun i et billede eller et kort.", contactScore * 5, 15));

  const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(html) ||
    /<meta[^>]+content=["'][^"']*width=device-width[^"']*["'][^>]+name=["']viewport["']/i.test(html);
  checks.push(hasViewport
    ? check("ok", "Mobilvenlig opsætning", "Siden er sat op til at tilpasse sig mobilskærme.", "", 5, 5)
    : check("bad", "Mobilvenlig opsætning", "Siden mangler mobil-opsætningen (viewport). Den kan se lille og svær ud på telefonen.", "Tilføj mobil-opsætning, eller få en mobilvenlig side.", 0, 5));

  checks.push(title && desc
    ? check("ok", "Titel og beskrivelse", `Titel: “${title.slice(0, 70)}”.`, "", 10, 10)
    : check("warn", "Titel og beskrivelse", !title ? "Siden mangler en titel." : "Siden mangler en kort beskrivelse (meta description).", "Skriv en titel og en beskrivelse med jeres navn, bydel og hvad I er kendt for.", title ? 5 : 0, 10));

  checks.push(hasFaq
    ? check("ok", "Svar på kundernes spørgsmål", "Siden ser ud til at have spørgsmål og svar.", "", 5, 5)
    : check("warn", "Svar på kundernes spørgsmål", "Vi fandt ingen FAQ. AI elsker korte, direkte svar.", "Tilføj 4–6 spørgsmål som “Har I veganske retter?”.", 0, 5));

  checks.push(hasLlms
    ? check("ok", "llms.txt", "Siden har en llms.txt med fakta til AI.", "", 5, 5)
    : check("warn", "llms.txt", "Ingen llms.txt. Det er en ny standard, som ikke alle bruger endnu.", "Læg en kort fil med jeres vigtigste fakta i roden af domænet.", 0, 5));

  const score = checks.reduce((s, c) => s + c.points, 0);
  const max = checks.reduce((s, c) => s + c.max, 0);

  return {
    url: base.toString(),
    host: base.hostname.replace(/^www\./, ""),
    score: Math.round((score / max) * 100),
    checks,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Metode ikke tilladt." }));
  }
  let target = "";
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
      target = body.url;
    } else {
      target = new URL(req.url, "http://x").searchParams.get("url");
    }
    if (!target || String(target).length > 300) throw new Error("Skriv en gyldig hjemmesideadresse.");
    const result = await analyse(target);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(result));
  } catch (err) {
    const msg = err && err.name === "AbortError" ? "Hjemmesiden svarede ikke i tide." :
      err && /fetch failed|ENOTFOUND|EAI_AGAIN/.test(String(err.message || err.cause)) ? "Vi kunne ikke finde hjemmesiden. Tjek adressen." :
      (err && err.message) || "Noget gik galt.";
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: msg }));
  }
};

module.exports.analyse = analyse;
module.exports.parseRobots = parseRobots;
