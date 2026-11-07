// SYNTETISK datalager til testversionen.
//
// Dette er IKKE den rigtige GENFANG-database. Alle navne, adresser og beskeder er opdigtede.
// Når den rigtige backend (Supabase/Postgres + AI-workers) kobles på, erstattes kun
// funktionerne i denne fil – siderne og API-ruterne kalder udelukkende dem.
//
// Hver funktion kræver tenantId. Data fra en anden virksomhed returneres aldrig –
// heller ikke som "forbidden", så man kan ikke gætte andres sags-id'er.

import type {
  AuditEntry,
  Inquiry,
  InquirySummary,
  OutboxJob,
  Overview,
  Quote,
  Tenant,
  TenantId,
  User,
  UserId,
  WorkerStatus,
} from "./types.ts";

interface Db {
  tenants: Tenant[];
  users: User[];
  inquiries: Inquiry[];
  quotes: Quote[];
  workers: Record<TenantId, WorkerStatus[]>;
  audit: AuditEntry[];
  outbox: OutboxJob[];
  pushSubscriptions: { tenantId: TenantId; userId: UserId; endpoint: string; createdAt: string }[];
}

const g = globalThis as unknown as { __genfangDb?: Db };

function minutesAgo(m: number, now = Date.now()) {
  return new Date(now - m * 60_000).toISOString();
}
function daysFromNow(d: number, now = Date.now()) {
  return new Date(now + d * 86_400_000).toISOString();
}

