import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, stepAt, verifyTotp } from "../../src/lib/totp.ts";
import { signSession, verifySession } from "../../src/lib/session.ts";
import {
  adminOverview, checkMfaCode, confirmMfa, db, disableMfa, getInquiry, getOverview, improveDraftWithAi, ingestSystem,
  listAudit, listFollowUps, mfaEnabled, regenerateDraft, resetDb, setEmergencyStop, setWorkerPaused, startMfa,
  superadminNeedsMfaSetup, workerStatuses,
} from "../../src/lib/store.ts";
import { zonedToUtc } from "../../src/lib/time.ts";

const NOW = zonedToUtc(2026, 11, 5, 16, 54, "Europe/Copenhagen");
beforeEach(() => { resetDb(NOW); delete process.env.OWNER_MFA_OPTIONAL; });
// NB: node --test kører hver fil i sin egen proces, så env-ændringer lækker ikke mellem filer.
const codeFor = (b32: string, ms: number) => hotp(base32Decode(b32), stepAt(ms));

// ---------------- TOTP mod standarden

test("RFC 4226/6238 testværdier (SHA1, nøgle 12345678901234567890)", () => {
  const key = Buffer.from("12345678901234567890");
  assert.deepEqual([0, 1, 2, 9].map((c) => hotp(key, c)), ["755224", "287082", "359152", "520489"]);
  assert.equal(hotp(key, Math.floor(59 / 30), 8), "94287082");
  assert.equal(hotp(key, Math.floor(1111111109 / 30), 8), "07081804");
});

test("base32 frem og tilbage, og krypteret nøgle kan kun læses med den rigtige nøgle", () => {
  const raw = Buffer.from("hemmelig-mfa-noegle!");
  assert.deepEqual(base32Decode(base32Encode(raw)), raw);
  const enc = encryptSecret("JBSWY3DPEHPK3PXP", "nøgle-a");
  assert.equal(decryptSecret(enc, "nøgle-a"), "JBSWY3DPEHPK3PXP");
  assert.throws(() => decryptSecret(enc, "nøgle-b"));
  assert.ok(!enc.includes("JBSWY3DPEHPK3PXP"));
});

test("TOTP: ±30 sek. tolereres, ældre koder og genbrug afvises", () => {
  const s = "JBSWY3DPEHPK3PXP";
  assert.equal(verifyTotp(s, codeFor(s, NOW), NOW), stepAt(NOW));
  assert.ok(verifyTotp(s, codeFor(s, NOW - 30_000), NOW) !== null);
  assert.equal(verifyTotp(s, codeFor(s, NOW - 120_000), NOW), null);
  assert.equal(verifyTotp(s, codeFor(s, NOW), NOW, stepAt(NOW)), null, "genbrug");
  assert.equal(verifyTotp(s, "12345", NOW), null);
});

// ---------------- MFA-flow

test("MFA: opsætning kræver en korrekt kode; nøglen gemmes kun krypteret; samme kode virker ikke to gange", () => {
  const s = startMfa("t_hansen", "u_lars");
  assert.ok(s.ok);
  if (!s.ok) return;
  assert.match(s.uri, /^otpauth:\/\/totp\/GENFANG/);
  assert.equal(confirmMfa("t_hansen", "u_lars", "000000", NOW).ok, false);
  assert.equal(mfaEnabled("t_hansen", "u_lars"), false);
  assert.ok(confirmMfa("t_hansen", "u_lars", codeFor(s.secret, NOW), NOW).ok);
  assert.equal(mfaEnabled("t_hansen", "u_lars"), true);
  assert.ok(!JSON.stringify(db().users).includes(s.secret), "nøglen må ikke ligge i klartekst");
  assert.equal(checkMfaCode("t_hansen", "u_lars", codeFor(s.secret, NOW), NOW), false, "koden fra opsætningen kan ikke genbruges");
  assert.equal(checkMfaCode("t_hansen", "u_lars", codeFor(s.secret, NOW + 30_000), NOW + 30_000), true);
  assert.equal(checkMfaCode("t_hansen", "u_lars", codeFor(s.secret, NOW + 30_000), NOW + 30_000), false, "replay");
  assert.ok(listAudit("t_hansen").some((a) => a.action === "mfa_enabled"));
  assert.ok(listAudit("t_hansen").some((a) => a.action === "mfa_failed"));
  assert.ok(disableMfa("t_hansen", "u_lars", codeFor(s.secret, NOW + 60_000), NOW + 60_000).ok);
});

