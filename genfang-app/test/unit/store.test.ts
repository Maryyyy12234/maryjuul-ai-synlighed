process.env.OWNER_MFA_OPTIONAL = "1"; // disse tests handler ikke om MFA (se mfa-workers.test.ts)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ackEscalation, adminOverview, analytics, anonymizeCustomer, buildUrgentPushPayload, db, decide, decideFollowUp, decideQuote,
  escalate, getInquiry, getInquiryView, getOverview, ingest, listAudit, listFollowUps, listInquiries, listOutbox, listQuotes,
  quoteTotals, regenerateDraft, resetDb, setEmergencyStop, setTenantPaused, workerStatuses,
} from "../../src/lib/store.ts";
import { zonedToUtc } from "../../src/lib/time.ts";

// Torsdag 5. nov. 2026 kl. 16.54 dansk tid. Sofies henvendelse er modtaget kl. 16.42.
const NOW = zonedToUtc(2026, 11, 5, 16, 54, "Europe/Copenhagen");
beforeEach(() => resetDb(NOW));

const sofie = () => getInquiry("t_hansen", "inq_1042")!;

// ---------- Kl. 16.42-regressionen gennem hele kæden ----------

test("REGRESSION: Sofies udkast (kl. 14–16 samme dag, modtaget 16.42) kan ikke godkendes", () => {
  assert.equal(new Date(sofie().receivedAt).toISOString(), new Date(NOW - 12 * 60_000).toISOString());
  const v = getInquiryView("t_hansen", "inq_1042", NOW)!;
  assert.equal(v.guard?.ok, false);
  const r = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: sofie().version }, NOW);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "blocked");
  assert.ok(!r.ok && r.guard?.issues.some((i) => i.code === "tid_i_fortiden"));
  assert.equal(sofie().status, "udkast_klar", "status uændret");
  assert.equal(listOutbox("t_hansen").filter((o) => o.kind === "svar").length, 0, "intet i outbox");
  assert.ok(listAudit("t_hansen").some((a) => a.action === "guard_block"));
});

test("REGRESSION: rettet tekst med samme fejl blokeres også", () => {
  const r = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: sofie().version, editedText: "Hej Sofie. Vi kommer i dag kl. 14-16." }, NOW);
  assert.equal(!r.ok && r.code, "blocked");
});

test("Nyt udkast fra Responder til akut sag lover intet tidspunkt og kan godkendes", () => {
  const g = regenerateDraft("t_hansen", "u_lars", "inq_1042", sofie().version, NOW);
  assert.ok(g.ok, JSON.stringify(g));
  assert.equal(g.ok && g.guard.ok, true, JSON.stringify(g.ok && g.guard.issues));
  const text = sofie().draft!.text;
  assert.doesNotMatch(text, /kl\.\s*\d/);
  assert.match(text, /vagthavende/);
  assert.match(text, /stophanen/);
  const r = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: sofie().version }, NOW);
  assert.ok(r.ok);
  assert.equal(listOutbox("t_hansen").filter((o) => o.kind === "svar").length, 1);
});

test("Responders udkast med kalendertider passerer kontrollen (Peter, service)", () => {
  const v = getInquiryView("t_hansen", "inq_1039", NOW)!;
  assert.equal(v.guard?.ok, true, JSON.stringify(v.guard?.issues));
  assert.ok(v.basisSlots.length > 0, "bruger kalendertider");
  assert.match(v.inquiry.draft!.text, /i morgen mellem kl\. \d+ og \d+|mellem kl\./);
});

test("Responder bruger prisen fra prislisten (Jonas, tilbud)", () => {
  const v = getInquiryView("t_hansen", "inq_1041", NOW)!;
  assert.equal(v.guard?.ok, true);
  assert.match(v.inquiry.draft!.text, /1\.450 kr\./);
  assert.equal(v.basisPrices[0]?.id, "p_armatur");
});

test("opfundet pris i rettet tekst blokeres", () => {
  const i = getInquiry("t_hansen", "inq_1041")!;
  const r = decide("t_hansen", "u_lars", i.id, { decision: "approve", expectedVersion: i.version, editedText: "Hej Jonas. Det koster 999 kr." }, NOW);
  assert.equal(!r.ok && r.code, "blocked");
});

// ---------- Virksomhedsadskillelse og roller ----------

test("virksomheder ser kun egne sager og tilbud", () => {
  assert.ok(!listInquiries("t_hansen", "alle", NOW).some((i) => i.id === "inq_2001"));
  assert.equal(getInquiry("t_hansen", "inq_2001"), undefined);
  assert.ok(listQuotes("t_hansen", NOW).every((q) => q.tenantId === "t_hansen"));
});

