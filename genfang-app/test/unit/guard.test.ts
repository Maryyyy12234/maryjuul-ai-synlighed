import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReply, type GuardContext } from "../../src/lib/guard.ts";
import { localParts, zonedToUtc } from "../../src/lib/time.ts";
import type { CalendarSlot } from "../../src/lib/types.ts";

const TZ = "Europe/Copenhagen";
const HOURS = { 1: { open: "07:00", close: "15:30" }, 2: { open: "07:00", close: "15:30" }, 3: { open: "07:00", close: "15:30" }, 4: { open: "07:00", close: "15:30" }, 5: { open: "07:00", close: "14:00" }, 6: null, 7: null };
const at = (y: number, m: number, d: number, h: number, min = 0) => zonedToUtc(y, m, d, h, min, TZ);
const slot = (id: string, s: number, e: number): CalendarSlot => ({ id, employeeId: "e1", start: new Date(s).toISOString(), end: new Date(e).toISOString(), state: "ledig", source: "testkalender" });

// Torsdag 5. november 2026 kl. 16.42 dansk tid – samme situation som i skærmbilledet.
const THU_1642 = at(2026, 11, 5, 16, 42);
const SLOTS = [slot("s1", at(2026, 11, 6, 8), at(2026, 11, 6, 10)), slot("s2", at(2026, 11, 9, 12), at(2026, 11, 9, 14))];
const PRICES = [{ id: "p1", label: "Montering af medbragt køkkenarmatur", amountDkk: 1450, unit: "fast" as const }];
const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({ nowMs: THU_1642, tz: TZ, openingHours: HOURS, slots: SLOTS, priceList: PRICES, ...over });
const codes = (r: ReturnType<typeof checkReply>) => r.issues.map((i) => i.code);

const SOFIE = "Hej Sofie\n\nTak for din besked – godt, at I har lukket for vandet. Vi kan være hos jer i dag mellem kl. 14 og 16. Læg gerne et håndklæde omkring toilettet indtil da.\n\nVenlig hilsen\nLars, Hansen VVS";

test("REGRESSION: henvendelse kl. 16.42 får aldrig godkendt et besøg samme dag kl. 14–16", () => {
  assert.equal(localParts(THU_1642, TZ).h, 16);
  assert.equal(localParts(THU_1642, TZ).min, 42);
  const r = checkReply(SOFIE, ctx());
  assert.equal(r.ok, false, "skal blokeres");
  assert.ok(codes(r).includes("tid_i_fortiden"), `forventede tid_i_fortiden, fik ${codes(r)}`);
});

test("REGRESSION: alle skrivemåder af 14–16 samme dag blokeres kl. 16.42", () => {
  for (const t of [
    "Vi kommer i dag kl. 14-16.",
    "Vi kommer i dag kl. 14–16.",
    "Vi kommer i dag fra kl. 14 til 16.",
    "Vi kommer i dag kl. 14.00-16.00.",
    "Vi kan være der i eftermiddag mellem 14 og 16.",
    "Vi kommer i dag kl. 14",
  ]) {
    const r = checkReply(t, ctx());
    assert.equal(r.ok, false, `ikke blokeret: ${t}`);
    assert.ok(codes(r).includes("tid_i_fortiden"), `${t} → ${codes(r)}`);
  }
});

test("REGRESSION: samme udkast godkendt næste morgen er stadig blokeret (ikke i kalenderen)", () => {
  const r = checkReply(SOFIE, ctx({ nowMs: at(2026, 11, 6, 7, 5) }));
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes("tid_ikke_i_kalender"), String(codes(r)));
});

test("en bekræftet ledig tid i kalenderen godkendes", () => {
  const r = checkReply("Vi kan komme i morgen mellem kl. 8 og 10. Passer det?", ctx());
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
});

test("opfundet tid (ikke i kalenderen) blokeres", () => {
  assert.ok(codes(checkReply("Vi kan komme i morgen kl. 10-12.", ctx())).includes("tid_ikke_i_kalender"));
});