test("MFA-billet kan ikke bruges som session", async () => {
  const ticket = await signSession({ uid: "u_lars", tid: "t_hansen", role: "owner" }, { secret: "x".repeat(40) + "::mfa-ticket", ttl: 300 });
  assert.equal(await verifySession(ticket, { secret: "x".repeat(40) }), null);
});

test("platformens ejer skal have MFA, før ejerpanelet virker – og kan ikke slå det fra", () => {
  assert.equal(superadminNeedsMfaSetup("u_platform"), true);
  assert.equal(adminOverview("u_platform", NOW).ok, false);
  assert.equal(setEmergencyStop("u_platform", true, "x", NOW).ok, false);
  const s = startMfa("__platform__", "u_platform");
  assert.ok(s.ok && confirmMfa("__platform__", "u_platform", codeFor(s.secret, NOW), NOW).ok);
  assert.equal(superadminNeedsMfaSetup("u_platform"), false);
  assert.ok(adminOverview("u_platform", NOW).ok);
  assert.equal(s.ok && disableMfa("__platform__", "u_platform", codeFor(s.secret, NOW + 30_000), NOW + 30_000).ok, false);
});

// ---------------- Stop af workers

test("kun ejeren kan sætte en worker på pause, og det logges", () => {
  assert.equal(setWorkerPaused("t_hansen", "u_mikkel", "worker-02", true, NOW).ok, false);
  assert.ok(setWorkerPaused("t_hansen", "u_lars", "worker-02", true, NOW).ok);
  assert.equal(workerStatuses("t_hansen", NOW).find((w) => w.id === "worker-02")!.state, "pause");
  assert.ok(listAudit("t_hansen").some((a) => a.action === "worker_pause"));
  assert.equal(workerStatuses("t_nordlys", NOW).find((w) => w.id === "worker-02")!.state, "aktiv", "påvirker ikke andre");
});

test("Responder på pause: ingen nye udkast, intet Claude-kald – men henvendelsen gemmes", async () => {
  setWorkerPaused("t_hansen", "u_lars", "worker-02", true, NOW);
  const i = getInquiry("t_hansen", "inq_1039")!;
  assert.equal((regenerateDraft("t_hansen", "u_lars", i.id, i.version, NOW) as { code: string }).code, "stopped");
  let called = false;
  assert.equal(await improveDraftWithAi("t_hansen", "inq_1041", async () => { called = true; throw new Error(); }, NOW), "slaaet_fra");
  assert.equal(called, false);
  const r = ingestSystem("t_hansen", { name: "Ny", email: "ny@firma.dk", channel: "mail", subject: "Hane", message: "Hanen drypper." }, NOW);
  assert.ok(r.ok && r.inquiry.status === "ny" && !r.inquiry.draft);
});

test("NØDSTOP mister aldrig en henvendelse: mailen gemmes, men intet automatisk sker", () => {
  setWorkerPaused("t_hansen", "u_lars", "worker-01", false, NOW);
  db().platform.emergencyStop = true;
  const r = ingestSystem("t_hansen", { name: "Akut", email: "akut@firma.dk", channel: "mail", subject: "Vand på gulvet", message: "Der løber vand ud på gulvet." }, NOW);
  assert.ok(r.ok, "henvendelsen skal gemmes");
  assert.ok(r.ok && r.inquiry.emergency, "akut-genkendelse er et sikkerhedsnet og kører altid");
  assert.ok(r.ok && !r.inquiry.escalation && !r.inquiry.draft, "ingen automatik under nødstop");
});

test("Follow-up og Analytics på pause", () => {
  assert.ok(listFollowUps("t_hansen", NOW).length > 0);
  setWorkerPaused("t_hansen", "u_lars", "worker-03", true, NOW);
  assert.equal(listFollowUps("t_hansen", NOW).length, 0);
  setWorkerPaused("t_hansen", "u_lars", "worker-04", true, NOW);
  assert.equal(getOverview("t_hansen", "u_lars", NOW)!.analytics, undefined);
  setWorkerPaused("t_hansen", "u_lars", "worker-03", false, NOW);
  assert.ok(listFollowUps("t_hansen", NOW).length > 0, "genstart virker");
});
