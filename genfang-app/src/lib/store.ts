// GENFANG domænelag (testversion med syntetiske data i hukommelsen).
//
// Siderne og API-ruterne kalder KUN funktionerne her. Når den rigtige backend (Postgres/Supabase
// + baggrundsjobs) kobles på, udskiftes implementeringen – kontrakten bevares.
//
// Fælles regler i alle skrivefunktioner:
//  1. tenantId skal matche (ellers "not_found" – lækker ikke, at noget eksisterer).
//  2. Rolle tjekkes via permissions.ts.
//  3. Platformens nødstop og virksomhedens pause blokerer alle udgående handlinger og workers.
//  4. Optimistisk lås (version) forhindrer dobbelt-handlinger fra flere enheder.
//  5. Udgående beskeder passerer sikkerhedslaget og lægges i en outbox, som er BLOKERET i testversionen.
//  6. Alt skrives i auditloggen.

import type {
  AuditEntry, CalendarSlot, FollowUpSuggestion, GuardResult, Inquiry, InquirySummary, OutboxJob, Quote, QuoteStatus,
  Role, Tenant, TenantId, User, UserId, WorkerId, WorkerRun, WorkerStatus,
} from "./types.ts";
import { checkReply } from "./guard.ts";
import { can, type Permission } from "./permissions.ts";
import { seed, type Db } from "./seed.ts";
import { classify, normEmail, normPhone } from "./workers/intake.ts";
import { describeSlot, pickSlots, writeDraft } from "./workers/responder.ts";
import { aiDraft, aiEnabled, priceLine, type AiCall } from "./workers/claude-responder.ts";
import { quoteExpiresAt, suggestFollowUps } from "./workers/followup.ts";
import { WORKERS } from "./workers/defs.ts";
import {
  change, extraRevenueEstimate, MINUTES_SAVED, periodStats, ratio, recommend, type JourneyCase, type PeriodStats,
} from "./workers/analytics.ts";
import { nowMs } from "./clock.ts";

const g = globalThis as unknown as { __genfangDb?: Db };

function init(now: number): Db {
  const d = seed(now);
  // Responder skriver udkast til sager, der mangler et (deterministisk, ingen modelkald).
  for (const i of d.inquiries) {
    if (i.status === "udkast_klar" && !i.draft) {
      const t = d.tenants.find((x) => x.id === i.tenantId)!;
      i.draft = writeDraft(i, t, d.slots.filter((s) => s.employeeId && t.employees.some((e) => e.id === s.employeeId)), now);
    }
  }
  return d;
}

export function db(): Db {
  if (!g.__genfangDb) g.__genfangDb = init(nowMs());
  return g.__genfangDb;
}

/** Indsæt tilstand indlæst fra Postgres (ved serverstart). */
export function hydrate(d: Db) {
  g.__genfangDb = d;
}

/** Tests og "Nulstil testdata" i ejerpanelet. */
export function resetDb(now?: number) {
  g.__genfangDb = init(now ?? nowMs());
}

const iso = (ms: number) => new Date(ms).toISOString();
const clone = <T>(x: T): T => structuredClone(x);
const nextId = (prefix: string) => `${prefix}_${++db().seq}`;

// ---------------------------------------------------------------- opslag

export function getTenant(tenantId: TenantId): Tenant | undefined {
  return db().tenants.find((t) => t.id === tenantId);
}
export function findUserByEmail(email: string): User | undefined {
  return db().users.find((u) => u.email === email.trim().toLowerCase());
}
export function getUser(tenantId: TenantId, userId: UserId): User | undefined {
  return db().users.find((u) => u.id === userId && u.tenantId === tenantId);
}
function tenantSlots(t: Tenant): CalendarSlot[] {
  const ids = new Set(t.employees.map((e) => e.id));
  return db().slots.filter((s) => ids.has(s.employeeId));
}

export type Fail = { ok: false; code: "not_found" | "conflict" | "invalid" | "forbidden" | "blocked" | "stopped"; message: string; current?: unknown; guard?: GuardResult };
const fail = (code: Fail["code"], message: string, extra: Partial<Fail> = {}): Fail => ({ ok: false, code, message, ...extra });

/** Fælles adgangskontrol til alle skrivehandlinger. */
function actor(tenantId: TenantId, userId: UserId, p: Permission): { user: User; tenant: Tenant } | Fail {
  const user = getUser(tenantId, userId);
  const tenant = getTenant(tenantId);
  if (!user || !tenant) return fail("forbidden", "Ukendt bruger.");
  if (!can(user.role, p)) return fail("forbidden", "Din rolle har ikke adgang til denne handling.");
  return { user, tenant };
}

export function automationStopped(tenantId: TenantId): string | null {
  const p = db().platform;
  if (p.emergencyStop) return "GENFANG har aktiveret nødstop. Ingen udsendelser eller workers kører.";
  if (getTenant(tenantId)?.paused) return "Automatik er sat på pause for jeres virksomhed.";
  return null;
}

