// Tester database-migrationen mod en ægte Postgres (PGlite) – RLS, roller, atomiske
// skrivefunktioner, nødstop og append-only audit. Samme SQL køres senere i Supabase.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
const uA = "11111111-0000-4000-8000-00000000000a", uS = "11111111-0000-4000-8000-00000000000b", uB = "22222222-0000-4000-8000-00000000000a", uP = "99999999-0000-4000-8000-000000000001", uX = "33333333-0000-4000-8000-000000000001";
const cA = "cccccccc-0000-4000-8000-00000000000a", cB = "cccccccc-0000-4000-8000-00000000000b";
const iA = "dddddddd-0000-4000-8000-00000000000a", iB = "dddddddd-0000-4000-8000-00000000000b", iA2 = "dddddddd-0000-4000-8000-00000000000c";
const qA = "eeeeeeee-0000-4000-8000-00000000000a";

async function asSuper() { await db.exec("reset role"); }
async function asUser(uid: string) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', false);`); }
async function asAnon() { await db.exec(`reset role; set role anon; select set_config('request.jwt.claims', '', false);`); }
async function asService() { await db.exec(`reset role; set role service_role; select set_config('request.jwt.claims', '', false);`); }
async function err(p: Promise<unknown>): Promise<string> { try { await p; return "INGEN FEJL"; } catch (e) { return (e as Error).message; } }

before(async () => {
  // Supabase-roller (findes allerede i Supabase).
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20261107000001_genfang_core.sql", import.meta.url), "utf8"));
  await db.exec(`
    insert into public.tenants (id, name, plan_id, plan_price_dkk) values ('${A}', 'Hansen VVS', 'business', 1995), ('${B}', 'Nordlys El', 'pilot', 995);
    insert into public.memberships values ('${A}', '${uA}', 'owner'), ('${A}', '${uS}', 'staff'), ('${B}', '${uB}', 'owner');
    insert into public.platform_admins (user_id) values ('${uP}');
    insert into public.employees (tenant_id, name, title, on_call) values ('${A}', 'Lars', 'Ejer', false), ('${A}', 'Mikkel', 'Montør', true), ('${B}', 'Mette', 'Ejer', true);
    insert into public.customers (id, tenant_id, name, email, address) values ('${cA}', '${A}', 'Sofie Kragh', 'sofie@example.test', 'Testvej 12'), ('${cB}', '${B}', 'Ole Bech', 'ole@example.test', null);
    insert into public.inquiries (id, tenant_id, customer_id, channel, subject, message, category, urgency, status, draft_text, draft_by) values
      ('${iA}', '${A}', '${cA}', 'formular', 'Vand på gulvet', 'Der løber vand', 'akut', 'akut', 'udkast_klar', 'Vagthavende ringer dig op.', 'worker-02'),
      ('${iA2}', '${A}', '${cA}', 'mail', 'Radiator', 'Kold radiator', 'service', 'lav', 'ny', null, null),
      ('${iB}', '${B}', '${cB}', 'mail', 'HPFI', 'Relæ slår fra', 'andet', 'lav', 'udkast_klar', 'Vi vender tilbage.', 'worker-02');
    insert into public.quotes (id, tenant_id, customer_id, title, amount_dkk, status) values ('${qA}', '${A}', '${cA}', 'Gulvafløb', 7400, 'afventer_godkendelse');
    insert into public.follow_ups (tenant_id, kind, quote_id, draft, legal_basis, allowed) values ('${A}', 'tilbud_ubesvaret', '${qA}', 'Hej', 'Service', true);
  `);
});

test("RLS: hver virksomhed ser kun egne sager, kunder og tilbud", async () => {
  await asUser(uA);
  assert.deepEqual((await db.query<{ id: string }>("select id from public.inquiries order by id")).rows.map((r) => r.id), [iA, iA2]);
  assert.equal((await db.query("select * from public.customers")).rows.length, 1);
  assert.equal((await db.query("select * from public.tenants")).rows.length, 1);
  await asUser(uB);
  assert.deepEqual((await db.query<{ id: string }>("select id from public.inquiries")).rows.map((r) => r.id), [iB]);
  assert.equal((await db.query("select * from public.quotes")).rows.length, 0);
});

test("RLS: bruger uden medlemskab og platformens ejer ser ingen kundedata", async () => {
  for (const u of [uX, uP]) {
    await asUser(u);
    assert.equal((await db.query("select * from public.inquiries")).rows.length, 0);
    assert.equal((await db.query("select * from public.customers")).rows.length, 0);
  }
});

test("anon har ingen adgang", async () => {
  await asAnon();
  assert.match(await err(db.query("select * from public.inquiries")), /permission denied/);
});

test("klienter kan ikke skrive direkte – heller ikke i egen virksomhed", async () => {
  await asUser(uA);
  assert.match(await err(db.query(`update public.inquiries set status = 'godkendt' where id = '${iA}'`)), /permission denied/);
  assert.match(await err(db.query(`insert into public.outbox (tenant_id, kind, ref) values ('${A}', 'svar', 'x')`)), /permission denied/);
  assert.match(await err(db.query(`delete from public.customers`)), /permission denied/);
  assert.match(await err(db.query(`select app.decide_reply('${A}', '${uA}', '${iA}', 'approve', 1)`)), /permission denied/);
  assert.match(await err(db.query("select * from public.audit_log")), /permission denied/);
});

test("opfølgningsforslag er kun synlige for ejeren", async () => {
  await asUser(uS);
  assert.equal((await db.query("select * from public.follow_ups")).rows.length, 0);
  await asUser(uA);
  assert.equal((await db.query("select * from public.follow_ups")).rows.length, 1);
});

