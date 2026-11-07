// SYNTETISKE testdata. Alle navne, adresser, telefonnumre og beløb er opdigtede.
// Genereres relativt til "nu", så demoen altid er aktuel, men deterministisk (fast frø),
// så tests altid giver samme resultat.

import type {
  AuditEntry, CalendarSlot, Customer, FollowUpSuggestion, Inquiry, OutboxJob, Quote, Tenant, User, WorkerRun,
} from "./types.ts";
import type { JourneyCase } from "./workers/analytics.ts";
import { addLocalDays, isOpenAt, localParts, zonedToUtc } from "./time.ts";
import { classify } from "./workers/intake.ts";

export interface Platform {
  emergencyStop: boolean;
  stoppedAt?: string;
  stoppedBy?: string;
  reason?: string;
  /** Månedlige omkostninger pr. virksomhed – ESTIMATER til ejerpanelet. */
  costModel: { hostingPerTenant: number; smsPerMessage: number; aiPer1kTokens: number; paymentFeePct: number };
}

export interface Db {
  platform: Platform;
  tenants: Tenant[];
  users: User[];
  customers: Customer[];
  slots: CalendarSlot[];
  inquiries: Inquiry[];
  quotes: Quote[];
  followUps: FollowUpSuggestion[];
  history: Record<string, JourneyCase[]>;
  workerRuns: WorkerRun[];
  audit: AuditEntry[];
  outbox: OutboxJob[];
  pushSubscriptions: { tenantId: string; userId: string; endpoint: string; createdAt: string }[];
  seq: number;
}

