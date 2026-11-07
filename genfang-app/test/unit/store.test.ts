import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildUrgentPushPayload, decide, getInquiry, getOverview, listAudit, listInquiries,
  listOutbox, listQuotes, resetDb,
} from "../../src/lib/store.ts";

beforeEach(() => resetDb());

test("virksomheder kan kun se egne henvendelser og tilbud", () => {
  const hansen = listInquiries("t_hansen", "alle").map((i) => i.id);
  assert.ok(hansen.length > 0);
  assert.ok(!hansen.includes("inq_2001"), "Hansen må ikke se Nordlys' sag");
  assert.equal(getInquiry("t_hansen", "inq_2001"), undefined);
  assert.ok(listQuotes("t_hansen").every((q) => q.tenantId === "t_hansen"));
});

test("godkendelse på tværs af virksomheder giver not_found og ændrer intet", () => {
  const r = decide("t_hansen", "u_lars", "inq_2001", { decision: "approve", expectedVersion: 1 });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "not_found");
  assert.equal(getInquiry("t_nordlys", "inq_2001")?.status, "udkast_klar");
});

test("bruger fra én virksomhed kan ikke handle med en anden virksomheds tenant-id", () => {
  const r = decide("t_nordlys", "u_lars", "inq_2001", { decision: "approve", expectedVersion: 1 });
  assert.equal(!r.ok && r.code, "forbidden");
});

test("godkendelse opretter præcis ét blokeret outbox-job og en auditlinje", () => {
  const r = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1 });
  assert.ok(r.ok);
  assert.equal(r.ok && r.inquiry.status, "godkendt");
  assert.equal(r.ok && r.inquiry.version, 2);
  const out = listOutbox("t_hansen");
  assert.equal(out.length, 1);
  assert.equal(out[0].state, "blokeret_testversion");
  assert.equal(listAudit("t_hansen").filter((a) => a.action === "approve").length, 1);
});

test("to enheder godkender samtidig: kun den første vinder", () => {
  const phone = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1 });
  const desktop = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1 });
  assert.ok(phone.ok);
  assert.equal(!desktop.ok && desktop.code, "conflict");
  assert.equal(!desktop.ok && desktop.current?.status, "godkendt");
  assert.equal(listOutbox("t_hansen").length, 1, "ingen dobbelt udsendelse");
});

test("gentaget godkendelse med ny version afvises også (allerede behandlet)", () => {
  decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1 });
  const again = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 2 });
  assert.equal(!again.ok && again.code, "conflict");
  assert.equal(listOutbox("t_hansen").length, 1);
});

test("afvisning efter godkendelse på anden enhed afvises", () => {
  decide("t_hansen", "u_lars", "inq_1041", { decision: "approve", expectedVersion: 1 });
  const r = decide("t_hansen", "u_lars", "inq_1041", { decision: "reject", expectedVersion: 1 });
  assert.equal(!r.ok && r.code, "conflict");
  assert.equal(getInquiry("t_hansen", "inq_1041")?.status, "godkendt");
});

test("redigeret tekst gemmes, tom eller for lang tekst afvises", () => {
  assert.equal((decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1, editedText: " " }) as { code: string }).code, "invalid");
  assert.equal((decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1, editedText: "x".repeat(5001) }) as { code: string }).code, "invalid");
  const r = decide("t_hansen", "u_lars", "inq_1042", { decision: "approve", expectedVersion: 1, editedText: "Hej Sofie, vi kommer kl. 14." });
  assert.ok(r.ok);
  assert.equal(r.ok && r.inquiry.draft?.text, "Hej Sofie, vi kommer kl. 14.");
  assert.equal(r.ok && r.inquiry.draft?.editedBy, "u_lars");
});

test("sager uden udkast kan ikke godkendes", () => {
  const r = decide("t_hansen", "u_lars", "inq_1040", { decision: "approve", expectedVersion: 1 });
  assert.equal(!r.ok && r.code, "conflict");
});

test("oversigten tæller korrekt og sorterer akut først", () => {
  const o = getOverview("t_hansen", "u_lars")!;
  assert.equal(o.counts.pendingApprovals, 2);
  assert.equal(o.counts.newInquiries, 2);
  assert.equal(o.counts.urgent, 1);
  assert.equal(o.pendingApprovals[0].urgency, "akut");
  assert.equal(getOverview("t_hansen", "u_mette"), undefined, "bruger fra anden virksomhed får ingen oversigt");
});

test("push-indhold indeholder aldrig følsomme kundedata", () => {
  const p = buildUrgentPushPayload(1);
  const all = JSON.stringify(p);
  for (const secret of ["Sofie", "Kragh", "Testvej", "toilet", "@"]) assert.ok(!all.includes(secret), `lækker ${secret}`);
  assert.match(buildUrgentPushPayload(3).body, /^3 akutte sager/);
});