test("handlinger på tværs af virksomheder giver not_found/forbidden og ændrer intet", () => {
  assert.equal((decide("t_hansen", "u_lars", "inq_2001", { decision: "reject", expectedVersion: 1 }, NOW) as { code: string }).code, "not_found");
  assert.equal((decide("t_nordlys", "u_lars", "inq_2001", { decision: "reject", expectedVersion: 1 }, NOW) as { code: string }).code, "forbidden");
  assert.equal((escalate("t_hansen", "u_lars", "inq_2001", "x", NOW) as { code: string }).code, "not_found");
  assert.equal((decideQuote("t_hansen", "u_lars", "q_401", { decision: "approve", expectedVersion: 1 }, NOW) as { code: string }).code, "not_found");
  assert.equal(getInquiry("t_nordlys", "inq_2001")!.status, "udkast_klar");
});

test("medarbejder kan godkende svar, men ikke tilbud, opfølgning eller sletning", () => {
  regenerateDraft("t_hansen", "u_mikkel", "inq_1042", sofie().version, NOW);
  assert.ok(decide("t_hansen", "u_mikkel", "inq_1042", { decision: "approve", expectedVersion: sofie().version }, NOW).ok);
  assert.equal((decideQuote("t_hansen", "u_mikkel", "q_312", { decision: "approve", expectedVersion: 1 }, NOW) as { code: string }).code, "forbidden");
  const fu = listFollowUps("t_hansen", NOW)[0];
  assert.equal((decideFollowUp("t_hansen", "u_mikkel", fu.id, { decision: "approve", expectedVersion: fu.version }, NOW) as { code: string }).code, "forbidden");
  assert.equal((anonymizeCustomer("t_hansen", "u_mikkel", "inq_1035", NOW) as { code: string }).code, "forbidden");
  assert.equal(getOverview("t_hansen", "u_mikkel", NOW)!.analytics, undefined, "medarbejder ser ikke omsætning");
});

test("superadmin kan ikke handle på virksomheders sager", () => {
  assert.equal((decide("__platform__", "u_platform", "inq_1042", { decision: "reject", expectedVersion: 1 }, NOW) as { code: string }).code, "forbidden");
  assert.equal(adminOverview("u_lars", NOW).ok, false, "virksomhedsejer får ikke ejerpanel");
});

// ---------- Dobbelthandlinger ----------

test("to enheder godkender samtidig: kun den første vinder, én udsendelse", () => {
  const i = getInquiry("t_hansen", "inq_1039")!;
  const a = decide("t_hansen", "u_lars", i.id, { decision: "approve", expectedVersion: i.version }, NOW);
  const b = decide("t_hansen", "u_mikkel", i.id, { decision: "approve", expectedVersion: i.version }, NOW);
  assert.ok(a.ok);
  assert.equal(!b.ok && b.code, "conflict");
  assert.equal(listOutbox("t_hansen").filter((o) => o.kind === "svar").length, 1);
});

// ---------- Akut og eskalering ----------

test("akut sag er eskaleret til vagthavende og kan kvitteres én gang", () => {
  assert.equal(sofie().escalation?.toName, "Mikkel");
  assert.equal(sofie().emergency?.kind, "vandskade");
  assert.ok(ackEscalation("t_hansen", "u_mikkel", "inq_1042", NOW).ok);
  assert.equal(sofie().escalation?.state, "kvitteret");
  assert.equal(ackEscalation("t_hansen", "u_mikkel", "inq_1042", NOW).ok, false);
});

test("manuel eskalering af almindelig sag gør den akut; dobbelt eskalering afvises", () => {
  assert.ok(escalate("t_hansen", "u_mikkel", "inq_1040", "Kunden er ældre og uden varme", NOW).ok);
  assert.equal(getInquiry("t_hansen", "inq_1040")!.urgency, "akut");
  assert.equal(escalate("t_hansen", "u_mikkel", "inq_1040", "igen", NOW).ok, false);
});

test("Intake: vandskade → akut, eskaleret, sikker vejledning, intet tidspunkt", () => {
  const r = ingest("t_hansen", "u_lars", { name: "Test Kunde", phone: "+45 00 00 00 99", channel: "formular", subject: "Vand i kælderen", message: "Et rør er sprunget og der løber vand ud på gulvet." }, NOW);
  assert.ok(r.ok);
  const i = r.ok ? r.inquiry : null!;
  assert.equal(i.urgency, "akut");
  assert.equal(i.emergency?.kind, "vandskade");
  assert.equal(i.escalation?.state, "afventer_kvittering");
  assert.equal(getInquiryView("t_hansen", i.id, NOW)!.guard?.ok, true);
  assert.doesNotMatch(i.draft!.text, /kl\.\s*\d/);
});