export function seed(now = Date.now()): Db {
  const tenants: Tenant[] = [
    { id: "t_hansen", name: "Hansen VVS (testdata)", trade: "VVS" },
    { id: "t_nordlys", name: "Nordlys El (testdata)", trade: "El" },
  ];
  const users: User[] = [
    { id: "u_lars", tenantId: "t_hansen", email: "ejer@hansen-vvs.test", name: "Lars", role: "owner" },
    { id: "u_mette", tenantId: "t_nordlys", email: "ejer@nordlys-el.test", name: "Mette", role: "owner" },
  ];

  const d = (text: string, m: number) => ({ text, generatedBy: "worker-02" as const, createdAt: minutesAgo(m, now) });

  const inquiries: Inquiry[] = [
    {
      id: "inq_1042", tenantId: "t_hansen", customerName: "Sofie Kragh", channel: "formular",
      subject: "Vand på badeværelsesgulvet", address: "Testvej 12, 8000 Aarhus C",
      message: "Hej. Der kommer vand ud under toilettet, og det breder sig på gulvet. Vi har lukket for hanen ved toilettet. Kan I komme i dag?",
      receivedAt: minutesAgo(12, now), category: "akut", urgency: "akut", status: "udkast_klar", version: 1,
      draft: d("Hej Sofie\n\nTak for din besked – godt, at I har lukket for vandet. Vi kan være hos jer i dag mellem kl. 14 og 16. Læg gerne et håndklæde omkring toilettet indtil da.\n\nRing på 00 00 00 00, hvis det bliver værre.\n\nVenlig hilsen\nLars, Hansen VVS", 10),
    },
    {
      id: "inq_1041", tenantId: "t_hansen", customerName: "Jonas Møller", channel: "mail",
      subject: "Tilbud på nyt køkkenarmatur", message: "Vi skal have skiftet køkkenarmatur og vil gerne have et tilbud inkl. montering. Armaturet har vi selv købt.",
      receivedAt: minutesAgo(95, now), category: "tilbud", urgency: "normal", status: "udkast_klar", version: 1,
      draft: d("Hej Jonas\n\nTak for henvendelsen. Montering af et medbragt køkkenarmatur koster typisk 1.450 kr. inkl. moms og kørsel i Aarhus. Prisen bekræftes, når vi har set et billede af den nuværende installation.\n\nSend gerne et billede under vasken, så vender vi tilbage med en fast pris.\n\nVenlig hilsen\nLars, Hansen VVS", 90),
    },
    {
      id: "inq_1040", tenantId: "t_hansen", customerName: "Ida Lund", channel: "telefon",
      subject: "Årligt eftersyn af fyr", message: "Telefonnotat: Ønsker årligt eftersyn af gasfyr i november.",
      receivedAt: minutesAgo(30, now), category: "service", urgency: "lav", status: "ny", version: 1,
    },
    {
      id: "inq_1039", tenantId: "t_hansen", customerName: "Peter Sand", channel: "mail",
      subject: "Radiator bliver ikke varm", message: "Radiatoren i stuen bliver kun varm i toppen. Er det noget I kan se på i næste uge?",
      receivedAt: minutesAgo(48, now), category: "service", urgency: "normal", status: "ny", version: 1,
    },
    {
      id: "inq_1035", tenantId: "t_hansen", customerName: "Karen Holm", channel: "formular",
      subject: "Utæt blandingsbatteri", message: "Det drypper fra bruseren.",
      receivedAt: minutesAgo(60 * 26, now), category: "service", urgency: "normal", status: "godkendt", version: 2,
      decidedBy: "u_lars", decidedAt: minutesAgo(60 * 25, now),
      draft: d("Hej Karen\n\nVi kan komme torsdag formiddag.\n\nVenlig hilsen\nLars", 60 * 25.5),
    },
    // Anden virksomhed – må ALDRIG kunne ses af Hansen VVS.
    {
      id: "inq_2001", tenantId: "t_nordlys", customerName: "Ole Bech", channel: "mail",
      subject: "HPFI-relæ slår fra", message: "Relæet slår fra hver gang vaskemaskinen kører.",
      receivedAt: minutesAgo(20, now), category: "akut", urgency: "akut", status: "udkast_klar", version: 1,
      draft: d("Hej Ole\n\nVi kan komme i morgen kl. 8.\n\nMvh Mette", 18),
    },
  ];

  const quotes: Quote[] = [
    { id: "q_311", tenantId: "t_hansen", inquiryId: "inq_1030", customerName: "Anders Vinther", title: "Nyt badeværelse – rør og afløb", amountDkk: 38_500, status: "sendt", sentAt: minutesAgo(60 * 24 * 4, now), followUpAt: daysFromNow(1, now) },
    { id: "q_310", tenantId: "t_hansen", customerName: "Maja Friis", title: "Udskiftning af varmtvandsbeholder", amountDkk: 14_900, status: "sendt", sentAt: minutesAgo(60 * 24 * 7, now), followUpAt: daysFromNow(0, now) },
    { id: "q_309", tenantId: "t_hansen", customerName: "Rasmus Kjær", title: "Gulvvarme i entré", amountDkk: 9_800, status: "kladde" },
    { id: "q_305", tenantId: "t_hansen", customerName: "Lene Dahl", title: "Nyt toilet inkl. montering", amountDkk: 6_200, status: "accepteret", sentAt: minutesAgo(60 * 24 * 12, now) },
    { id: "q_401", tenantId: "t_nordlys", customerName: "Ole Bech", title: "Ny gruppetavle", amountDkk: 12_000, status: "sendt", sentAt: minutesAgo(60 * 24 * 2, now) },
  ];

  const workersFor = (): WorkerStatus[] => [
    { id: "worker-01", name: "Worker 01", job: "Sorterer nye henvendelser", state: "aktiv", lastRunAt: minutesAgo(2, now) },
    { id: "worker-02", name: "Worker 02", job: "Skriver svarudkast", state: "aktiv", lastRunAt: minutesAgo(10, now) },
    { id: "worker-03", name: "Worker 03", job: "Planlægger opfølgning på tilbud", state: "venter", lastRunAt: minutesAgo(60, now), note: "Udsendelse slået fra i testversion" },
    { id: "worker-04", name: "Worker 04", job: "Opdaterer nøgletal", state: "aktiv", lastRunAt: minutesAgo(15, now) },
  ];

  return {
    tenants, users, inquiries, quotes,
    workers: { t_hansen: workersFor(), t_nordlys: workersFor() },
    audit: [], outbox: [], pushSubscriptions: [],
  };
}

