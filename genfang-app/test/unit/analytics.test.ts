import { test } from "node:test";
import assert from "node:assert/strict";
import { change, extraRevenueEstimate, median, periodStats, ratio, type JourneyCase } from "../../src/lib/workers/analytics.ts";

const T0 = Date.UTC(2026, 9, 1);
const D = 86_400_000;
const c = (day: number, o: Partial<JourneyCase> = {}): JourneyCase => ({ id: `c${day}${Math.random()}`, receivedAt: new Date(T0 + day * D).toISOString(), booked: false, afterHours: false, missingInfo: false, followUps: 0, ...o });

test("procentpoint og relativ ændring beregnes korrekt (32 % → 39 %)", () => {
  const ch = change(0.39, 0.32, true);
  assert.equal(ch.pp, 7);
  assert.ok(Math.abs(ch.rel! - 0.21875) < 1e-9);
});

test("20 % → 26 % er +6 procentpoint og +30 % relativt", () => {
  const ch = change(0.26, 0.2, true);
  assert.equal(ch.pp, 6);
  assert.ok(Math.abs(ch.rel! - 0.3) < 1e-9);
});

test("division med nul giver null – aldrig Infinity eller NaN", () => {
  assert.equal(ratio(3, 0), null);
  assert.deepEqual(change(5, 0, false), { abs: 5, pp: null, rel: null });
  assert.deepEqual(change(null, 0.2, true), { abs: null, pp: null, rel: null });
  const empty = periodStats([], 0, 1);
  assert.equal(empty.responseRate, null);
  assert.equal(empty.acceptRate, null);
  assert.equal(empty.medianResponseMin, null);
});

test("median", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("kohorte: kun henvendelser modtaget i perioden tælles", () => {
  const s = periodStats([c(0), c(5), c(10), c(40)], T0, T0 + 30 * D);
  assert.equal(s.inquiries, 3);
});

test("tilbudsaccept bruger kun afgjorte tilbud; åbne tilbud er ikke i nævneren", () => {
  const cases = [
    c(1, { quote: { amountDkk: 1000, status: "accepteret" } }),
    c(2, { quote: { amountDkk: 1000, status: "afvist" } }),
    c(3, { quote: { amountDkk: 1000, status: "sendt" } }),
    c(4, { quote: { amountDkk: 1000, status: "sendt" } }),
  ];
  const s = periodStats(cases, T0, T0 + 30 * D);
  assert.equal(s.acceptRate, 0.5);
  assert.equal(s.quotesOpen, 2);
});

test("betalt omsætning tælles efter betalingsdato, ikke efter hvornår henvendelsen kom", () => {
  const paidIn = new Date(T0 + 35 * D).toISOString();
  const old = c(-20, { quote: { amountDkk: 7000, status: "faktureret", paidAt: paidIn } }); // henvendelse før perioden, betalt i perioden
  const s = periodStats([old], T0 + 30 * D, T0 + 60 * D);
  assert.equal(s.inquiries, 0);
  assert.equal(s.revenuePaid, 7000);
});

test("kun betalte fakturaer er realiseret omsætning", () => {
  const s = periodStats([
    c(1, { quote: { amountDkk: 4500, status: "faktureret", paidAt: new Date(T0 + 20 * D).toISOString() } }),
    c(2, { quote: { amountDkk: 2000, status: "faktureret" } }),
    c(3, { quote: { amountDkk: 3000, status: "accepteret" } }),
    c(4, { quote: { amountDkk: 9000, status: "sendt" } }),
  ], T0, T0 + 30 * D);
  assert.equal(s.revenuePaid, 4500);
  assert.equal(s.revenueInvoicedUnpaid, 2000);
  assert.equal(s.revenueAcceptedNotInvoiced, 3000);
  assert.equal(s.revenuePotential, 9000);
});

test("svartid og svarprocent", () => {
  const r = (min: number) => new Date(T0 + D + min * 60_000).toISOString();
  const s = periodStats([c(1, { firstResponseAt: r(4) }), c(1, { firstResponseAt: r(10) }), c(1)], T0, T0 + 30 * D);
  assert.equal(s.medianResponseMin, 7);
  assert.ok(Math.abs(s.responseRate! - 2 / 3) < 1e-9);
});

test("estimat af ekstra omsætning nægter at regne på for lille datagrundlag", () => {
  const small = periodStats([c(1, { booked: true })], T0, T0 + 30 * D);
  const e = extraRevenueEstimate(small, small);
  assert.equal(e.value, null);
  assert.equal(e.provenance, "estimat");
  assert.match(e.caveat, /ikke/);
});