test("tid uden for åbningstid blokeres", () => {
  const c = codes(checkReply("Vi kommer i morgen kl. 18-20.", ctx()));
  assert.ok(c.includes("uden_for_aabningstid"));
});

test("weekend uden åbningstid blokeres", () => {
  assert.ok(codes(checkReply("Vi kommer lørdag kl. 9-11.", ctx())).includes("uden_for_aabningstid"));
});

test("weekday-navn peger frem i tiden og matches mod kalenderen", () => {
  assert.equal(checkReply("Vi kan komme mandag kl. 12-14.", ctx()).ok, true);
  assert.equal(checkReply("Vi kan komme mandag kl. 8-10.", ctx()).ok, false);
});

test("dag uden tidsrum og tid uden dag blokeres", () => {
  assert.ok(codes(checkReply("Vi kommer forbi i morgen.", ctx())).includes("uklar_tid"));
  assert.ok(codes(checkReply("Vi kan komme kl. 8-10.", ctx())).includes("uklar_tid"));
});

test("ankomstløfter blokeres", () => {
  assert.ok(codes(checkReply("Vi kommer inden for en time.", ctx())).includes("ankomstloefte"));
  assert.ok(codes(checkReply("Vi er der om 30 minutter.", ctx())).includes("ankomstloefte"));
});

test("pris skal stå i prislisten", () => {
  assert.equal(checkReply("Montering koster 1.450 kr. inkl. moms.", ctx()).ok, true);
  assert.ok(codes(checkReply("Montering koster 1.500 kr. inkl. moms.", ctx())).includes("pris_uden_grundlag"));
  assert.ok(codes(checkReply("Det bliver ca. 900,- kr.", ctx())).includes("pris_uden_grundlag"));
  assert.equal(checkReply("Tilbuddet lyder på 14.900 kr.", ctx({ approvedAmounts: [14900] })).ok, true);
});

test("telefonnumre og datoer i tekst forveksles ikke med priser eller tider", () => {
  assert.equal(checkReply("Ring på 00 00 00 00, hvis det bliver værre.", ctx()).ok, true);
  assert.equal(checkReply("Tak for din henvendelse i dag.", ctx()).ok, true);
});

test("akut sag: besøgsløfte uden vagthavende blokeres, henvisning til vagten er ok", () => {
  assert.ok(codes(checkReply("Vi kommer hurtigst muligt.", ctx({ emergency: true }))).includes("akut_loefte"));
  assert.equal(checkReply("Vores vagthavende ringer dig op hurtigst muligt.", ctx({ emergency: true })).ok, true);
});

test("tidszone: sommertid og vintertid håndteres", () => {
  assert.equal(new Date(at(2026, 7, 1, 12)).toISOString(), "2026-07-01T10:00:00.000Z");
  assert.equal(new Date(at(2026, 11, 5, 16, 42)).toISOString(), "2026-11-05T15:42:00.000Z");
});

test("flere tider i samme sætning kontrolleres hver for sig", () => {
  assert.equal(checkReply("Vi har ledige tider i morgen mellem kl. 8 og 10 eller mandag mellem kl. 12 og 14.", ctx()).ok, true);
  const bad = checkReply("Vi har ledige tider i morgen mellem kl. 8 og 10 eller mandag mellem kl. 8 og 10.", ctx());
  assert.ok(codes(bad).includes("tid_ikke_i_kalender"), String(codes(bad)));
  assert.equal(checkReply("Vi kan komme i morgen, mellem kl. 8 og 10.", ctx()).ok, true);
  assert.ok(codes(checkReply("Vi kan komme i morgen kl. 8-10 eller kl. 14-16.", ctx())).includes("tid_ikke_i_kalender"));
});

test("tom tekst blokeres", () => {
  assert.equal(checkReply("  ", ctx()).ok, false);
});