export function audit(entry: AuditEntry) {
  const log = db().audit;
  log.push(entry);
  if (log.length > 5000) log.splice(0, log.length - 5000);
}
export function listAudit(tenantId: TenantId): AuditEntry[] {
  return db().audit.filter((a) => a.tenantId === tenantId).slice().reverse();
}
export function listOutbox(tenantId: TenantId): OutboxJob[] {
  return db().outbox.filter((o) => o.tenantId === tenantId);
}
function enqueue(tenantId: TenantId, kind: OutboxJob["kind"], ref: string, at: number) {
  const key = `${kind}:${ref}`;
  if (db().outbox.some((o) => o.tenantId === tenantId && `${o.kind}:${o.ref}` === key)) return; // idempotent
  // Eskaleringer går til vagten via SMS/opkald, som ikke er sat op – de afsendes aldrig automatisk.
  const state = kind !== "eskalering" && deliveryEnabled() ? "klar" : "blokeret_testversion";
  db().outbox.push({ id: nextId("out"), tenantId, kind, ref, createdAt: iso(at), state });
}
/** Udsendelse kræver ALLE tre: GENFANG_DELIVERY=on, RESEND_API_KEY og GENFANG_FROM_EMAIL. */
export function deliveryEnabled(): boolean {
  return process.env.GENFANG_DELIVERY === "on" && !!process.env.RESEND_API_KEY && !!process.env.GENFANG_FROM_EMAIL && !db().platform.emergencyStop;
}

function logRun(tenantId: TenantId, worker: WorkerId, status: WorkerRun["status"], summary: string, at: number, error?: string) {
  db().workerRuns.push({ id: nextId("run"), tenantId, worker, at: iso(at), status, summary, error, aiTokens: 0 });
}

// ---------------------------------------------------------------- sikkerhedslag

export function guardFor(tenant: Tenant, inquiry: Pick<Inquiry, "customerId" | "emergency">, text: string, at = nowMs()): GuardResult {
  const approvedAmounts = db().quotes
    .filter((q) => q.tenantId === tenant.id && q.customerId === inquiry.customerId && ["sendt", "accepteret", "faktureret"].includes(q.status))
    .map((q) => q.amountDkk);
  return checkReply(text, {
    nowMs: at, tz: tenant.timezone, openingHours: tenant.openingHours, slots: tenantSlots(tenant),
    priceList: tenant.priceList, approvedAmounts, emergency: !!inquiry.emergency,
  });
}

// ---------------------------------------------------------------- henvendelser

const URG = { akut: 0, normal: 1, lav: 2 } as const;
const byPriority = (a: Inquiry, b: Inquiry) => URG[a.urgency] - URG[b.urgency] || b.receivedAt.localeCompare(a.receivedAt);

function summary(i: Inquiry, t: Tenant, at: number): InquirySummary {
  return {
    id: i.id, customerName: i.customerName, subject: i.subject, receivedAt: i.receivedAt, category: i.category,
    urgency: i.urgency, status: i.status, channel: i.channel, escalated: !!i.escalation, emergencyKind: i.emergency?.kind,
    guardOk: i.status === "udkast_klar" && i.draft ? guardFor(t, i, i.draft.text, at).ok : undefined,
  };
}

export function listInquiries(tenantId: TenantId, filter: "aabne" | "alle" = "alle", at = nowMs()): InquirySummary[] {
  const t = getTenant(tenantId);
  if (!t) return [];
  return db().inquiries
    .filter((i) => i.tenantId === tenantId)
    .filter((i) => filter !== "aabne" || i.status === "ny" || i.status === "udkast_klar")
    .sort(byPriority)
    .map((i) => summary(i, t, at));
}

export function getInquiry(tenantId: TenantId, id: string): Inquiry | undefined {
  const i = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  return i ? clone(i) : undefined;
}

export interface InquiryView {
  inquiry: Inquiry;
  guard: GuardResult | null;
  stopped: string | null;
  onCall?: { name: string; phone: string };
  basisSlots: { id: string; label: string }[];
  basisPrices: { id: string; label: string; amountDkk: number }[];
  previousCases: number;
}

export function getInquiryView(tenantId: TenantId, id: string, at = nowMs()): InquiryView | undefined {
  const t = getTenant(tenantId);
  const i = getInquiry(tenantId, id);
  if (!t || !i) return undefined;
  const slots = tenantSlots(t);
  const onCall = t.employees.find((e) => e.onCall);
  return {
    inquiry: i,
    guard: i.status === "udkast_klar" && i.draft ? guardFor(t, i, i.draft.text, at) : null,
    stopped: automationStopped(tenantId),
    onCall: onCall ? { name: onCall.name, phone: onCall.phone } : undefined,
    basisSlots: (i.draft?.basis?.slotIds ?? []).map((sid) => slots.find((s) => s.id === sid)).filter(Boolean).map((s) => ({ id: s!.id, label: `${s!.start}|${s!.end}` })),
    basisPrices: (i.draft?.basis?.priceIds ?? []).map((pid) => t.priceList.find((p) => p.id === pid)).filter(Boolean).map((p) => ({ id: p!.id, label: p!.label, amountDkk: p!.amountDkk })),
    previousCases: db().inquiries.filter((x) => x.tenantId === tenantId && x.customerId === i.customerId && x.id !== i.id).length,
  };
}

export type Ok<T> = { ok: true } & T;

/**
 * Godkend eller afvis et svarudkast.
 * Godkendelse kræver: rolle, intet nødstop, korrekt version, status "udkast_klar" og at
 * sikkerhedslaget godkender den ENDELIGE tekst i godkendelsesøjeblikket.
 */
