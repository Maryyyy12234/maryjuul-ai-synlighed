// End-to-end test mod en kørende produktionsbuild.
//   SESSION_SECRET=... DEMO_PASSWORD=... npm run build && npm start   (port 3100)
//   BASE_URL=http://localhost:3100 DEMO_PASSWORD=... npm run test:e2e
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = process.env.DEMO_PASSWORD;
if (!PW) throw new Error("Sæt DEMO_PASSWORD");
const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["OK  ", name]); }
  catch (e) { results.push(["FEJL", name + " → " + (e?.message ?? e).split("\n")[0]]); }
}
function assert(c, m) { if (!c) throw new Error(m); }

async function login(page, email = "ejer@hansen-vvs.test", pw = PW) {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await Promise.all([page.waitForURL(BASE + "/"), page.click('button[type="submit"]')]);
}

const browser = await chromium.launch();

// ---------- Uden login ----------
await step("Uden login sendes man til /login", async () => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + "/henvendelser");
  assert(p.url().endsWith("/login"), "url: " + p.url());
  await ctx.close();
});

await step("API uden session giver 401", async () => {
  const r = await fetch(BASE + "/api/v1/overview");
  assert(r.status === 401, "status " + r.status);
  assert((r.headers.get("cache-control") ?? "").includes("no-store"), "mangler no-store");
});

await step("Forfalsket session-cookie afvises", async () => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gf_session", value: "eyJ1aWQiOiJ1X2xhcnMiLCJ0aWQiOiJ0X2hhbnNlbiJ9.ZmFrZQ", url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(BASE + "/");
  assert(p.url().endsWith("/login"), "url: " + p.url());
  await ctx.close();
});

await step("Manifest, ikoner og service worker serveres korrekt", async () => {
  const m = await (await fetch(BASE + "/manifest.webmanifest")).json();
  assert(m.display === "standalone" && m.name === "GENFANG", "manifest");
  assert(m.icons.some((i) => i.purpose === "maskable") && m.icons.some((i) => i.sizes === "512x512"), "ikoner");
  for (const i of m.icons) assert((await fetch(BASE + i.src)).status === 200, "ikon " + i.src);
  assert((await fetch(BASE + "/icons/apple-touch-icon.png")).status === 200, "apple-touch-icon");
  const sw = await fetch(BASE + "/sw.js");
  assert(sw.status === 200 && (sw.headers.get("cache-control") ?? "").includes("no-cache"), "sw headers");
  const home = await fetch(BASE + "/login");
  assert(home.headers.get("x-frame-options") === "DENY", "x-frame-options");
  assert((home.headers.get("x-robots-tag") ?? "").includes("noindex"), "noindex");
});

await step("Forkert adgangskode giver neutral fejl", async () => {
  const ctx = await browser.newContext(devices["iPhone 13"]);
  const p = await ctx.newPage();
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', "ejer@hansen-vvs.test");
  await p.fill('input[name="password"]', "forkert-kode");
  await p.click('button[type="submit"]');
  await p.getByText("Forkert e-mail eller adgangskode.").waitFor();
  await p.screenshot({ path: SHOTS + "01-login-iphone.png" });
  await ctx.close();
});

// ---------- iPhone: login → oversigt → godkend ----------
const iphone = await browser.newContext({ ...devices["iPhone 13"] });
const ip = await iphone.newPage();

await step("iPhone: login og oversigt med henvendelser, godkendelser og tilbud", async () => {
  await login(ip);
  await ip.getByRole("heading", { name: "Afventer din godkendelse" }).waitFor();
  await ip.getByRole("heading", { name: "Nye henvendelser" }).waitFor();
  await ip.getByRole("heading", { name: "Tilbud", exact: true }).waitFor();
  await ip.getByText("1 akut sag").waitFor();
  const stat = await ip.locator(".stat b").first().textContent();
  assert(stat === "2", "afventer-tal: " + stat);
  await ip.screenshot({ path: SHOTS + "02-oversigt-iphone.png" });
  await ip.screenshot({ path: SHOTS + "02b-oversigt-iphone-hel.png", fullPage: true });
});