test("Intake: gaslugt giver gas-vejledning; almindelig sag er ikke akut", () => {
  const g = ingest("t_hansen", "u_lars", { name: "Gas", email: "gas@example.test", channel: "mail", subject: "Lugter af gas", message: "Det lugter af gas i køkkenet." }, NOW);
  assert.ok(g.ok && g.inquiry.emergency?.kind === "gaslugt");
  assert.ok(g.ok && /112/.test(g.inquiry.emergency!.guidance));
  const s = ingest("t_hansen", "u_lars", { name: "Normal", email: "n@example.test", channel: "mail", subject: "Utæt hane", message: "Hanen drypper lidt." }, NOW);
  assert.ok(s.ok && s.inquiry.urgency !== "akut");
});

test("Intake: kendt kunde genkendes og dubletter samles", () => {
  const a = ingest("t_hansen", "u_lars", { name: "Sofie K", email: "SOFIE@example.test", channel: "mail", subject: "Ny vandhane", message: "Kan I skifte vandhanen?" }, NOW);
  assert.ok(a.ok && a.inquiry.customerId === "c_sofie" && a.inquiry.knownCustomer);
  const b = ingest("t_hansen", "u_lars", { name: "Sofie K", email: "sofie@example.test", channel: "mail", subject: "Ny vandhane", message: "Igen." }, NOW + 60_000);
  assert.ok(b.ok && b.duplicate && b.inquiry.id === (a.ok && a.inquiry.id));
});

// ---------- Tilbud ----------

test("tilbud: alle syv statusser, automatisk udløb og korrekt pengetrappe", () => {
  const q = listQuotes("t_hansen", NOW);
  const statuses = new Set(q.map((x) => x.status));
  for (const s of ["kladde", "afventer_godkendelse", "sendt", "accepteret", "afvist", "udloebet", "faktureret"]) assert.ok(statuses.has(s as never), `mangler ${s}`);
  assert.equal(q.find((x) => x.id === "q_297")!.status, "udloebet", "sendt for 40 dage siden udløber");
  const t = quoteTotals(q);
  assert.equal(t.potential, 7_400 + 38_500 + 14_900 + 9_800 + 3_200);
  assert.equal(t.acceptedNotInvoiced, 6_200);
  assert.equal(t.invoicedUnpaid, 22_000);
  assert.equal(t.paid, 4_500);
});

test("ejer godkender tilbud → sendt; anden godkendelse giver konflikt", () => {
  const r = decideQuote("t_hansen", "u_lars", "q_312", { decision: "approve", expectedVersion: 1 }, NOW);
  assert.ok(r.ok && r.quote.status === "sendt" && r.quote.sentAt);
  assert.equal(decideQuote("t_hansen", "u_lars", "q_312", { decision: "approve", expectedVersion: 1 }, NOW).ok, false);
  assert.equal(listOutbox("t_hansen").filter((o) => o.kind === "tilbud").length, 1);
});

// ---------- Opfølgning ----------

test("opfølgning: ubesvarede tilbud > 5 dage og manglende svar foreslås, men ikke for nye eller afgjorte", () => {
  const f = listFollowUps("t_hansen", NOW);
  const ids = f.map((x) => x.quoteId ?? x.inquiryId);
  assert.ok(ids.includes("q_311") && ids.includes("q_310"), String(ids));
  assert.ok(!ids.includes("q_308"), "sendt for 2 dage siden – for tidligt");
  assert.ok(!ids.includes("q_299") && !ids.includes("q_305") && !ids.includes("q_297"), "afgjorte/udløbne foreslås ikke");
  assert.ok(ids.includes("inq_1035"), "Karen mangler oplysninger");
  assert.ok(f.every((x) => x.legalBasis.length > 10));
});

test("opfølgning: godkendelse kræver ejer, tæller op og max 2 håndhæves", () => {
  const maja = listFollowUps("t_hansen", NOW).find((x) => x.quoteId === "q_310")!; // har 1 opfølgning i forvejen
  assert.ok(maja.allowed);
  assert.ok(decideFollowUp("t_hansen", "u_lars", maja.id, { decision: "approve", expectedVersion: maja.version }, NOW).ok);
  const q = listQuotes("t_hansen", NOW).find((x) => x.id === "q_310")!;
  assert.equal(q.followUps, 2);
  const again = listFollowUps("t_hansen", NOW + 4 * 86_400_000).find((x) => x.quoteId === "q_310");
  assert.ok(again && !again.allowed, "tredje opfølgning må ikke sendes");
  assert.equal((decideFollowUp("t_hansen", "u_lars", again!.id, { decision: "approve", expectedVersion: again!.version }, NOW + 4 * 86_400_000) as { code: string }).code, "blocked");
});