export function decide(
  tenantId: TenantId, userId: UserId, id: string,
  input: { decision: "approve" | "reject"; expectedVersion: number; editedText?: string },
  at = nowMs(),
): Ok<{ inquiry: Inquiry }> | Fail {
  const a = actor(tenantId, userId, "approve_reply");
  if ("ok" in a) return a;
  if (!Number.isInteger(input.expectedVersion)) return fail("invalid", "Version mangler.");
  if (input.editedText !== undefined) {
    if (typeof input.editedText !== "string" || input.editedText.trim().length < 2) return fail("invalid", "Svaret er tomt.");
    if (input.editedText.length > 5000) return fail("invalid", "Svaret er for langt.");
  }
  const row = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!row) return fail("not_found", "Sagen findes ikke.");
  if (row.status !== "udkast_klar" || !row.draft) return fail("conflict", "Sagen er allerede behandlet.", { current: clone(row) });
  if (row.version !== input.expectedVersion) return fail("conflict", "Sagen er ændret på en anden enhed.", { current: clone(row) });

  if (input.decision === "approve") {
    const stop = automationStopped(tenantId);
    if (stop) return fail("stopped", stop);
    const finalText = input.editedText ?? row.draft.text;
    const guard = guardFor(a.tenant, row, finalText, at);
    if (!guard.ok) {
      audit({ at: iso(at), tenantId, userId, action: "guard_block", target: row.id, detail: guard.issues.map((x) => x.code).join(",") });
      return fail("blocked", "Sikkerhedskontrollen stoppede godkendelsen. Ret svaret først.", { guard });
    }
    if (finalText !== row.draft.text) row.draft = { ...row.draft, text: finalText, editedBy: userId };
    row.firstResponseAt ??= iso(at);
    enqueue(tenantId, "svar", row.id, at);
  }
  row.status = input.decision === "approve" ? "godkendt" : "afvist";
  row.version += 1;
  row.decidedBy = userId;
  row.decidedAt = iso(at);
  audit({ at: iso(at), tenantId, userId, action: input.decision, target: row.id, detail: `version ${row.version}` });
  return { ok: true, inquiry: clone(row) };
}

/** Responder skriver et nyt, sikkert udkast ud fra kalender og prisliste. */
export function regenerateDraft(tenantId: TenantId, userId: UserId, id: string, expectedVersion: number, at = nowMs()): Ok<{ inquiry: Inquiry; guard: GuardResult }> | Fail {
  const a = actor(tenantId, userId, "regenerate_draft");
  if ("ok" in a) return a;
  const stop = automationStopped(tenantId);
  if (stop) return fail("stopped", stop);
  const row = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!row) return fail("not_found", "Sagen findes ikke.");
  if (row.status !== "udkast_klar" && row.status !== "ny") return fail("conflict", "Sagen er allerede behandlet.", { current: clone(row) });
  if (row.version !== expectedVersion) return fail("conflict", "Sagen er ændret på en anden enhed.", { current: clone(row) });
  row.draft = writeDraft(row, a.tenant, tenantSlots(a.tenant), at);
  row.status = "udkast_klar";
  row.version += 1;
  const guard = guardFor(a.tenant, row, row.draft.text, at);
  logRun(tenantId, "worker-02", guard.ok ? "ok" : "blokeret", guard.ok ? `Nyt udkast til ${row.id} skrevet ud fra kalender og prisliste.` : `Udkast til ${row.id} blokeret af sikkerhedslaget.`, at);
  audit({ at: iso(at), tenantId, userId, action: "regenerate", target: row.id });
  return { ok: true, inquiry: clone(row), guard };
}

/**
 * Lader Claude forbedre et skabelon-udkast. Erstatter KUN udkastet, hvis:
 * AI er slået til, intet nødstop, sagen er uændret imens, og sikkerhedslaget godkender teksten.
 * Ellers beholdes skabelonen, og hændelsen logges.
 */
export async function improveDraftWithAi(tenantId: TenantId, id: string, call?: AiCall, at = nowMs()): Promise<"ai" | "skabelon" | "slaaet_fra"> {
  if (!aiEnabled() && !call) return "slaaet_fra";
  if (automationStopped(tenantId)) return "slaaet_fra";
  const t = getTenant(tenantId);
  const row = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!t || !row || row.status !== "udkast_klar") return "slaaet_fra";
  const version = row.version;
  const slots = row.emergency || row.category === "tilbud" ? [] : pickSlots(t, tenantSlots(t), at, 3);
  const r = await aiDraft({
    inquiry: row, tenantName: t.name.replace(/\s*\(testdata\)/, ""), signer: signer(t),
    onCallName: t.employees.find((e) => e.onCall)?.name,
    slotPhrases: slots.map((s) => ({ id: s.id, phrase: describeSlot(s, at, t.timezone) })),
    prices: t.priceList.map((p) => ({ id: p.id, line: priceLine(p) })),
  }, at, call);
  const now2 = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!now2 || now2.version !== version || now2.status !== "udkast_klar") return "skabelon"; // ændret imens – rør ikke
  const run = (status: WorkerRun["status"], summary: string, error?: string) =>
    db().workerRuns.push({ id: nextId("run"), tenantId, worker: "worker-02", at: iso(at), status, summary, error, aiTokens: r.tokens });
  if (!r.draft) { run("fejl", `Claude-udkast til ${id} mislykkedes – skabelon beholdt.`, r.reason); return "skabelon"; }
  const guard = guardFor(t, now2, r.draft.text, at);
  if (!guard.ok) { run("blokeret", `Claude-udkast til ${id} afvist af sikkerhedslaget – skabelon beholdt.`, guard.issues.map((i) => i.code).join(", ")); return "skabelon"; }
  now2.draft = r.draft;
  now2.version += 1;
  run("ok", `Claude skrev udkast til ${id} – sikkerhedskontrol bestået.`);
  return "ai";
}

