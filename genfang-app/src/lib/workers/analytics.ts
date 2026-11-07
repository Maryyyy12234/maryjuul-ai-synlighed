// Worker 04 – Analytics. Rene funktioner uden sideeffekter, så tallene kan testes præcist.
//
// Metode (vises også i appen):
// - Kohorte: en henvendelse tælles i den periode, den blev MODTAGET i, og følges hele vejen
//   til betalt faktura. Så blandes gamle tilbud ikke ind i en ny periodes rater.
// - Rater sammenlignes i PROCENTPOINT (32 % → 39 % = +7 pp). Relativ ændring vises separat.
// - Tilbudsaccept = accepterede / afgjorte tilbud. Tilbud, der stadig afventer svar, er ikke i nævneren.
// - Kun BETALTE fakturaer er realiseret omsætning. Accepterede og fakturerede beløb vises separat.
// - Betalt omsætning tælles efter BETALINGSDATO (ikke kohorte): nye henvendelser har ikke nået at
//   blive betalt endnu, så en kohorte-sammenligning ville fejlagtigt vise et fald.

import type { Provenance, QuoteStatus } from "../types.ts";

export interface JourneyCase {
  id: string;
  receivedAt: string;
  firstResponseAt?: string;
  booked: boolean;
  afterHours: boolean;
  missingInfo: boolean;
  followUps: number;
  quote?: { amountDkk: number; status: QuoteStatus; sentAt?: string; invoicedAt?: string; paidAt?: string };
}

export interface PeriodStats {
  from: string; to: string;
  inquiries: number;
  responded: number;
  responseRate: number | null;
  medianResponseMin: number | null;
  afterHoursShare: number | null;
  bookedOrQuoted: number;
  bookingRate: number | null;
  quotesSent: number;
  quotesDecided: number;
  quotesAccepted: number;
  quotesOpen: number;
  acceptRate: number | null;
  revenuePaid: number;
  revenueInvoicedUnpaid: number;
  revenueAcceptedNotInvoiced: number;
  revenuePotential: number;
  avgOrderValue: number | null;
  minutesSaved: number;
  followUps: number;
}

const ACCEPTED: QuoteStatus[] = ["accepteret", "faktureret"];
const DECIDED: QuoteStatus[] = ["accepteret", "faktureret", "afvist", "udloebet"];
const OPEN: QuoteStatus[] = ["kladde", "afventer_godkendelse", "sendt"];

/** Antagelser for tidsbesparelse – vises i appen og kan justeres pr. virksomhed. */
export const MINUTES_SAVED = { perReply: 8, perFollowUp: 5 } as const;

export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function periodStats(cases: JourneyCase[], fromMs: number, toMs: number): PeriodStats {
  const c = cases.filter((x) => { const t = Date.parse(x.receivedAt); return t >= fromMs && t < toMs; });
  const responded = c.filter((x) => x.firstResponseAt);
  const times = responded.map((x) => (Date.parse(x.firstResponseAt!) - Date.parse(x.receivedAt)) / 60_000);
  const quotes = c.map((x) => x.quote).filter((q): q is NonNullable<JourneyCase["quote"]> => !!q && q.status !== "kladde" && q.status !== "afventer_godkendelse");
  const accepted = quotes.filter((q) => ACCEPTED.includes(q.status));
  const decided = quotes.filter((q) => DECIDED.includes(q.status));
  const allQuotes = c.map((x) => x.quote).filter((q): q is NonNullable<JourneyCase["quote"]> => !!q);
  const sum = (xs: { amountDkk: number }[]) => xs.reduce((a, q) => a + q.amountDkk, 0);
  const bookedOrQuoted = c.filter((x) => x.booked || (x.quote && x.quote.status !== "kladde" && x.quote.status !== "afventer_godkendelse")).length;
  const followUps = c.reduce((a, x) => a + x.followUps, 0);
  return {
    from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(),
    inquiries: c.length,
    responded: responded.length,
    responseRate: ratio(responded.length, c.length),
    medianResponseMin: median(times),
    afterHoursShare: ratio(c.filter((x) => x.afterHours).length, c.length),
    bookedOrQuoted,
    bookingRate: ratio(bookedOrQuoted, c.length),
    quotesSent: quotes.length,
    quotesDecided: decided.length,
    quotesAccepted: accepted.length,
    quotesOpen: allQuotes.filter((q) => OPEN.includes(q.status)).length,
    acceptRate: ratio(accepted.length, decided.length),
    revenuePaid: cases.reduce((a, x) => { const p = x.quote?.paidAt ? Date.parse(x.quote.paidAt) : NaN; return p >= fromMs && p < toMs ? a + x.quote!.amountDkk : a; }, 0),
    revenueInvoicedUnpaid: sum(allQuotes.filter((q) => q.status === "faktureret" && !q.paidAt)),
    revenueAcceptedNotInvoiced: sum(allQuotes.filter((q) => q.status === "accepteret")),
    revenuePotential: sum(allQuotes.filter((q) => OPEN.includes(q.status))),
    avgOrderValue: accepted.length ? Math.round(sum(accepted) / accepted.length) : null,
    minutesSaved: responded.length * MINUTES_SAVED.perReply + followUps * MINUTES_SAVED.perFollowUp,
    followUps,
  };
}

export interface Change { abs: number | null; pp: number | null; rel: number | null }

