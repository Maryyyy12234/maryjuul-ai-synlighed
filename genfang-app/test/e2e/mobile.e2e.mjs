// End-to-end test mod en kørende produktionsbuild med fast testur.
//   GENFANG_ENV=test GENFANG_TEST_NOW=2026-11-05T15:54:00Z SESSION_SECRET=... DEMO_PASSWORD=... npm start
//   BASE_URL=http://localhost:3100 DEMO_PASSWORD=... npm run test:e2e
// Testuret svarer til torsdag 5. nov. 2026 kl. 16.54 – Sofies henvendelse er modtaget kl. 16.42.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = process.env.DEMO_PASSWORD;
const OWNER_PW = process.env.OWNER_PASSWORD;
if (!PW || !OWNER_PW) throw new Error("Sæt DEMO_PASSWORD og OWNER_PASSWORD");
const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["OK  ", name]); }
  catch (e) { results.push(["FEJL", name + " → " + String(e?.message ?? e).split("\n")[0]]); }
}
function assert(c, m) { if (!c) throw new Error(m); }

async function login(page, email = "ejer@hansen-vvs.test", pw = PW, expect = "/") {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await Promise.all([page.waitForURL(BASE + expect), page.click('button[type="submit"]')]);
}
const api = (page, path, body) => page.evaluate(async ([p, b]) => {
  const r = await fetch(p, b ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) } : undefined);
  return { status: r.status, body: await r.json().catch(() => null) };
}, [path, body]);

function contrast(fg, bg) {
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const browser = await chromium.launch();

// ---------- Uden login / grundlæggende sikkerhed ----------
await step("Uden login sendes man til /login; API giver 401 med no-store", async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto(BASE + "/henvendelser"); assert(p.url().endsWith("/login"), p.url());
  const r = await fetch(BASE + "/api/v1/overview"); assert(r.status === 401, "status " + r.status);
  assert((r.headers.get("cache-control") ?? "").includes("no-store"), "no-store");
  await ctx.close();
});

await step("Forfalsket session-cookie afvises", async () => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gf_session", value: "eyJ1aWQiOiJ1X2xhcnMiLCJ0aWQiOiJ0X2hhbnNlbiIsInJvbGUiOiJzdXBlcmFkbWluIn0.ZmFrZQ", url: BASE }]);
  const p = await ctx.newPage(); await p.goto(BASE + "/ejer"); assert(p.url().endsWith("/login"), p.url());
  await ctx.close();
});

await step("Manifest, ikoner, service worker og sikkerheds-headers", async () => {
  const m = await (await fetch(BASE + "/manifest.webmanifest")).json();
  assert(m.display === "standalone" && m.icons.some((i) => i.purpose === "maskable"), "manifest");
  for (const i of m.icons) assert((await fetch(BASE + i.src)).status === 200, i.src);
  const sw = await fetch(BASE + "/sw.js"); assert((sw.headers.get("cache-control") ?? "").includes("no-cache"), "sw");
  const h = await fetch(BASE + "/login"); assert(h.headers.get("x-frame-options") === "DENY" && (h.headers.get("x-robots-tag") ?? "").includes("noindex"), "headers");
});

// ---------- Ejer på iPhone ----------
const iphone = await browser.newContext({ ...devices["iPhone 13"] });
const ip = await iphone.newPage();

await step("iPhone: login → nyt overblik med handling, resultater, datakilder og penge", async () => {
  await login(ip);
  for (const h of ["Kræver handling", "Resultater", "Tilbud og penge", "GENFANG Insights", "AI-workers"]) await ip.getByRole("heading", { name: h, exact: true }).waitFor();
  await ip.getByText("Sofie Kragh · Mulig vandskade").waitFor();
  const prov = await ip.locator(".kpi .prov").allTextContents();
  assert(prov.some((t) => /testdata/i.test(t)) && prov.some((t) => /estimat/i.test(t)), "datakilder: " + prov.join(","));
  await ip.getByText("Potentiel – ikke vundet endnu").first().waitFor();
  await ip.screenshot({ path: SHOTS + "01-oversigt-iphone.png" });
  await ip.screenshot({ path: SHOTS + "01b-oversigt-iphone-hel.png", fullPage: true });
});