/** Eskalér til vagthavende/ansvarlig medarbejder. Sendes ikke til kunden. */
export function escalate(tenantId: TenantId, userId: UserId, id: string, reason: string, at = nowMs()): Ok<{ inquiry: Inquiry }> | Fail {
  const a = actor(tenantId, userId, "escalate");
  if ("ok" in a) return a;
  const row = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!row) return fail("not_found", "Sagen findes ikke.");
  if (row.escalation?.state === "afventer_kvittering") return fail("conflict", `Allerede eskaleret til ${row.escalation.toName}.`, { current: clone(row) });
  const to = a.tenant.employees.find((e) => e.onCall) ?? a.tenant.employees.find((e) => e.title === "Ejer");
  if (!to) return fail("invalid", "Ingen ansvarlig medarbejder er sat op.");
  const clean = String(reason ?? "").trim().slice(0, 300) || "Eskaleret manuelt";
  row.escalation = { to: to.id, toName: to.name, reason: clean, at: iso(at), by: userId, state: "afventer_kvittering", delivery: "blokeret_testversion" };
  if (row.urgency !== "akut") row.urgency = "akut";
  row.version += 1;
  enqueue(tenantId, "eskalering", `${row.id}@${row.version}`, at);
  audit({ at: iso(at), tenantId, userId, action: "escalate", target: row.id, detail: `til ${to.name}` });
  return { ok: true, inquiry: clone(row) };
}

export function ackEscalation(tenantId: TenantId, userId: UserId, id: string, at = nowMs()): Ok<{ inquiry: Inquiry }> | Fail {
  const a = actor(tenantId, userId, "ack_escalation");
  if ("ok" in a) return a;
  const row = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!row) return fail("not_found", "Sagen findes ikke.");
  if (!row.escalation || row.escalation.state !== "afventer_kvittering") return fail("conflict", "Der er ingen åben eskalering.", { current: clone(row) });
  row.escalation = { ...row.escalation, state: "kvitteret", ackAt: iso(at), ackBy: userId };
  row.version += 1;
  audit({ at: iso(at), tenantId, userId, action: "escalation_ack", target: row.id });
  return { ok: true, inquiry: clone(row) };
}

/** Intake-pipeline: modtag → genkend kunde/dublet → klassificér → eskalér akut → Responder-udkast. */
export type IntakeInput = { name: string; email?: string; phone?: string; address?: string; channel: Inquiry["channel"]; subject: string; message: string };

export function ingest(tenantId: TenantId, userId: UserId, input: IntakeInput, at = nowMs()): Ok<{ inquiry: Inquiry; duplicate: boolean }> | Fail {
  const a = actor(tenantId, userId, "simulate_intake");
  if ("ok" in a) return a;
  return ingestInternal(a.tenant, userId, input, at);
}

/** Indgående mail (signeret webhook) – Worker 01 handler på virksomhedens vegne. */
export function ingestSystem(tenantId: TenantId, input: IntakeInput, at = nowMs()): Ok<{ inquiry: Inquiry; duplicate: boolean }> | Fail {
  const t = getTenant(tenantId);
  if (!t) return fail("not_found", "Ukendt virksomhed.");
  const r = ingestInternal(t, "worker-01", input, at);
  if (r.ok && !r.duplicate) audit({ at: iso(at), tenantId, userId: "worker-01", action: "inbound_email", target: r.inquiry.id });
  return r;
}

