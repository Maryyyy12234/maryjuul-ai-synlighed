// Skrivebeskyttet røgtest mod en kørende testversion (ændrer ingen data).
//   BASE_URL=https://genfang-test.onrender.com DEMO_PASSWORD=... OWNER_PASSWORD=... node test/e2e/live-smoke.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL, PW = process.env.DEMO_PASSWORD, OPW = process.env.OWNER_PASSWORD;
const SHOTS = new URL("./screenshots-live/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const out = [];
const step = async (n, f) => { try { await f(); out.push(["OK  ", n]); } catch (e) { out.push(["FEJL", `${n} → ${String(e.message).split("\n")[0]}`]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const b = await chromium.launch();
async function login(p, email, pw, expect = "/") {
  await p.goto(BASE + "/login", { timeout: 90000 });
  await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', pw);
  await Promise.all([p.waitForURL(BASE + expect, { timeout: 60000 }), p.click('button[type="submit"]')]);
}
await step("Uden login → /login, API 401", async () => {
  const c = await b.newContext(); const p = await c.newPage();
  await p.goto(BASE + "/tilbud", { timeout: 90000 }); ok(p.url().endsWith("/login"), p.url());
  ok((await p.evaluate(async () => (await fetch("/api/v1/overview")).status)) === 401, "api");
  await c.close();
});
const c = await b.newContext({ ...devices["iPhone 13"] }); const p = await c.newPage();
await step("Ejer (iPhone): login og oversigt", async () => {
  await login(p, "ejer@hansen-vvs.test", PW);
  for (const h of ["Kræver handling", "Resultater", "Tilbud og penge"]) await p.getByRole("heading", { name: h, exact: true }).waitFor();
  await p.screenshot({ path: SHOTS + "live-oversigt-iphone.png" });
});
await step("Sofies gamle udkast er blokeret af sikkerhedslaget", async () => {
  await p.goto(BASE + "/henvendelser/inq_1042");
  await p.getByText("Sikkerhedskontrollen stopper godkendelsen").waitFor();
  ok(await p.getByRole("button", { name: "Godkend og send" }).isDisabled(), "knap aktiv");
  await p.screenshot({ path: SHOTS + "live-sofie-iphone.png" });
});
await step("Alle faner indlæses", async () => {
  for (const path of ["/henvendelser", "/tilbud", "/indsigt", "/mere", "/workers", "/mere/audit", "/mere/gdpr"]) {
    const r = await p.goto(BASE + path); ok(r.status() === 200, `${path} ${r.status()}`);
  }
});
await step("Medarbejder: ingen Indsigt", async () => {
  const c2 = await b.newContext({ ...devices["Pixel 7"] }); const p2 = await c2.newPage();
  await login(p2, "mikkel@hansen-vvs.test", PW);
  ok((await p2.goto(BASE + "/indsigt")).status() === 404, "indsigt synlig");
  await c2.close();
});
await step("Anden virksomhed ser ikke Hansen VVS' sag; ejerpanel giver 404", async () => {
  const c3 = await b.newContext(); const p3 = await c3.newPage();
  await login(p3, "ejer@nordlys-el.test", PW);
  ok((await p3.goto(BASE + "/henvendelser/inq_1042")).status() === 404, "sag");
  ok((await p3.goto(BASE + "/ejer")).status() === 404, "ejer");
  await c3.close();
});
await step("Ejerpanel: separat login, ingen kundedata", async () => {
  const c4 = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p4 = await c4.newPage();
  await login(p4, "ejer@genfang.test", OPW, "/ejer");
  const t = await p4.locator("body").innerText();
  ok(t.includes("Drift og økonomi") && !t.includes("Sofie"), "indhold");
  await p4.screenshot({ path: SHOTS + "live-ejerpanel.png" });
  await c4.close();
});
await step("Manifest og service worker", async () => {
  const r = await b.newContext(); const pg = await r.newPage(); await pg.goto(BASE + "/login");
  const [disp, sw] = await pg.evaluate(async () => [(await (await fetch("/manifest.webmanifest")).json()).display, (await fetch("/sw.js")).status]);
  ok(disp === "standalone" && sw === 200, `${disp} ${sw}`); await r.close();
});
await b.close();
for (const [s, n] of out) console.log(s, n);
const f = out.filter(([s]) => s.startsWith("FEJL")).length;
console.log(`\n${out.length - f}/${out.length} bestået mod ${BASE}`);
process.exit(f ? 1 : 0);