await step("iPhone: bundnavigation er synlig og inden for skærmen", async () => {
  const box = await ip.locator(".tabbar").boundingBox();
  const vp = ip.viewportSize();
  assert(box && box.y + box.height <= vp.height + 1 && box.y > vp.height - 120, "tabbar placering " + JSON.stringify(box));
  const overflow = await ip.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, "vandret scroll på mobil");
  const badge = await ip.locator(".tab .badge").textContent();
  assert(badge === "2", "badge " + badge);
});

await step("iPhone: navigering mellem alle faner", async () => {
  for (const [label, path, heading] of [["Henvendelser", "/henvendelser", "Henvendelser"], ["Tilbud", "/tilbud", "Tilbud"], ["Mere", "/mere", "Mere"], ["Oversigt", "/", null]]) {
    await ip.locator(".tabbar").getByRole("link", { name: label }).click();
    await ip.waitForURL(BASE + path);
    if (heading) await ip.getByRole("heading", { level: 1, name: heading }).waitFor();
    const cur = await ip.locator('.tab[aria-current="page"]').textContent();
    assert(cur.includes(label), "aktiv fane " + cur);
  }
  await ip.goto(BASE + "/tilbud");
  await ip.screenshot({ path: SHOTS + "04-tilbud-iphone.png" });
  await ip.goto(BASE + "/mere");
  await ip.screenshot({ path: SHOTS + "05-mere-iphone.png", fullPage: true });
});

// Anden enhed (desktop) åbner den samme sag FØR telefonen godkender.
const desk = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const dp = await desk.newPage();
await step("Desktop: login og sidebar-layout", async () => {
  await login(dp);
  const sidebar = await dp.locator(".tabbar").boundingBox();
  assert(sidebar && sidebar.x === 0 && sidebar.height > 700, "sidebar " + JSON.stringify(sidebar));
  await dp.screenshot({ path: SHOTS + "07-oversigt-desktop.png" });
  await dp.goto(BASE + "/henvendelser/inq_1042");
  await dp.getByRole("button", { name: "Godkend svar" }).waitFor();
});

await step("iPhone: åbn akut sag, ret svaret og godkend", async () => {
  await ip.goto(BASE + "/");
  await ip.getByText("1 akut sag").click();
  await ip.waitForURL(/\/henvendelser\/inq_1042$/);
  await ip.getByRole("heading", { name: "Sofie Kragh" }).waitFor();
  const bar = await ip.locator(".actionbar").boundingBox();
  assert(bar && bar.y + bar.height <= ip.viewportSize().height, "handlingslinje uden for skærm");
  await ip.screenshot({ path: SHOTS + "03-sag-iphone.png" });
  await ip.fill("#draft", "Hej Sofie\n\nVi kommer i dag kl. 14-16.\n\nVenlig hilsen\nLars");
  await ip.getByRole("button", { name: "Godkend svar" }).click();
  await ip.getByText("Udsendelse er blokeret i testversionen").waitFor();
  assert(await ip.locator(".actionbar").count() === 0, "knapper skal forsvinde efter godkendelse");
  await ip.screenshot({ path: SHOTS + "03b-sag-godkendt-iphone.png" });
});

await step("Desktop: samme sag kan ikke godkendes igen (ingen dobbelt-udsendelse)", async () => {
  await dp.getByRole("button", { name: "Godkend svar" }).click();
  await dp.getByText("Sagen er allerede behandlet").waitFor();
  await dp.getByText("Godkendt").first().waitFor();
  await dp.screenshot({ path: SHOTS + "08-konflikt-desktop.png" });
});

await step("Status synkroniseres: badge falder fra 2 til 1 på begge enheder", async () => {
  await ip.goto(BASE + "/");
  assert((await ip.locator(".tab .badge").textContent()) === "1", "iphone badge");
  await dp.goto(BASE + "/");
  assert((await dp.locator(".tab .badge").textContent()) === "1", "desktop badge");
});

await step("Dobbelttryk på Godkend sender kun én godkendelse", async () => {
  let posts = 0;
  ip.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/decision")) posts++; });
  await ip.goto(BASE + "/henvendelser/inq_1041");
  const btn = ip.getByRole("button", { name: "Godkend svar" });
  await btn.dblclick();
  await ip.getByText("Udsendelse er blokeret i testversionen").waitFor();
  assert(posts === 1, "antal POST: " + posts);
});