await step("iPhone: overskrifter ≤ 34 px, kontrast ≥ 4,5:1, ingen vandret scroll", async () => {
  const size = await ip.locator("h1.title").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  assert(size <= 34, "h1 " + size);
  for (const sel of [".eyebrow", ".kpi .label", ".act span.sub", ".tab:not([aria-current])"]) {
    const [fg, bg] = await ip.locator(sel).first().evaluate((e) => [getComputedStyle(e).color, getComputedStyle(document.body).backgroundColor]);
    const c = contrast(fg, bg); assert(c >= 4.5, `${sel} kontrast ${c.toFixed(2)}`);
  }
  assert(!(await ip.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "vandret scroll");
});

await step("iPhone: fanebjælke dækker ikke indhold og har 5 faner for ejer", async () => {
  assert((await ip.locator(".tabbar .tab").count()) === 5, "antal faner");
  await ip.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await ip.waitForTimeout(150);
  const last = await ip.locator("main > *:last-child").boundingBox();
  const bar = await ip.locator(".tabbar").boundingBox();
  assert(last.y + last.height <= bar.y + 1, `indhold under fanebjælke: ${last.y + last.height} > ${bar.y}`);
  for (const [label, path] of [["Sager", "/henvendelser"], ["Tilbud", "/tilbud"], ["Indsigt", "/indsigt"], ["Mere", "/mere"], ["Oversigt", "/"]]) {
    await ip.locator(".tabbar").getByRole("link", { name: label }).click();
    await ip.waitForURL(BASE + path);
  }
});

await step("REGRESSION (UI): Sofies udkast kl. 16.42 med »i dag kl. 14–16« blokeres", async () => {
  await ip.goto(BASE + "/henvendelser/inq_1042");
  await ip.getByText("Modtaget kl. 16.42").waitFor();
  await ip.getByText("Sikkerhedskontrollen stopper godkendelsen").waitFor();
  await ip.getByText("Tidspunktet er allerede passeret.").waitFor();
  assert(await ip.getByRole("button", { name: "Godkend og send" }).isDisabled(), "knap skal være deaktiveret");
  await ip.getByText("Mulig vandskade – sikker vejledning til kunden").waitFor();
  await ip.getByText("Eskaleret til Mikkel").waitFor();
  await ip.screenshot({ path: SHOTS + "02-sofie-blokeret-iphone.png" });
  await ip.screenshot({ path: SHOTS + "02b-sofie-blokeret-iphone-hel.png", fullPage: true });
});

await step("REGRESSION (API): godkendelse uden om knappen afvises med 422 og intet sendes", async () => {
  const v = await api(ip, "/api/v1/inquiries/inq_1042");
  const r = await api(ip, "/api/v1/inquiries/inq_1042/decision", { decision: "approve", expectedVersion: v.body.inquiry.version });
  assert(r.status === 422, "status " + r.status);
  assert(r.body.guard.issues.some((i) => i.code === "tid_i_fortiden"), JSON.stringify(r.body.guard));
});

await step("Nyt udkast fra Worker 02 → ingen tid lovet → Godkend og send", async () => {
  await ip.getByRole("button", { name: "Nyt udkast" }).click();
  await ip.getByText("Sikkerhedskontrol bestået").waitFor();
  const text = await ip.locator("#draft").inputValue();
  assert(/vagthavende/.test(text) && !/kl\.\s*\d/.test(text), "udkast: " + text);
  await ip.getByRole("button", { name: "Godkend og send" }).click();
  await ip.getByText("Udsendelse er blokeret i testversionen").first().waitFor();
  await ip.screenshot({ path: SHOTS + "03-sofie-godkendt-iphone.png" });
});

await step("Rediger: live-kontrol blokerer en opfundet tid og pris, mens man skriver", async () => {
  await ip.goto(BASE + "/henvendelser/inq_1039");
  await ip.getByText("Sikkerhedskontrol bestået").waitFor();
  await ip.locator(".actionbar").getByRole("button", { name: "Rediger" }).click();
  await ip.fill("#draft", "Hej Peter. Vi kommer i dag kl. 14-16, og det koster 2.000 kr.");
  await ip.getByText("Tidspunktet er allerede passeret.").waitFor();
  await ip.getByText("Beløbet står ikke i den godkendte prisliste").waitFor();
  assert(await ip.getByRole("button", { name: "Godkend og send" }).isDisabled(), "skal være deaktiveret");
  await ip.screenshot({ path: SHOTS + "04-rediger-blokeret-iphone.png" });
});

await step("Eskalér: almindelig sag sendes til vagthavende", async () => {
  await ip.goto(BASE + "/henvendelser/inq_1040");
  ip.once("dialog", (d) => d.accept("Kunden er uden varme"));
  await ip.getByRole("button", { name: "Eskalér" }).click();
  await ip.getByText("Eskaleret til Mikkel: Kunden er uden varme").waitFor();
});

await step("Tilbud: syv statusser, potentiel vs. betalt, ejer godkender tilbud", async () => {
  await ip.goto(BASE + "/tilbud");
  for (const h of ["Afventer din godkendelse", "Sendt – venter på kunden", "Kladder", "Vundet", "Tabt", "Foreslåede opfølgninger"]) await ip.getByRole("heading", { name: h }).waitFor();
  await ip.getByText("Udløbet").first().waitFor();
  await ip.getByText("Faktureret").first().waitFor();
  await ip.screenshot({ path: SHOTS + "05-tilbud-iphone-hel.png", fullPage: true });
  const first = await ip.locator("main section.section").filter({ has: ip.getByRole("heading") }).first().locator("h2").first().textContent();
  assert(first === "Afventer din godkendelse", "første sektion: " + first);
  await ip.locator('section[data-group="afventer_godkendelse"]').getByRole("button", { name: "Godkend og send" }).click();
  await ip.locator('section[data-group="afventer_godkendelse"]').waitFor({ state: "detached" });
});

await step("Opfølgning: lovligt grundlag vises, ejer godkender én", async () => {
  await ip.getByText("Lovligt grundlag:").first().waitFor();
  const before = await ip.locator(".followup").count();
  await ip.locator(".followup").first().getByRole("button", { name: "Godkend og send" }).click();
  await ip.waitForFunction((n) => document.querySelectorAll(".followup").length < n, before);
});

await step("Indsigt: periodesammenligning i procentpoint, metode og datagrundlag", async () => {
  await ip.goto(BASE + "/indsigt");
  await ip.getByRole("heading", { name: "Periodesammenligning" }).waitFor();
  const t = await ip.locator("table.data").innerText();
  assert(/procentpoint/.test(t), "procentpoint mangler");
  await ip.getByText("Alle tal er testdata").waitFor();
  await ip.getByRole("heading", { name: "Metode" }).waitFor();
  await ip.screenshot({ path: SHOTS + "06-indsigt-iphone-hel.png", fullPage: true });
});

await step("Simulér henvendelse: vandskade → akut, eskaleret, sikkert udkast", async () => {
  await ip.goto(BASE + "/mere");
  await ip.getByRole("button", { name: "Eksempel: vandskade" }).click();
  await ip.waitForURL(/\/henvendelser\/inq_/);
  await ip.getByText("Mulig vandskade – sikker vejledning til kunden").waitFor();
  await ip.getByText("Sikkerhedskontrol bestået").waitFor();
});

await step("Workers-side viser opgaver, status og log", async () => {
  await ip.goto(BASE + "/workers");
  for (const n of ["Worker 01 · Intake", "Worker 02 · Responder", "Worker 03 · Follow-up", "Worker 04 · Analytics"]) await ip.getByRole("heading", { name: n }).waitFor();
  await ip.getByRole("heading", { name: "Log" }).waitFor();
});

// ---------- Medarbejder ----------
await step("Medarbejder: kvitterer eskalering, ser ikke Indsigt, kan ikke godkende tilbud", async () => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] }); const p = await ctx.newPage();
  await login(p, "mikkel@hansen-vvs.test");
  assert((await p.locator(".tabbar .tab").count()) === 4, "medarbejder skal have 4 faner");
  const res = await p.goto(BASE + "/indsigt"); assert(res.status() === 404, "indsigt " + res.status());
  const q = await api(p, "/api/v1/quotes/q_309/decision", { decision: "approve", expectedVersion: 1 });
  assert(q.status === 403, "tilbud " + q.status);
  await p.goto(BASE + "/henvendelser/inq_1040");
  await p.getByRole("button", { name: "Kvittér: jeg tager sagen" }).click();
  await p.getByText("Mikkel har kvitteret").waitFor();
  await p.screenshot({ path: SHOTS + "07-medarbejder-android.png" });
  await ctx.close();
});