const TZ = "Europe/Copenhagen";
const VVS_HOURS = { 1: { open: "07:00", close: "15:30" }, 2: { open: "07:00", close: "15:30" }, 3: { open: "07:00", close: "15:30" }, 4: { open: "07:00", close: "15:30" }, 5: { open: "07:00", close: "14:00" }, 6: null, 7: null };

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seed(now = Date.now()): Db {
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const daysAgo = (d: number) => ago(d * 24 * 60);

  const tenants: Tenant[] = [
    {
      id: "t_hansen", name: "Hansen VVS (testdata)", trade: "VVS", timezone: TZ, locale: "da-DK", openingHours: VVS_HOURS,
      employees: [
        { id: "e_lars", name: "Lars Hansen", title: "Ejer", phone: "00 00 00 01", onCall: false, userId: "u_lars" },
        { id: "e_mikkel", name: "Mikkel", title: "VVS-montør", phone: "00 00 00 02", onCall: true, userId: "u_mikkel" },
        { id: "e_sara", name: "Sara", title: "VVS-montør", phone: "00 00 00 03", onCall: false },
      ],
      priceList: [
        { id: "p_armatur", label: "Montering af medbragt køkkenarmatur", amountDkk: 1450, unit: "fast" },
        { id: "p_time", label: "Timepris, VVS-montør", amountDkk: 744, unit: "pr_time" },
        { id: "p_koersel", label: "Kørsel i Aarhus Kommune", amountDkk: 395, unit: "fast" },
        { id: "p_eftersyn", label: "Årligt eftersyn af gasfyr", amountDkk: 1695, unit: "fast" },
      ],
      plan: { id: "business", name: "GENFANG Business", priceDkk: 1995 }, paused: false, dpaSigned: false, retentionDays: 730,
    },
    {
      id: "t_nordlys", name: "Nordlys El (testdata)", trade: "El", timezone: TZ, locale: "da-DK", openingHours: VVS_HOURS,
      employees: [{ id: "e_mette", name: "Mette", title: "Ejer", phone: "00 00 00 11", onCall: true, userId: "u_mette" }],
      priceList: [{ id: "p_el_time", label: "Timepris, elektriker", amountDkk: 795, unit: "pr_time" }],
      plan: { id: "pilot", name: "Pilotkunde", priceDkk: 995 }, paused: false, dpaSigned: false, retentionDays: 730,
    },
    {
      id: "t_aarhusror", name: "Aarhus Rør & Bad (testdata)", trade: "VVS", timezone: TZ, locale: "da-DK", openingHours: VVS_HOURS,
      employees: [{ id: "e_bo", name: "Bo", title: "Ejer", phone: "00 00 00 21", onCall: true }],
      priceList: [],
      plan: { id: "business", name: "GENFANG Business", priceDkk: 1995 }, paused: false, dpaSigned: false, retentionDays: 730,
    },
  ];

  const users: User[] = [
    { id: "u_lars", tenantId: "t_hansen", email: "ejer@hansen-vvs.test", name: "Lars", role: "owner" },
    { id: "u_mikkel", tenantId: "t_hansen", email: "mikkel@hansen-vvs.test", name: "Mikkel", role: "staff" },
    { id: "u_mette", tenantId: "t_nordlys", email: "ejer@nordlys-el.test", name: "Mette", role: "owner" },
    { id: "u_platform", tenantId: "__platform__", email: "ejer@genfang.test", name: "GENFANG", role: "superadmin" },
  ];

  // ---------- Kalender: ledige og reserverede tider de næste 14 dage ----------
  const slots: CalendarSlot[] = [];
  const t0 = localParts(now, TZ);
  for (const tenant of tenants) {
    const worker = tenant.employees.find((e) => e.title !== "Ejer") ?? tenant.employees[0];
    for (let d = 0; d < 14; d++) {
      const day = addLocalDays(t0.y, t0.m, t0.d, d);
      if (!tenant.openingHours[day.weekday]) continue;
      [[8, 10], [10, 12], [12, 14]].forEach(([a, b], i) => {
        slots.push({
          id: `sl_${tenant.id}_${day.y}${String(day.m).padStart(2, "0")}${String(day.d).padStart(2, "0")}_${a}`,
          employeeId: worker.id,
          start: new Date(zonedToUtc(day.y, day.m, day.d, a, 0, TZ)).toISOString(),
          end: new Date(zonedToUtc(day.y, day.m, day.d, b, 0, TZ)).toISOString(),
          state: (d + i) % 3 === 0 ? "reserveret" : "ledig",
          source: "testkalender",
        });
      });
    }
  }

  // ---------- Kunder og aktuelle henvendelser ----------
  const customers: Customer[] = [];
  const cust = (tenantId: string, id: string, name: string, extra: Partial<Customer> = {}) => {
    customers.push({ id, tenantId, name, marketingConsent: false, ...extra });
    return id;
  };

  const mk = (p: Omit<Inquiry, "category" | "urgency" | "missingInfo" | "emergency" | "version" | "knownCustomer"> & { phone?: string; known?: boolean }): Inquiry => {
    const c = classify({ subject: p.subject, message: p.message, address: p.address, phone: p.phone, channel: p.channel });
    const { phone: _p, known, ...rest } = p;
    return { ...rest, ...c, knownCustomer: !!known, version: 1 };
  };

  const sofie = mk({
    id: "inq_1042", tenantId: "t_hansen", customerId: cust("t_hansen", "c_sofie", "Sofie Kragh", { email: "sofie@example.test", phone: "00000010", address: "Testvej 12, 8000 Aarhus C" }),
    customerName: "Sofie Kragh", channel: "formular", subject: "Vand på badeværelsesgulvet", address: "Testvej 12, 8000 Aarhus C", phone: "00000010",
    message: "Hej. Der kommer vand ud under toilettet, og det breder sig på gulvet. Vi har lukket for hanen ved toilettet. Kan I komme i dag?",
    receivedAt: ago(12), status: "udkast_klar",
    // BEVIDST FEJLBEHÆFTET udkast fra den gamle version – sikkerhedslaget skal blokere det.
    draft: { text: "Hej Sofie\n\nTak for din besked – godt, at I har lukket for vandet. Vi kan være hos jer i dag mellem kl. 14 og 16. Læg gerne et håndklæde omkring toilettet indtil da.\n\nRing på 00 00 00 00, hvis det bliver værre.\n\nVenlig hilsen\nLars, Hansen VVS", generatedBy: "legacy", createdAt: ago(10) },
  });
  sofie.escalation = { to: "e_mikkel", toName: "Mikkel", reason: "Mulig vandskade registreret af Intake", at: ago(11), by: "worker-01", state: "afventer_kvittering", delivery: "blokeret_testversion" };

  const inquiries: Inquiry[] = [
    sofie,
    mk({
      id: "inq_1041", tenantId: "t_hansen", customerId: cust("t_hansen", "c_jonas", "Jonas Møller", { email: "jonas@example.test" }), customerName: "Jonas Møller", channel: "mail",
      subject: "Tilbud på nyt køkkenarmatur", message: "Vi skal have skiftet køkkenarmatur og vil gerne have et tilbud inkl. montering. Armaturet har vi selv købt.",
      receivedAt: ago(95), status: "udkast_klar",
    }),
    mk({
      id: "inq_1040", tenantId: "t_hansen", customerId: cust("t_hansen", "c_ida", "Ida Lund", { phone: "00000012" }), customerName: "Ida Lund", channel: "telefon", phone: "00000012", known: true,
      subject: "Årligt eftersyn af fyr", message: "Telefonnotat: Ønsker årligt eftersyn af gasfyr i november.", address: "Prøvegade 3, 8210 Aarhus V",
      receivedAt: ago(30), status: "ny",
    }),
    mk({
      id: "inq_1039", tenantId: "t_hansen", customerId: cust("t_hansen", "c_peter", "Peter Sand", { email: "peter@example.test" }), customerName: "Peter Sand", channel: "mail",
      subject: "Radiator bliver ikke varm", message: "Radiatoren i stuen bliver kun varm i toppen. Er det noget I kan se på i næste uge?", address: "Eksempelvej 8, 8200 Aarhus N",
      receivedAt: ago(48), status: "udkast_klar",
    }),
    mk({
      id: "inq_1035", tenantId: "t_hansen", customerId: cust("t_hansen", "c_karen", "Karen Holm", { email: "karen@example.test" }), customerName: "Karen Holm", channel: "formular",
      subject: "Utæt blandingsbatteri", message: "Det drypper fra bruseren.", receivedAt: daysAgo(4), status: "godkendt", firstResponseAt: new Date(now - 4 * 86_400_000 + 6 * 60_000).toISOString(),
      decidedBy: "u_lars", decidedAt: new Date(now - 4 * 86_400_000 + 6 * 60_000).toISOString(),
      draft: { text: "Hej Karen\n\nTak for din henvendelse. Send gerne adresse og telefonnummer, så finder vi en tid.\n\nVenlig hilsen\nLars Hansen, Hansen VVS", generatedBy: "worker-02", createdAt: daysAgo(4) },
    }),
    mk({
      id: "inq_2001", tenantId: "t_nordlys", customerId: cust("t_nordlys", "c_ole", "Ole Bech"), customerName: "Ole Bech", channel: "mail",
      subject: "HPFI-relæ slår fra", message: "Relæet slår fra hver gang vaskemaskinen kører.", receivedAt: ago(20), status: "udkast_klar",
      draft: { text: "Hej Ole\n\nTak for din besked. Vi vender tilbage med et konkret tidspunkt.\n\nMvh Mette", generatedBy: "worker-02", createdAt: ago(18) },
    }),
  ];

  // ---------- Tilbud: alle syv statusser ----------
  const q = (p: Omit<Quote, "followUps" | "version" | "validDays" | "createdAt"> & Partial<Pick<Quote, "followUps" | "validDays" | "createdAt">>): Quote =>
    ({ followUps: 0, version: 1, validDays: 30, createdAt: p.sentAt ?? daysAgo(1), ...p });
  const quotes: Quote[] = [
    q({ id: "q_312", tenantId: "t_hansen", customerId: cust("t_hansen", "c_bo", "Bo Winther"), customerName: "Bo Winther", title: "Udskiftning af gulvafløb", amountDkk: 7_400, status: "afventer_godkendelse", createdAt: ago(200) }),
    q({ id: "q_311", tenantId: "t_hansen", customerId: cust("t_hansen", "c_anders", "Anders Vinther"), customerName: "Anders Vinther", title: "Nyt badeværelse – rør og afløb", amountDkk: 38_500, status: "sendt", sentAt: daysAgo(6) }),
    q({ id: "q_310", tenantId: "t_hansen", customerId: cust("t_hansen", "c_maja", "Maja Friis"), customerName: "Maja Friis", title: "Udskiftning af varmtvandsbeholder", amountDkk: 14_900, status: "sendt", sentAt: daysAgo(8), followUps: 1 }),
    q({ id: "q_309", tenantId: "t_hansen", customerId: cust("t_hansen", "c_rasmus", "Rasmus Kjær"), customerName: "Rasmus Kjær", title: "Gulvvarme i entré", amountDkk: 9_800, status: "kladde" }),
    q({ id: "q_308", tenantId: "t_hansen", customerId: cust("t_hansen", "c_tina", "Tina Berg"), customerName: "Tina Berg", title: "Ny vandhane i bryggers", amountDkk: 3_200, status: "sendt", sentAt: daysAgo(2) }),
    q({ id: "q_305", tenantId: "t_hansen", customerId: cust("t_hansen", "c_lene", "Lene Dahl"), customerName: "Lene Dahl", title: "Nyt toilet inkl. montering", amountDkk: 6_200, status: "accepteret", sentAt: daysAgo(12), respondedAt: daysAgo(9) }),
    q({ id: "q_303", tenantId: "t_hansen", customerId: cust("t_hansen", "c_kim", "Kim Ravn"), customerName: "Kim Ravn", title: "Omlægning af faldstamme", amountDkk: 22_000, status: "faktureret", sentAt: daysAgo(25), respondedAt: daysAgo(22), invoicedAt: daysAgo(5) }),
    q({ id: "q_301", tenantId: "t_hansen", customerId: cust("t_hansen", "c_eva", "Eva Skov"), customerName: "Eva Skov", title: "Ny cirkulationspumpe", amountDkk: 4_500, status: "faktureret", sentAt: daysAgo(28), respondedAt: daysAgo(26), invoicedAt: daysAgo(18), paidAt: daysAgo(8) }),
    q({ id: "q_299", tenantId: "t_hansen", customerId: cust("t_hansen", "c_ulla", "Ulla Krogh"), customerName: "Ulla Krogh", title: "Badeværelsesrenovering", amountDkk: 64_000, status: "afvist", sentAt: daysAgo(20), respondedAt: daysAgo(15) }),
    q({ id: "q_297", tenantId: "t_hansen", customerId: cust("t_hansen", "c_per", "Per Mølgaard"), customerName: "Per Mølgaard", title: "Udendørs vandhane", amountDkk: 2_400, status: "sendt", sentAt: daysAgo(40) }), // udløber automatisk
    q({ id: "q_401", tenantId: "t_nordlys", customerId: "c_ole", customerName: "Ole Bech", title: "Ny gruppetavle", amountDkk: 12_000, status: "sendt", sentAt: daysAgo(2) }),
  ];

  // ---------- Historik til analytics (75 dage). GENFANG "aktiveret" for 30 dage siden. ----------
  const history: Record<string, JourneyCase[]> = {};
  const AMOUNTS = [3_200, 4_500, 6_200, 9_800, 14_900, 22_000, 38_500];
  tenants.forEach((tenant, ti) => {
    const r = rng(1000 + ti * 77);
    const list: JourneyCase[] = [];
    for (let d = 75; d >= 1; d--) {
      const x = r();
      const count = x < 0.12 ? 0 : x < 0.45 ? 1 : x < 0.85 ? 2 : 3;
      const day = addLocalDays(t0.y, t0.m, t0.d, -d);
      for (let k = 0; k < count; k++) {
        const hour = 6 + Math.floor(r() * 16);
        const received = zonedToUtc(day.y, day.m, day.d, hour, Math.floor(r() * 60), TZ);
        const after = d <= 30;
        const afterHours = !isOpenAt(received, tenant.openingHours, TZ);
        const responds = r() < (after ? 0.98 : 0.86);
        const delayMin = after ? (afterHours ? 25 + r() * 40 : 2 + r() * 9) : (afterHours ? 600 + r() * 400 : 40 + r() * 220);
        const booked = r() < (after ? 0.27 : 0.19);
        let quote: JourneyCase["quote"];
        if (!booked && r() < (after ? 0.3 : 0.24)) {
          const sentAt = received + (after ? 1 : 2) * 86_400_000;
          const ageDays = (now - sentAt) / 86_400_000;
          const amountDkk = AMOUNTS[Math.floor(r() * AMOUNTS.length)];
          if (ageDays < 6) quote = { amountDkk, status: "sendt", sentAt: new Date(sentAt).toISOString() };
          else if (r() < (after ? 0.4 : 0.26)) {
            const paid = ageDays > 18;
            quote = { amountDkk, status: ageDays > 10 ? "faktureret" : "accepteret", sentAt: new Date(sentAt).toISOString(), invoicedAt: ageDays > 10 ? new Date(sentAt + 8 * 86_400_000).toISOString() : undefined, paidAt: paid ? new Date(sentAt + 16 * 86_400_000).toISOString() : undefined };
          } else quote = { amountDkk, status: r() < 0.6 ? "afvist" : "udloebet", sentAt: new Date(sentAt).toISOString() };
        }
        list.push({
          id: `h_${tenant.id}_${d}_${k}`, receivedAt: new Date(received).toISOString(),
          firstResponseAt: responds ? new Date(received + delayMin * 60_000).toISOString() : undefined,
          booked, afterHours, missingInfo: r() < 0.3, followUps: after && quote?.status === "sendt" ? 1 : 0, quote,
        });
      }
    }
    history[tenant.id] = list;
  });

  // ---------- Worker-logs ----------
  const workerRuns: WorkerRun[] = [];
  let n = 0;
  const run = (tenantId: string, worker: WorkerRun["worker"], min: number, status: WorkerRun["status"], summary: string, error?: string) =>
    workerRuns.push({ id: `run_${++n}`, tenantId, worker, at: ago(min), status, summary, error, aiTokens: 0 });
  for (const t of ["t_hansen", "t_nordlys", "t_aarhusror"]) {
    run(t, "worker-04", 15, "ok", "Nøgletal opdateret for seneste 30 dage.");
    run(t, "worker-03", 60, "ok", "Tjekkede tilbud og ventende svar.");
  }
  run("t_hansen", "worker-01", 11, "ok", "Ny henvendelse sorteret som akut (mulig vandskade). Eskaleret til Mikkel.");
  run("t_hansen", "worker-02", 10, "blokeret", "Udkast fra gammel version blokeret af sikkerhedslaget (tidspunkt).");
  run("t_hansen", "worker-01", 30, "ok", "Telefonnotat oprettet. Kendt kunde genkendt.");
  run("t_hansen", "worker-02", 90, "ok", "Svarudkast skrevet med pris fra prislisten.");
  run("t_hansen", "worker-03", 60 * 26, "fejl", "Kunne ikke læse kalender.", "Testkalender svarede ikke inden for 10 sek. Forsøgt igen – lykkedes ved næste kørsel.");
  run("t_nordlys", "worker-03", 25, "fejl", "Opfølgning sprunget over.", "Kalenderintegration ikke forbundet (Google Calendar mangler adgang).");
  run("t_nordlys", "worker-01", 20, "ok", "Ny henvendelse sorteret.");
  run("t_aarhusror", "worker-01", 300, "ok", "Ingen nye henvendelser.");

  const db: Db = {
    platform: { emergencyStop: false, costModel: { hostingPerTenant: 60, smsPerMessage: 0.45, aiPer1kTokens: 0.11, paymentFeePct: 0.019 } },
    tenants, users, customers, slots, inquiries, quotes, followUps: [], history, workerRuns,
    audit: [], outbox: [], pushSubscriptions: [], seq: 5000,
  };
  return db;
}