function ingestInternal(tenant: Tenant, userId: UserId, input: IntakeInput, at: number): Ok<{ inquiry: Inquiry; duplicate: boolean }> | Fail {
  const tenantId = tenant.id;
  const a = { tenant };
  const stop = automationStopped(tenantId);
  if (stop) return fail("stopped", stop);
  const name = String(input.name ?? "").trim().slice(0, 120);
  const subject = String(input.subject ?? "").trim().slice(0, 160);
  const message = String(input.message ?? "").trim().slice(0, 4000);
  if (!name || !subject || !message) return fail("invalid", "Navn, emne og besked skal udfyldes.");
  if (!["mail", "formular", "telefon"].includes(input.channel)) return fail("invalid", "Ukendt kanal.");

  const email = normEmail(input.email);
  const phone = normPhone(input.phone);
  let customer = db().customers.find((c) => c.tenantId === tenantId && !c.anonymized && ((email && normEmail(c.email) === email) || (phone && normPhone(c.phone) === phone)));
  const known = !!customer;
  if (!customer) {
    customer = { id: nextId("c"), tenantId, name, email, phone, address: input.address, marketingConsent: false };
    db().customers.push(customer);
  }
  const dup = db().inquiries.find((i) => i.tenantId === tenantId && i.customerId === customer!.id && i.subject.toLowerCase() === subject.toLowerCase() && at - Date.parse(i.receivedAt) < 86_400_000);
  if (dup) {
    logRun(tenantId, "worker-01", "ok", `Dublet genkendt – samlet med ${dup.id}.`, at);
    return { ok: true, inquiry: clone(dup), duplicate: true };
  }

  const c = classify({ subject, message, address: input.address ?? customer.address, phone: phone ?? customer.phone, channel: input.channel });
  const row: Inquiry = {
    id: nextId("inq"), tenantId, customerId: customer.id, customerName: customer.name, channel: input.channel, subject, message,
    address: input.address ?? customer.address, receivedAt: iso(at), ...c, knownCustomer: known, status: "ny", version: 1,
  };
  db().inquiries.push(row);
  logRun(tenantId, "worker-01", "ok", `${row.id} sorteret som ${c.category}${known ? " (kendt kunde)" : ""}.`, at);

  if (row.emergency) {
    const to = a.tenant.employees.find((e) => e.onCall) ?? a.tenant.employees[0];
    row.escalation = { to: to.id, toName: to.name, reason: `Mulig ${row.emergency.kind} registreret af Intake`, at: iso(at), by: "worker-01", state: "afventer_kvittering", delivery: "blokeret_testversion" };
    enqueue(tenantId, "eskalering", `${row.id}@1`, at);
    logRun(tenantId, "worker-01", "ok", `Akut sag ${row.id} eskaleret til ${to.name}.`, at);
  }
  row.draft = writeDraft(row, a.tenant, tenantSlots(a.tenant), at);
  row.status = "udkast_klar";
  const guard = guardFor(a.tenant, row, row.draft.text, at);
  logRun(tenantId, "worker-02", guard.ok ? "ok" : "blokeret", guard.ok ? `Udkast til ${row.id} klar til godkendelse.` : `Udkast til ${row.id} blokeret af sikkerhedslaget.`, at);
  if (userId !== "worker-01") audit({ at: iso(at), tenantId, userId, action: "intake_simulated", target: row.id });
  return { ok: true, inquiry: clone(row), duplicate: false };
}

/** GDPR: anonymiser en kundes personoplysninger i alle sager og tilbud. Kan ikke fortrydes. */
export function anonymizeCustomer(tenantId: TenantId, userId: UserId, inquiryId: string, at = nowMs()): Ok<{ affected: number }> | Fail {
  const a = actor(tenantId, userId, "anonymize_customer");
  if ("ok" in a) return a;
  const i = db().inquiries.find((x) => x.id === inquiryId && x.tenantId === tenantId);
  if (!i) return fail("not_found", "Sagen findes ikke.");
  const c = db().customers.find((x) => x.id === i.customerId && x.tenantId === tenantId);
  let affected = 0;
  if (c) Object.assign(c, { name: "Anonymiseret kunde", email: undefined, phone: undefined, address: undefined, anonymized: true });
  for (const x of db().inquiries.filter((y) => y.tenantId === tenantId && y.customerId === i.customerId)) {
    Object.assign(x, { customerName: "Anonymiseret kunde", message: "[Slettet efter anmodning]", address: undefined, subject: "[Slettet]" });
    if (x.draft) x.draft = { ...x.draft, text: "[Slettet efter anmodning]" };
    x.version += 1;
    affected++;
  }
  for (const q of db().quotes.filter((y) => y.tenantId === tenantId && y.customerId === i.customerId)) q.customerName = "Anonymiseret kunde";
  audit({ at: iso(at), tenantId, userId, action: "anonymize", target: i.customerId, detail: `${affected} sager` });
  return { ok: true, affected };
}

// ---------------------------------------------------------------- tilbud

/** Sendte tilbud, der har passeret gyldighedsdatoen, bliver "udløbet". */
function refreshQuotes(tenantId: TenantId, at: number) {
  for (const q of db().quotes) {
    if (q.tenantId === tenantId && q.status === "sendt") {
      const exp = quoteExpiresAt(q);
      if (exp !== null && exp <= at) { q.status = "udloebet"; q.version += 1; }
    }
  }
}

export const POTENTIAL: QuoteStatus[] = ["kladde", "afventer_godkendelse", "sendt"];

export function listQuotes(tenantId: TenantId, at = nowMs()): Quote[] {
  refreshQuotes(tenantId, at);
  const order: Record<QuoteStatus, number> = { afventer_godkendelse: 0, sendt: 1, kladde: 2, accepteret: 3, faktureret: 4, afvist: 5, udloebet: 6 };
  return db().quotes.filter((q) => q.tenantId === tenantId).sort((a, b) => order[a.status] - order[b.status] || (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)).map(clone);
}

export function quoteTotals(quotes: Quote[]) {
  const sum = (f: (q: Quote) => boolean) => quotes.filter(f).reduce((a, q) => a + q.amountDkk, 0);
  return {
    potential: sum((q) => POTENTIAL.includes(q.status)),
    acceptedNotInvoiced: sum((q) => q.status === "accepteret"),
    invoicedUnpaid: sum((q) => q.status === "faktureret" && !q.paidAt),
    paid: sum((q) => !!q.paidAt),
  };
}