// ---------- To enheder ----------
await step("To enheder: desktop kan ikke godkende en sag, telefonen netop har godkendt", async () => {
  const desk = await browser.newContext({ viewport: { width: 1360, height: 860 } }); const dp = await desk.newPage();
  await login(dp);
  await dp.goto(BASE + "/henvendelser/inq_1041");
  await dp.getByRole("button", { name: "Godkend og send" }).waitFor();
  await ip.goto(BASE + "/henvendelser/inq_1041");
  await ip.getByRole("button", { name: "Godkend og send" }).click();
  await ip.getByText("Udsendelse er blokeret i testversionen").first().waitFor();
  await dp.getByRole("button", { name: "Godkend og send" }).click();
  await dp.getByText("Sagen er allerede behandlet").waitFor();
  await dp.goto(BASE + "/");
  await dp.screenshot({ path: SHOTS + "08-oversigt-desktop.png" });
  await desk.close();
});

await step("CSRF: POST fra fremmed oprindelse afvises", async () => {
  const c = (await iphone.cookies()).find((x) => x.name === "gf_session");
  const r = await fetch(BASE + "/api/v1/inquiries/inq_1039/escalate", { method: "POST", headers: { "Content-Type": "application/json", Cookie: `gf_session=${c.value}`, Origin: "https://ond-side.example" }, body: "{}" });
  assert(r.status === 403, "status " + r.status);
});