export function db(): Db {
  if (!g.__genfangDb) g.__genfangDb = seed();
  return g.__genfangDb;
}

/** Kun til tests. */
export function resetDb(now?: number) {
  g.__genfangDb = seed(now);
}

const summary = (i: Inquiry): InquirySummary => ({
  id: i.id, customerName: i.customerName, subject: i.subject, receivedAt: i.receivedAt,
  category: i.category, urgency: i.urgency, status: i.status, channel: i.channel,
});

const byNewest = (a: { receivedAt: string }, b: { receivedAt: string }) => b.receivedAt.localeCompare(a.receivedAt);
const urgentFirst = (a: Inquiry, b: Inquiry) =>
  (a.urgency === "akut" ? 0 : 1) - (b.urgency === "akut" ? 0 : 1) || byNewest(a, b);

export function findUserByEmail(email: string): User | undefined {
  return db().users.find((u) => u.email === email.trim().toLowerCase());
}

export function getUser(tenantId: TenantId, userId: UserId): User | undefined {
  return db().users.find((u) => u.id === userId && u.tenantId === tenantId);
}

export function listInquiries(tenantId: TenantId, filter?: "aabne" | "alle"): InquirySummary[] {
  return db()
    .inquiries.filter((i) => i.tenantId === tenantId)
    .filter((i) => filter !== "aabne" || i.status === "ny" || i.status === "udkast_klar")
    .sort(urgentFirst)
    .map(summary);
}

export function getInquiry(tenantId: TenantId, id: string): Inquiry | undefined {
  const i = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  return i ? structuredClone(i) : undefined;
}

export function listQuotes(tenantId: TenantId): Quote[] {
  const order = { sendt: 0, kladde: 1, accepteret: 2, afslaaet: 3 } as const;
  return db()
    .quotes.filter((q) => q.tenantId === tenantId)
    .sort((a, b) => order[a.status] - order[b.status] || (a.followUpAt ?? "").localeCompare(b.followUpAt ?? ""))
    .map((q) => ({ ...q }));
}

export function getOverview(tenantId: TenantId, userId: UserId): Overview | undefined {
  const tenant = db().tenants.find((t) => t.id === tenantId);
  const user = getUser(tenantId, userId);
  if (!tenant || !user) return undefined;
  const mine = db().inquiries.filter((i) => i.tenantId === tenantId);
  const pending = mine.filter((i) => i.status === "udkast_klar").sort(urgentFirst);
  const fresh = mine.filter((i) => i.status === "ny").sort(urgentFirst);
  const quotes = listQuotes(tenantId).filter((q) => q.status === "sendt" || q.status === "kladde");
  return {
    tenant,
    user: { name: user.name, role: user.role },
    counts: {
      newInquiries: fresh.length,
      pendingApprovals: pending.length,
      openQuotes: quotes.length,
      urgent: mine.filter((i) => i.urgency === "akut" && (i.status === "ny" || i.status === "udkast_klar")).length,
    },
    pendingApprovals: pending.map(summary),
    newInquiries: fresh.map(summary),
    quotes,
    workers: db().workers[tenantId] ?? [],
  };
}

export type DecisionResult =
  | { ok: true; inquiry: Inquiry }
  | { ok: false; code: "not_found" | "conflict" | "invalid" | "forbidden"; message: string; current?: Inquiry };

const MAX_DRAFT = 5000;

/**
 * Godkend eller afvis et svarudkast.
 *
 * Sikkerhed:
 * - tenantId skal matche (ellers "not_found" – lækker ikke eksistens).
 * - expectedVersion skal matche den aktuelle version (optimistisk lås). Hvis to enheder
 *   trykker samtidig, vinder den første, og den anden får "conflict" med den nye tilstand.
 * - Kun status "udkast_klar" kan besluttes. En allerede godkendt sag kan ikke godkendes igen,
 *   så der aldrig oprettes to udsendelser.
 * - Godkendelse opretter et outbox-job, som i testversionen er BLOKERET (intet sendes).
 *
 * I Postgres svarer det til:
 *   UPDATE inquiries SET status='godkendt', version=version+1, ...
 *   WHERE id=$1 AND tenant_id=$2 AND version=$3 AND status='udkast_klar' RETURNING *;
 * kombineret med et unikt indeks på outbox(inquiry_id).
 */