await step("CSRF: POST fra fremmed oprindelse afvises", async () => {
  const cookies = await ip.context().cookies();
  const c = cookies.find((x) => x.name === "gf_session");
  const r = await fetch(BASE + "/api/v1/inquiries/inq_1040/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `gf_session=${c.value}`, Origin: "https://ond-side.example" },
    body: JSON.stringify({ decision: "reject", expectedVersion: 1 }),
  });
  assert(r.status === 403, "status " + r.status);
});

await step("Service worker aktiv; API-svar og sider ligger ikke i cachen", async () => {
  await ip.goto(BASE + "/");
  await ip.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(async () => { await ip.reload(); });
  await ip.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 });
  await ip.goto(BASE + "/henvendelser");
  const cached = await ip.evaluate(async () => {
    const urls = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  assert(cached.includes("/offline"), "offline-side ikke precachet");
  const leaks = cached.filter((u) => u.startsWith("/api/") || u === "/" || u.startsWith("/henvendelser") || u.startsWith("/tilbud"));
  assert(leaks.length === 0, "kundedata i cache: " + leaks.join(","));
});

await step("Offline: neutral offline-side uden kundedata", async () => {
  await iphone.setOffline(true);
  await ip.goto(BASE + "/tilbud").catch(() => {});
  await ip.getByRole("heading", { name: "Du er offline." }).waitFor({ timeout: 8000 });
  const body = await ip.locator("body").innerText();
  assert(!body.includes("Anders Vinther"), "kundedata vist offline");
  await ip.screenshot({ path: SHOTS + "06-offline-iphone.png" });
  await iphone.setOffline(false);
});

// ---------- Android ----------
await step("Android (Pixel 7): login, oversigt og navigering", async () => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const p = await ctx.newPage();
  await login(p);
  await p.getByRole("heading", { name: "Afventer din godkendelse" }).waitFor();
  await p.locator(".tabbar").getByRole("link", { name: "Henvendelser" }).click();
  await p.waitForURL(/\/henvendelser/);
  await p.getByRole("link", { name: /Alle/ }).click();
  await p.waitForURL(/filter=alle/);
  await p.getByText("Karen Holm").waitFor();
  await p.screenshot({ path: SHOTS + "09-henvendelser-android.png" });
  await ctx.close();
});

// ---------- Anden virksomhed ----------
await step("Virksomhedsisolering: Nordlys El kan ikke se Hansen VVS' sag", async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  await login(p, "ejer@nordlys-el.test");
  const body = await p.locator("body").innerText();
  assert(!body.includes("Sofie Kragh") && body.includes("Ole Bech"), "forkerte data på oversigt");
  const res = await p.goto(BASE + "/henvendelser/inq_1042");
  assert(res.status() === 404, "side-status " + res.status());
  const api = await p.evaluate(async () => (await fetch("/api/v1/inquiries/inq_1042")).status);
  assert(api === 404, "api-status " + api);
  const dec = await p.evaluate(async () => (await fetch("/api/v1/inquiries/inq_1041/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "reject", expectedVersion: 2 }) })).status);
  assert(dec === 404, "beslutnings-status " + dec);
  await ctx.close();
});

await step("Log ud fjerner adgang", async () => {
  await ip.goto(BASE + "/mere");
  await ip.getByRole("button", { name: "Log ud" }).click();
  await ip.waitForURL(BASE + "/login");
  await ip.goto(BASE + "/");
  assert(ip.url().endsWith("/login"), "stadig logget ind");
});

await step("Rate limit: for mange forkerte logins giver 429", async () => {
  let last = 0;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(BASE + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "angriber@test.test", password: "x" + i }) });
    last = r.status;
  }
  assert(last === 429, "status " + last);
});

await browser.close();
for (const [s, n] of results) console.log(s, n);
const failed = results.filter(([s]) => s.startsWith("FEJL")).length;
console.log(`\n${results.length - failed}/${results.length} bestået. Skærmbilleder: ${SHOTS}`);
process.exit(failed ? 1 : 0);