await step("Service worker cacher aldrig API eller sider; offline viser neutral side", async () => {
  await ip.goto(BASE + "/");
  await ip.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(() => ip.reload());
  await ip.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 });
  await ip.goto(BASE + "/tilbud");
  const cached = await ip.evaluate(async () => { const u = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) u.push(new URL(r.url).pathname); return u; });
  assert(cached.every((u) => !u.startsWith("/api/") && u !== "/" && !u.startsWith("/henvendelser") && !u.startsWith("/tilbud")), "cache: " + cached.join(","));
  await iphone.setOffline(true);
  await ip.goto(BASE + "/tilbud").catch(() => {});
  await ip.getByRole("heading", { name: "Du er offline." }).waitFor({ timeout: 8000 });
  await iphone.setOffline(false);
});

// ---------- Anden virksomhed ----------
await step("Virksomhedsisolering: Nordlys El ser ikke Hansen VVS' sager", async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage();
  await login(p, "ejer@nordlys-el.test");
  assert(!(await p.locator("body").innerText()).includes("Sofie Kragh"), "lækage på oversigt");
  assert((await p.goto(BASE + "/henvendelser/inq_1042")).status() === 404, "side");
  assert((await api(p, "/api/v1/inquiries/inq_1042")).status === 404, "api");
  assert((await api(p, "/api/v1/inquiries/inq_1039/escalate", { reason: "x" })).status === 404, "eskalering");
  assert((await p.goto(BASE + "/ejer")).status() === 404, "ejerpanel skal give 404");
  await ctx.close();
});

// ---------- Platformens ejer ----------
await step("Ejerpanel: separat login, økonomi, ingen kundedata, nødstop virker", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  await login(p, "ejer@genfang.test", OWNER_PW, "/ejer");
  await p.getByRole("heading", { name: "Drift og økonomi" }).waitFor();
  const body = await p.locator("body").innerText();
  assert(body.includes("4.985 kr."), "MRR mangler");
  for (const leak of ["Sofie", "Kragh", "Testvej", "Peter Sand"]) assert(!body.includes(leak), "lækker " + leak);
  await p.goto(BASE + "/"); assert(p.url().endsWith("/ejer"), "superadmin skal ikke se virksomhedsapp");
  await p.screenshot({ path: SHOTS + "09-ejerpanel-desktop.png", fullPage: true });
  p.once("dialog", (d) => d.accept("E2E-test af nødstop"));
  await p.getByRole("button", { name: "Aktivér nødstop" }).click();
  await p.getByText("NØDSTOP ER AKTIVT").waitFor();
  await ip.goto(BASE + "/");
  await ip.getByText("GENFANG har aktiveret nødstop").waitFor();
  const i = await api(ip, "/api/v1/inquiries/inq_1039");
  const r = await api(ip, "/api/v1/inquiries/inq_1039/decision", { decision: "approve", expectedVersion: i.body.inquiry.version });
  assert(r.status === 423, "godkendelse under nødstop: " + r.status);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Genoptag drift" }).click();
  await p.getByRole("button", { name: "Aktivér nødstop" }).waitFor();
  await ctx.close();
});

await step("Log ud fjerner adgang; rate limit på fejlede logins", async () => {
  await ip.goto(BASE + "/mere");
  await ip.getByRole("button", { name: "Log ud" }).click();
  await ip.waitForURL(BASE + "/login");
  await ip.goto(BASE + "/"); assert(ip.url().endsWith("/login"), "stadig logget ind");
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await fetch(BASE + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "angriber@test.test", password: "x" + i }) })).status;
  assert(last === 429, "status " + last);
});

await browser.close();
for (const [s, n] of results) console.log(s, n);
const failed = results.filter(([s]) => s.startsWith("FEJL")).length;
console.log(`\n${results.length - failed}/${results.length} bestået. Skærmbilleder: ${SHOTS}`);
process.exit(failed ? 1 : 0);