test("decide_reply: tenant, medlemskab, version og status håndhæves atomisk", async () => {
  await asService();
  assert.match(await err(db.query(`select app.decide_reply('${A}', '${uA}', '${iB}', 'approve', 1)`)), /not_found/);
  assert.match(await err(db.query(`select app.decide_reply('${B}', '${uA}', '${iB}', 'approve', 1)`)), /forbidden/);
  assert.match(await err(db.query(`select app.decide_reply('${A}', '${uA}', '${iA}', 'approve', 99)`)), /conflict/);
  assert.match(await err(db.query(`select app.decide_reply('${A}', '${uA}', '${iA2}', 'approve', 1)`)), /conflict/, "sag uden udkast");
  const r = await db.query<{ status: string; version: number }>(`select * from app.decide_reply('${A}', '${uS}', '${iA}', 'approve', 1)`);
  assert.equal(r.rows[0].status, "godkendt");
  assert.equal(r.rows[0].version, 2);
  assert.match(await err(db.query(`select app.decide_reply('${A}', '${uA}', '${iA}', 'approve', 1)`)), /conflict/, "anden enhed");
  assert.match(await err(db.query(`select app.decide_reply('${A}', '${uA}', '${iA}', 'approve', 2)`)), /conflict/, "allerede godkendt");
  await asSuper();
  assert.equal((await db.query(`select * from public.outbox where ref = '${iA}'`)).rows.length, 1, "præcis én udsendelse");
  assert.equal((await db.query(`select * from public.audit_log where target = '${iA}' and action = 'approve'`)).rows.length, 1);
});

test("decide_quote: kun ejer; nødstop blokerer; genoptagelse virker", async () => {
  await asService();
  assert.match(await err(db.query(`select app.decide_quote('${A}', '${uS}', '${qA}', 'approve', 1)`)), /forbidden/);
  assert.match(await err(db.query(`select app.set_emergency_stop('${uA}', true, 'x')`)), /forbidden/, "kun platformens ejer");
  assert.match(await err(db.query(`select app.set_emergency_stop('${uP}', true, '')`)), /invalid/, "årsag påkrævet");
  await db.query(`select app.set_emergency_stop('${uP}', true, 'Test')`);
  assert.match(await err(db.query(`select app.decide_quote('${A}', '${uA}', '${qA}', 'approve', 1)`)), /stopped/);
  assert.match(await err(db.query(`select app.decide_reply('${B}', '${uB}', '${iB}', 'approve', 1)`)), /stopped/);
  await db.query(`select app.set_emergency_stop('${uP}', false, '')`);
  const q = await db.query<{ status: string }>(`select * from app.decide_quote('${A}', '${uA}', '${qA}', 'approve', 1)`);
  assert.equal(q.rows[0].status, "sendt");
});

test("pause af én virksomhed stopper kun den virksomhed", async () => {
  await asSuper();
  await db.exec(`update public.tenants set paused = true where id = '${B}'`);
  await asService();
  assert.match(await err(db.query(`select app.decide_reply('${B}', '${uB}', '${iB}', 'approve', 1)`)), /stopped/);
  assert.equal(await err(db.query(`select app.escalate('${A}', '${uS}', '${iA2}', 'Uden varme')`)), "INGEN FEJL");
  assert.match(await err(db.query(`select app.escalate('${A}', '${uS}', '${iA2}', 'igen')`)), /conflict/);
  await asSuper();
  await db.exec(`update public.tenants set paused = false where id = '${B}'`);
});

test("auditloggen kan ikke ændres eller slettes – heller ikke af serveren eller superbruger", async () => {
  await asService();
  assert.match(await err(db.query("update public.audit_log set action = 'x'")), /kun til tilføjelse|permission denied/);
  await asSuper();
  assert.match(await err(db.query("delete from public.audit_log")), /kun til tilføjelse/);
  assert.match(await err(db.query("truncate public.audit_log")), /kun til tilføjelse/);
});

test("en sag kan ikke kobles til en kunde i en anden virksomhed", async () => {
  await asSuper();
  assert.match(await err(db.query(`insert into public.inquiries (tenant_id, customer_id, channel, subject, message, category, urgency) values ('${A}', '${cB}', 'mail', 'x', 'y', 'andet', 'lav')`)), /foreign key|violates/);
});

test("ejerpanelets aggregat: kun for platformens ejer og uden kundedata", async () => {
  await asService();
  assert.match(await err(db.query(`select * from app.admin_tenant_overview('${uA}')`)), /forbidden/);
  const r = await db.query(`select * from app.admin_tenant_overview('${uP}')`);
  assert.equal(r.rows.length, 2);
  const s = JSON.stringify(r.rows);
  for (const leak of ["Sofie", "Testvej", "example.test", "Vand på gulvet"]) assert.ok(!s.includes(leak), "lækker " + leak);
});

test("anonymisering: kun ejer, fjerner personoplysninger og logges", async () => {
  await asService();
  assert.match(await err(db.query(`select app.anonymize_customer('${A}', '${uS}', '${cA}')`)), /forbidden/);
  assert.match(await err(db.query(`select app.anonymize_customer('${A}', '${uA}', '${cB}')`)), /not_found/, "anden virksomheds kunde");
  await db.query(`select app.anonymize_customer('${A}', '${uA}', '${cA}')`);
  await asSuper();
  const c = (await db.query<{ name: string; email: string | null }>(`select name, email from public.customers where id = '${cA}'`)).rows[0];
  assert.equal(c.name, "Anonymiseret kunde");
  assert.equal(c.email, null);
  assert.equal((await db.query(`select * from public.inquiries where customer_id = '${cA}' and message not like '[Slettet%'`)).rows.length, 0);
});