// ---------- Nødstop ----------

test("nødstop blokerer godkendelser, opfølgning og workers – og kan genoptages", () => {
  assert.equal(setEmergencyStop("u_lars", true, "x").ok, false, "kun superadmin");
  assert.equal(setEmergencyStop("u_platform", true, "").ok, false, "kræver årsag");
  assert.ok(setEmergencyStop("u_platform", true, "Test af nødstop", NOW).ok);
  const i = getInquiry("t_hansen", "inq_1039")!;
  assert.equal((decide("t_hansen", "u_lars", i.id, { decision: "approve", expectedVersion: i.version }, NOW) as { code: string }).code, "stopped");
  assert.equal((regenerateDraft("t_hansen", "u_lars", i.id, i.version, NOW) as { code: string }).code, "stopped");
  assert.ok(workerStatuses("t_nordlys", NOW).every((w) => w.state === "stoppet"));
  assert.ok(listAudit("t_hansen").some((a) => a.action === "emergency_stop"));
  assert.ok(setEmergencyStop("u_platform", false, "", NOW).ok);
  assert.ok(decide("t_hansen", "u_lars", i.id, { decision: "approve", expectedVersion: i.version }, NOW).ok);
});

test("pause af én virksomhed påvirker ikke andre", () => {
  assert.ok(setTenantPaused("u_platform", "t_hansen", true, NOW).ok);
  const i = getInquiry("t_hansen", "inq_1039")!;
  assert.equal((decide("t_hansen", "u_lars", i.id, { decision: "approve", expectedVersion: i.version }, NOW) as { code: string }).code, "stopped");
  assert.ok(regenerateDraft("t_nordlys", "u_mette", "inq_2001", 1, NOW).ok);
});

// ---------- Ejerpanel ----------

test("ejerpanel: korrekt MRR, ingen kundedata", () => {
  const r = adminOverview("u_platform", NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.totals.mrr, 1995 + 995 + 1995);
  assert.equal(r.totals.arr, r.totals.mrr * 12);
  const s = JSON.stringify(r);
  for (const leak of ["Sofie", "Kragh", "Testvej", "toilet", "@example"]) assert.ok(!s.includes(leak), `lækker ${leak}`);
  setTenantPaused("u_platform", "t_aarhusror", true, NOW);
  const r2 = adminOverview("u_platform", NOW);
  assert.ok(r2.ok && r2.totals.mrr === 1995 + 995, "pausede tæller ikke i MRR");
});

// ---------- GDPR ----------

test("anonymisering fjerner personoplysninger i alle kundens sager og logges", () => {
  const r = anonymizeCustomer("t_hansen", "u_lars", "inq_1042", NOW);
  assert.ok(r.ok);
  const i = sofie();
  assert.equal(i.customerName, "Anonymiseret kunde");
  assert.ok(!JSON.stringify(i).includes("Testvej"));
  assert.ok(!JSON.stringify(db().customers.find((c) => c.id === "c_sofie")).includes("sofie@"));
  assert.ok(listAudit("t_hansen").some((a) => a.action === "anonymize"));
});

// ---------- Analytics og push ----------

test("analytics: perioder har samme længde og tal hænger sammen", () => {
  const a = analytics("t_hansen", 30, NOW)!;
  assert.equal(Date.parse(a.window.to) - Date.parse(a.window.curFrom), Date.parse(a.window.curFrom) - Date.parse(a.window.prevFrom));
  assert.ok(a.cur.responded <= a.cur.inquiries);
  assert.ok(a.cur.quotesAccepted <= a.cur.quotesDecided);
  assert.ok(a.recommendations.some((r) => r.id === "fu"), "foreslår opfølgning på ubesvarede tilbud");
  assert.ok(a.recommendations.some((r) => r.id === "esc"), "foreslår kvittering af eskalering");
});

test("push-indhold indeholder aldrig følsomme kundedata", () => {
  const all = JSON.stringify(buildUrgentPushPayload(1));
  for (const secret of ["Sofie", "Kragh", "Testvej", "toilet", "@"]) assert.ok(!all.includes(secret));
});