export function decide(
  tenantId: TenantId,
  userId: UserId,
  id: string,
  input: { decision: "approve" | "reject"; expectedVersion: number; editedText?: string },
  now = new Date(),
): DecisionResult {
  const user = getUser(tenantId, userId);
  if (!user) return { ok: false, code: "forbidden", message: "Ukendt bruger." };
  if (!Number.isInteger(input.expectedVersion)) return { ok: false, code: "invalid", message: "Version mangler." };
  if (input.editedText !== undefined) {
    if (typeof input.editedText !== "string" || input.editedText.trim().length < 2)
      return { ok: false, code: "invalid", message: "Svaret er tomt." };
    if (input.editedText.length > MAX_DRAFT) return { ok: false, code: "invalid", message: "Svaret er for langt." };
  }

  const row = db().inquiries.find((x) => x.id === id && x.tenantId === tenantId);
  if (!row) return { ok: false, code: "not_found", message: "Sagen findes ikke." };
  if (row.status !== "udkast_klar" || !row.draft)
    return { ok: false, code: "conflict", message: "Sagen er allerede behandlet.", current: structuredClone(row) };
  if (row.version !== input.expectedVersion)
    return { ok: false, code: "conflict", message: "Sagen er ændret på en anden enhed.", current: structuredClone(row) };

  const at = now.toISOString();
  if (input.decision === "approve" && input.editedText !== undefined && input.editedText !== row.draft.text) {
    row.draft = { ...row.draft, text: input.editedText, editedBy: userId };
  }
  row.status = input.decision === "approve" ? "godkendt" : "afvist";
  row.version += 1;
  row.decidedBy = userId;
  row.decidedAt = at;

  if (input.decision === "approve" && !db().outbox.some((o) => o.inquiryId === row.id)) {
    db().outbox.push({ id: `out_${row.id}`, tenantId, inquiryId: row.id, createdAt: at, state: "blokeret_testversion" });
  }
  audit({ at, tenantId, userId, action: input.decision, target: row.id, detail: `version ${row.version}` });
  return { ok: true, inquiry: structuredClone(row) };
}

export function audit(entry: AuditEntry) {
  const log = db().audit;
  log.push(entry);
  if (log.length > 5000) log.splice(0, log.length - 5000);
}

export function listAudit(tenantId: TenantId): AuditEntry[] {
  return db().audit.filter((a) => a.tenantId === tenantId);
}

export function listOutbox(tenantId: TenantId): OutboxJob[] {
  return db().outbox.filter((o) => o.tenantId === tenantId);
}

export function savePushSubscription(tenantId: TenantId, userId: UserId, endpoint: string) {
  const subs = db().pushSubscriptions;
  const existing = subs.findIndex((s) => s.endpoint === endpoint);
  if (existing >= 0) subs.splice(existing, 1);
  subs.push({ tenantId, userId, endpoint, createdAt: new Date().toISOString() });
  audit({ at: new Date().toISOString(), tenantId, userId, action: "push_subscribe" });
}

/**
 * Push-indhold må ALDRIG indeholde kundenavn, adresse eller beskedtekst –
 * det vises på låseskærmen. Kun antal og et neutralt link.
 */
export function buildUrgentPushPayload(urgentCount: number) {
  return {
    title: "GENFANG",
    body: urgentCount === 1 ? "Ny akut sag venter. Åbn appen for detaljer." : `${urgentCount} akutte sager venter. Åbn appen for detaljer.`,
    url: "/henvendelser",
    tag: "genfang-akut",
  };
}