export function decideQuote(tenantId: TenantId, userId: UserId, id: string, input: { decision: "approve" | "reject"; expectedVersion: number }, at = nowMs()): Ok<{ quote: Quote }> | Fail {
  const a = actor(tenantId, userId, "approve_quote");
  if ("ok" in a) return a;
  const q = db().quotes.find((x) => x.id === id && x.tenantId === tenantId);
  if (!q) return fail("not_found", "Tilbuddet findes ikke.");
  if (q.status !== "afventer_godkendelse") return fail("conflict", "Tilbuddet afventer ikke godkendelse.", { current: clone(q) });
  if (q.version !== input.expectedVersion) return fail("conflict", "Tilbuddet er ændret på en anden enhed.", { current: clone(q) });
  if (input.decision === "approve") {
    const stop = automationStopped(tenantId);
    if (stop) return fail("stopped", stop);
    q.status = "sendt";
    q.sentAt = iso(at);
    enqueue(tenantId, "tilbud", q.id, at);
  } else q.status = "kladde";
  q.version += 1;
  audit({ at: iso(at), tenantId, userId, action: input.decision === "approve" ? "quote_approve" : "quote_reject", target: q.id });
  return { ok: true, quote: clone(q) };
}

// ---------------------------------------------------------------- opfølgning (Worker 03)

function signer(t: Tenant) {
  const owner = t.employees.find((e) => e.title === "Ejer");
  return `${owner?.name ?? ""}, ${t.name.replace(/\s*\(testdata\)/, "")}`;
}

export function listFollowUps(tenantId: TenantId, at = nowMs()): FollowUpSuggestion[] {
  const t = getTenant(tenantId);
  if (!t) return [];
  refreshQuotes(tenantId, at);
  const fresh = suggestFollowUps(db().quotes.filter((q) => q.tenantId === tenantId), db().inquiries.filter((i) => i.tenantId === tenantId), at, signer(t));
  const store = db().followUps;
  for (const s of fresh) {
    const key = s.quoteId ?? s.inquiryId;
    const existing = store.find((x) => x.tenantId === tenantId && (x.quoteId ?? x.inquiryId) === key && x.state === "forslag");
    if (existing) Object.assign(existing, { reason: s.reason, allowed: s.allowed, legalBasis: s.legalBasis });
    else if (!store.some((x) => x.tenantId === tenantId && (x.quoteId ?? x.inquiryId) === key && x.state !== "forslag" && at - Date.parse(x.createdAt) < 3 * 86_400_000)) {
      store.push({ ...s, id: nextId("fu"), state: "forslag", version: 1 });
    }
  }
  // Forslag, der ikke længere er relevante (fx tilbud accepteret), fjernes.
  const keys = new Set(fresh.map((s) => s.quoteId ?? s.inquiryId));
  return store.filter((x) => x.tenantId === tenantId && x.state === "forslag" && keys.has(x.quoteId ?? x.inquiryId)).map(clone);
}

export function decideFollowUp(tenantId: TenantId, userId: UserId, id: string, input: { decision: "approve" | "reject"; expectedVersion: number }, at = nowMs()): Ok<{ followUp: FollowUpSuggestion }> | Fail {
  const a = actor(tenantId, userId, "approve_followup");
  if ("ok" in a) return a;
  const f = db().followUps.find((x) => x.id === id && x.tenantId === tenantId);
  if (!f) return fail("not_found", "Forslaget findes ikke.");
  if (f.state !== "forslag") return fail("conflict", "Forslaget er allerede behandlet.", { current: clone(f) });
  if (f.version !== input.expectedVersion) return fail("conflict", "Forslaget er ændret.", { current: clone(f) });
  if (input.decision === "approve") {
    if (!f.allowed) return fail("blocked", `Må ikke sendes: ${f.legalBasis}`);
    const stop = automationStopped(tenantId);
    if (stop) return fail("stopped", stop);
    const guard = guardFor(a.tenant, { customerId: f.quoteId ? db().quotes.find((q) => q.id === f.quoteId)?.customerId ?? "" : "", emergency: undefined }, f.draft, at);
    if (!guard.ok) return fail("blocked", "Sikkerhedskontrollen stoppede opfølgningen.", { guard });
    enqueue(tenantId, "opfoelgning", f.id, at);
    const q = f.quoteId ? db().quotes.find((x) => x.id === f.quoteId) : undefined;
    if (q) { q.followUps += 1; q.version += 1; }
    logRun(tenantId, "worker-03", "ok", `Opfølgning ${f.id} godkendt (udsendelse blokeret i testversion).`, at);
  }
  f.state = input.decision === "approve" ? "godkendt" : "afvist";
  f.version += 1;
  audit({ at: iso(at), tenantId, userId, action: input.decision === "approve" ? "followup_approve" : "followup_reject", target: f.id });
  return { ok: true, followUp: clone(f) };
}

// ---------------------------------------------------------------- workers

export function workerStatuses(tenantId: TenantId, at = nowMs()): WorkerStatus[] {
  const stopped = !!automationStopped(tenantId);
  const runs = db().workerRuns.filter((r) => r.tenantId === tenantId);
  return WORKERS.map((w) => {
    const mine = runs.filter((r) => r.worker === w.id).sort((a, b) => b.at.localeCompare(a.at));
    const last = mine[0];
    return {
      ...w,
      state: stopped ? "stoppet" : last?.status === "fejl" ? "fejl" : "aktiv",
      lastRunAt: last?.at,
      lastError: last?.status === "fejl" ? last.error : undefined,
      runs24h: mine.filter((r) => at - Date.parse(r.at) < 86_400_000).length,
    };
  });
}