/** Korrekt ændring: procentpoint for rater, relativ ændring kun når forrige værdi > 0. */
export function change(cur: number | null, prev: number | null, isRate: boolean): Change {
  if (cur === null || prev === null) return { abs: null, pp: null, rel: null };
  return {
    abs: cur - prev,
    pp: isRate ? Math.round((cur - prev) * 1000) / 10 : null,
    rel: prev !== 0 ? (cur - prev) / Math.abs(prev) : null,
  };
}

export const MIN_SAMPLE = 20;

export interface Estimate { value: number | null; provenance: Provenance; formula: string; caveat: string }

/** Mulig ekstra omsætning – et ESTIMAT, aldrig et resultat. Kræver tilstrækkeligt datagrundlag. */
export function extraRevenueEstimate(cur: PeriodStats, prev: PeriodStats): Estimate {
  const caveat = "Estimat. Viser ikke, at forbedringen skyldes GENFANG – sæson, priser og markedsføring kan også spille ind.";
  if (cur.inquiries < MIN_SAMPLE || prev.inquiries < MIN_SAMPLE || cur.bookingRate === null || prev.bookingRate === null || !cur.avgOrderValue) {
    return { value: null, provenance: "estimat", formula: "For lille datagrundlag (mindst 20 henvendelser i begge perioder).", caveat };
  }
  const extraJobs = (cur.bookingRate - prev.bookingRate) * cur.inquiries;
  const value = Math.round(extraJobs * cur.avgOrderValue * (cur.acceptRate ?? 0));
  return {
    value,
    provenance: "estimat",
    formula: `(${pct(cur.bookingRate)} − ${pct(prev.bookingRate)}) × ${cur.inquiries} henvendelser × ${pct(cur.acceptRate ?? 0)} accept × ${cur.avgOrderValue.toLocaleString("da-DK")} kr. gns. ordre`,
    caveat,
  };
}

export const pct = (r: number) => `${Math.round(r * 1000) / 10} %`.replace(".", ",");

export interface Recommendation { id: string; title: string; why: string; action: string; impact: "høj" | "middel" | "lav"; provenance: Provenance }

export function recommend(cur: PeriodStats, prev: PeriodStats, live: { unansweredQuotes: number; unansweredValue: number; missingInfoShare: number | null; pendingEscalations: number }): Recommendation[] {
  const r: Recommendation[] = [];
  if (live.pendingEscalations > 0) {
    r.push({ id: "esc", impact: "høj", provenance: "testdata", title: "Kvittér for akutte eskaleringer", why: `${live.pendingEscalations} akut sag er sendt til vagten uden kvittering.`, action: "Bed vagthavende kvittere i appen, så kunden får besked hurtigt." });
  }
  if (live.unansweredQuotes > 0) {
    r.push({ id: "fu", impact: "høj", provenance: "testdata", title: `Følg op på ${live.unansweredQuotes} ubesvarede tilbud`, why: `Tilbud for ${live.unansweredValue.toLocaleString("da-DK")} kr. har ligget uden svar i mere end 5 dage.`, action: "Gennemgå Follow-ups forslag under Tilbud og godkend dem, der er relevante." });
  }
  if (cur.medianResponseMin !== null && cur.medianResponseMin > 15) {
    r.push({ id: "rt", impact: "middel", provenance: "testdata", title: "Kortere svartid", why: `Median svartid er ${Math.round(cur.medianResponseMin)} min.`, action: "Slå notifikationer til, og godkend svarudkast fra telefonen mellem opgaver." });
  }
  if (cur.afterHoursShare !== null && cur.afterHoursShare >= 0.25) {
    r.push({ id: "ah", impact: "middel", provenance: "testdata", title: "Mange henvendelser uden for åbningstid", why: `${pct(cur.afterHoursShare)} af henvendelserne kommer uden for åbningstid.`, action: "Overvej en fast vagtordning eller et tydeligt autosvar med forventet svartid." });
  }
  if (cur.acceptRate !== null && cur.acceptRate < 0.35 && cur.quotesDecided >= 5) {
    r.push({ id: "acc", impact: "middel", provenance: "testdata", title: "Øg tilbudsaccept", why: `${pct(cur.acceptRate)} af de afgjorte tilbud blev accepteret (${cur.quotesAccepted} af ${cur.quotesDecided}).`, action: "Send tilbud inden for 24 timer, og beskriv tidsplan og hvad der er inkluderet." });
  }
  if (live.missingInfoShare !== null && live.missingInfoShare >= 0.3) {
    r.push({ id: "mi", impact: "lav", provenance: "testdata", title: "Bedre kontaktformular", why: `${pct(live.missingInfoShare)} af de åbne sager mangler oplysninger.`, action: "Tilføj felter til adresse, telefon og billede på hjemmesidens formular." });
  }
  if (prev.bookingRate !== null && cur.bookingRate !== null && cur.bookingRate < prev.bookingRate) {
    r.push({ id: "br", impact: "middel", provenance: "testdata", title: "Bookingraten er faldet", why: `Fra ${pct(prev.bookingRate)} til ${pct(cur.bookingRate)}. Mulige årsager: længere svartid, sæson eller færre ledige tider.`, action: "Tjek om der var få ledige tider i kalenderen i perioden." });
  }
  return r;
}