export function listWorkerRuns(tenantId: TenantId, worker?: WorkerId, limit = 30): WorkerRun[] {
  return db().workerRuns.filter((r) => r.tenantId === tenantId && (!worker || r.worker === worker)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(clone);
}

// ---------------------------------------------------------------- analytics (Worker 04)

export interface AnalyticsView {
  window: { days: number; curFrom: string; prevFrom: string; to: string };
  cur: PeriodStats;
  prev: PeriodStats;
  changes: Record<"responseRate" | "bookingRate" | "acceptRate" | "medianResponseMin" | "inquiries" | "revenuePaid", ReturnType<typeof change>>;
  estimate: ReturnType<typeof extraRevenueEstimate>;
  recommendations: ReturnType<typeof recommend>;
  live: { unansweredQuotes: number; unansweredValue: number; pendingEscalations: number; missingInfoShare: number | null };
  assumptions: string[];
  provenanceNote: string;
}

export function analytics(tenantId: TenantId, days = 30, at = nowMs()): AnalyticsView | undefined {
  const t = getTenant(tenantId);
  if (!t) return undefined;
  const cases: JourneyCase[] = db().history[tenantId] ?? [];
  const DAY = 86_400_000;
  const cur = periodStats(cases, at - days * DAY, at);
  const prev = periodStats(cases, at - 2 * days * DAY, at - days * DAY);
  const fu = listFollowUps(tenantId, at).filter((f) => f.kind === "tilbud_ubesvaret");
  const quotes = db().quotes.filter((q) => q.tenantId === tenantId);
  const open = db().inquiries.filter((i) => i.tenantId === tenantId && (i.status === "ny" || i.status === "udkast_klar"));
  const live = {
    unansweredQuotes: fu.length,
    unansweredValue: fu.reduce((a, f) => a + (quotes.find((q) => q.id === f.quoteId)?.amountDkk ?? 0), 0),
    pendingEscalations: db().inquiries.filter((i) => i.tenantId === tenantId && i.escalation?.state === "afventer_kvittering").length,
    missingInfoShare: ratio(open.filter((i) => i.missingInfo.length > 0).length, open.length),
  };
  return {
    window: { days, curFrom: iso(at - days * DAY), prevFrom: iso(at - 2 * days * DAY), to: iso(at) },
    cur, prev,
    changes: {
      responseRate: change(cur.responseRate, prev.responseRate, true),
      bookingRate: change(cur.bookingRate, prev.bookingRate, true),
      acceptRate: change(cur.acceptRate, prev.acceptRate, true),
      medianResponseMin: change(cur.medianResponseMin, prev.medianResponseMin, false),
      inquiries: change(cur.inquiries, prev.inquiries, false),
      revenuePaid: change(cur.revenuePaid, prev.revenuePaid, false),
    },
    estimate: extraRevenueEstimate(cur, prev),
    recommendations: recommend(cur, prev, live),
    live,
    assumptions: [
      `Sparet tid: ${MINUTES_SAVED.perReply} min pr. besvaret henvendelse og ${MINUTES_SAVED.perFollowUp} min pr. opfølgning (antagelse – bør måles hos jer).`,
      "Henvendelser tælles i den periode, de blev modtaget, og følges til betalt faktura.",
      "Tilbudsaccept beregnes kun af afgjorte tilbud. Åbne tilbud står for sig.",
      "Kun betalte fakturaer er realiseret omsætning. Den tælles efter betalingsdato.",
    ],
    provenanceNote: "Alle tal er testdata. Verificerede tal kræver forbindelse til jeres mail, kalender og økonomisystem.",
  };
}

// ---------------------------------------------------------------- oversigt

export function getOverview(tenantId: TenantId, userId: UserId, at = nowMs()) {
  const tenant = getTenant(tenantId);
  const user = getUser(tenantId, userId);
  if (!tenant || !user) return undefined;
  const all = listInquiries(tenantId, "alle", at);
  const open = all.filter((i) => i.status === "ny" || i.status === "udkast_klar");
  const urgent = open.filter((i) => i.urgency === "akut");
  const pending = open.filter((i) => i.status === "udkast_klar");
  const quotes = listQuotes(tenantId, at);
  const followUps = can(user.role, "approve_followup") ? listFollowUps(tenantId, at) : [];
  const quotesAwaiting = quotes.filter((q) => q.status === "afventer_godkendelse");
  return {
    tenant: { id: tenant.id, name: tenant.name, trade: tenant.trade },
    user: { name: user.name, role: user.role as Role },
    stopped: automationStopped(tenantId),
    counts: {
      urgent: urgent.length,
      pendingApprovals: pending.length,
      newInquiries: open.filter((i) => i.status === "ny").length,
      openInquiries: open.length,
      quotesAwaiting: quotesAwaiting.length,
      followUps: followUps.filter((f) => f.allowed).length,
      actionTotal: urgent.length + pending.filter((p) => p.urgency !== "akut").length + (can(user.role, "approve_quote") ? quotesAwaiting.length : 0) + followUps.filter((f) => f.allowed).length,
    },
    urgent, pending, open,
    quotesAwaiting,
    followUps,
    quoteTotals: quoteTotals(quotes),
    workers: workerStatuses(tenantId, at),
    analytics: can(user.role, "view_analytics") ? analytics(tenantId, 30, at) : undefined,
  };
}

// ---------------------------------------------------------------- push

export function savePushSubscription(tenantId: TenantId, userId: UserId, endpoint: string) {
  const subs = db().pushSubscriptions;
  const existing = subs.findIndex((s) => s.endpoint === endpoint);
  if (existing >= 0) subs.splice(existing, 1);
  subs.push({ tenantId, userId, endpoint, createdAt: new Date().toISOString() });
  audit({ at: new Date().toISOString(), tenantId, userId, action: "push_subscribe" });
}

/** Push-indhold må ALDRIG indeholde kundenavn, adresse eller beskedtekst – det vises på låseskærmen. */
export function buildUrgentPushPayload(urgentCount: number) {
  return {
    title: "GENFANG",
    body: urgentCount === 1 ? "Ny akut sag venter. Åbn appen for detaljer." : `${urgentCount} akutte sager venter. Åbn appen for detaljer.`,
    url: "/henvendelser",
    tag: "genfang-akut",
  };
}

// ---------------------------------------------------------------- platform (superadmin)

function requireSuperadmin(userId: UserId): User | Fail {
  const u = db().users.find((x) => x.id === userId && x.tenantId === "__platform__");
  if (!u || !can(u.role, "platform_admin")) return fail("forbidden", "Kun for GENFANG-ejeren.");
  return u;
}

/**
 * Ejerpanel: aggregerede tal pr. virksomhed. Bevidst UDEN kundenavne, beskeder eller adresser
 * (dataminimering – platformens ejer har ikke brug for virksomhedernes kundedata).
 */
export function adminOverview(userId: UserId, at = nowMs()) {
  const u = requireSuperadmin(userId);
  if ("ok" in u) return u;
  const p = db().platform;
  const DAY = 86_400_000;
  const tenants = db().tenants.map((t) => {
    const runs = db().workerRuns.filter((r) => r.tenantId === t.id && at - Date.parse(r.at) < 30 * DAY);
    const tokens = runs.reduce((a, r) => a + r.aiTokens, 0);
    const smsCount = 0; // ingen SMS i testversionen
    const aiCost = (tokens / 1000) * p.costModel.aiPer1kTokens;
    const fee = t.plan.priceDkk * p.costModel.paymentFeePct;
    const cost = Math.round(p.costModel.hostingPerTenant + aiCost + smsCount * p.costModel.smsPerMessage + fee);
    const inq = db().inquiries.filter((i) => i.tenantId === t.id);
    const errors = runs.filter((r) => r.status === "fejl");
    const lastErr = errors.sort((a, b) => b.at.localeCompare(a.at))[0];
    return {
      id: t.id, name: t.name, trade: t.trade, plan: t.plan, paused: t.paused, dpaSigned: t.dpaSigned,
      mrr: t.plan.priceDkk, cost, margin: t.plan.priceDkk - cost,
      aiTokens30d: tokens, aiCost30d: Math.round(aiCost * 100) / 100,
      runs30d: runs.length, errors30d: errors.length, lastError: lastErr ? { at: lastErr.at, worker: lastErr.worker, error: lastErr.error } : null,
      queues: {
        pendingApprovals: inq.filter((i) => i.status === "udkast_klar").length,
        escalationsOpen: inq.filter((i) => i.escalation?.state === "afventer_kvittering").length,
        outboxBlocked: db().outbox.filter((o) => o.tenantId === t.id).length,
      },
      workers: workerStatuses(t.id, at).map((w) => ({ id: w.id, name: w.name, state: w.state })),
      usage: { inquiries30d: (db().history[t.id] ?? []).filter((c) => at - Date.parse(c.receivedAt) < 30 * DAY).length },
    };
  });
  const mrr = tenants.filter((t) => !t.paused).reduce((a, t) => a + t.mrr, 0);
  const cost = tenants.reduce((a, t) => a + t.cost, 0);
  return {
    ok: true as const,
    platform: { emergencyStop: p.emergencyStop, stoppedAt: p.stoppedAt, reason: p.reason },
    totals: { tenants: tenants.length, mrr, arr: mrr * 12, cost, margin: mrr - cost, errors30d: tenants.reduce((a, t) => a + t.errors30d, 0) },
    tenants,
    costModel: p.costModel,
  };
}

export function setEmergencyStop(userId: UserId, on: boolean, reason: string, at = nowMs()): Ok<{ emergencyStop: boolean }> | Fail {
  const u = requireSuperadmin(userId);
  if ("ok" in u) return u;
  const p = db().platform;
  if (on && !String(reason ?? "").trim()) return fail("invalid", "Angiv en årsag til nødstoppet.");
  p.emergencyStop = on;
  p.stoppedAt = on ? iso(at) : undefined;
  p.stoppedBy = on ? userId : undefined;
  p.reason = on ? String(reason).trim().slice(0, 300) : undefined;
  for (const t of db().tenants) {
    audit({ at: iso(at), tenantId: t.id, userId, action: on ? "emergency_stop" : "emergency_resume", detail: p.reason });
    for (const w of WORKERS) if (on) logRun(t.id, w.id, "stoppet", "Nødstop aktiveret af GENFANG.", at);
  }
  return { ok: true, emergencyStop: on };
}

export function setTenantPaused(userId: UserId, tenantId: TenantId, paused: boolean, at = nowMs()): Ok<{ paused: boolean }> | Fail {
  const u = requireSuperadmin(userId);
  if ("ok" in u) return u;
  const t = getTenant(tenantId);
  if (!t) return fail("not_found", "Virksomheden findes ikke.");
  t.paused = paused;
  audit({ at: iso(at), tenantId, userId, action: paused ? "tenant_pause" : "tenant_resume" });
  return { ok: true, paused };
}

