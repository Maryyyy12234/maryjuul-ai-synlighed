// GENFANG sikkerhedslag ("guard").
//
// Alle tekster, der skal ud til en kunde (svar, opfølgninger), passerer denne kontrol,
// FØR de kan godkendes – og igen på serveren i det øjeblik, de godkendes.
// Finder kontrollen et problem, er godkendelse blokeret, indtil teksten er rettet.
//
// Regler:
//  1. Ingen tidspunkter i fortiden (vurderet i virksomhedens lokale tidszone, i godkendelsesøjeblikket).
//  2. Ingen tidspunkter, der ikke findes som LEDIG tid i den bekræftede kalender.
//  3. Ingen tidspunkter uden for åbningstid.
//  4. Ingen dag uden tidsrum ("vi kommer i dag") og intet tidsrum uden dag.
//  5. Ingen ankomstløfter ("vi er der om en time").
//  6. Ingen beløb, der ikke står i den godkendte prisliste eller i et godkendt tilbud.
//  7. Akutte sager: ingen besøgsløfter – kun vagthavende kan bekræfte et besøg.
//
// Kontrollen er bevidst konservativ: hellere blokere en korrekt tekst (som et menneske så retter)
// end lade et forkert løfte slippe igennem. Den erstatter ikke menneskelig godkendelse.

import type { CalendarSlot, GuardIssue, GuardResult, OpeningDay, PriceItem } from "./types.ts";
import { addLocalDays, localParts, withinOpeningHours, zonedToUtc } from "./time.ts";

export interface GuardContext {
  nowMs: number;
  tz: string;
  openingHours: Record<number, OpeningDay | null>;
  slots: CalendarSlot[];
  priceList: PriceItem[];
  /** Beløb fra godkendte tilbud til samme kunde, som teksten må henvise til. */
  approvedAmounts?: number[];
  emergency?: boolean;
  /** Minimum forvarsel før et foreslået besøg (min). */
  leadMinutes?: number;
}

const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const WEEKDAYS: Record<string, number> = { mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, "lørdag": 6, "søndag": 7 };
const VISIT = /\b(komme|kommer|være hos|vaere hos|besøg|besøge|forbi|ude hos|ankomme|ankommer|møde op|kigge på det|se på det)\b/;
const PART_OF_DAY: Record<string, [number, number]> = { formiddag: [8, 12], eftermiddag: [12, 16] };

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\b(kl|ca|inkl|ekskl|nr|tlf|bl\.a|f\.eks)\./g, (m) => m.replace(/\./g, ""))
    .replace(/(\d{1,2})\.(\d{2})(?!\d)/g, "$1:$2") // 14.30 → 14:30 (rører ikke 1.450)
    .replace(/(\d{1,2})\.\s+(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)/g, "$1 $2");
}

function sentences(text: string): string[] {
  return normalize(text).split(/[.!?]+(?=\s|$)|\n+/).map((s) => s.trim()).filter(Boolean);
}

type LocalDate = { y: number; m: number; d: number };

function findDay(s: string, ctx: GuardContext): LocalDate | null {
  const t = localParts(ctx.nowMs, ctx.tz);
  if (/\bi overmorgen\b/.test(s)) return addLocalDays(t.y, t.m, t.d, 2);
  if (/\bi morgen\b/.test(s)) return addLocalDays(t.y, t.m, t.d, 1);
  if (/\bi dag\b|\bi eftermiddag\b|\bi formiddag\b|\bi aften\b/.test(s)) return { y: t.y, m: t.m, d: t.d };
  const wd = s.match(/\b(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b/);
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    let diff = (target - t.weekday + 7) % 7;
    if (diff === 0) diff = 7; // "på torsdag" sagt en torsdag = næste torsdag
    return addLocalDays(t.y, t.m, t.d, diff);
  }
  const named = s.match(/\b(\d{1,2}) (januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\b/);
  const numeric = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const dm = named ? { d: +named[1], m: MONTHS.indexOf(named[2]) + 1 } : numeric ? { d: +numeric[1], m: +numeric[2] } : null;
  if (dm && dm.m >= 1 && dm.m <= 12 && dm.d >= 1 && dm.d <= 31) {
    const thisYear = { y: t.y, m: dm.m, d: dm.d };
    return thisYear; // fortid fanges af regel 1 frem for at gætte på næste år
  }
  return null;
}

type Window = { sh: number; sm: number; eh?: number; em?: number; text: string };

function findTime(s: string): Window | null {
  const w =
    s.match(/(?:mellem\s+|fra\s+)?kl\s*(\d{1,2})(?::(\d{2}))?\s*(?:-|og|til)\s*(?:kl\s*)?(\d{1,2})(?::(\d{2}))?/) ??
    s.match(/mellem\s+(\d{1,2})(?::(\d{2}))?\s*(?:-|og)\s*(\d{1,2})(?::(\d{2}))?/);
  if (w) return { sh: +w[1], sm: +(w[2] ?? 0), eh: +w[3], em: +(w[4] ?? 0), text: w[0] };
  const one = s.match(/\bkl\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (one) return { sh: +one[1], sm: +(one[2] ?? 0), text: one[0] };
  for (const [word, [a, b]] of Object.entries(PART_OF_DAY)) {
    if (new RegExp(`\\b(i |om |på )?${word}en?\\b`).test(s)) return { sh: a, sm: 0, eh: b, em: 0, text: word };
  }
  return null;
}

const valid = (h: number, m: number) => h >= 0 && h <= 24 && m >= 0 && m < 60;

function parseAmounts(original: string): { amount: number; text: string }[] {
  const out: { amount: number; text: string }[] = [];
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:kr\b|kroner\b|,-)/gi;
  for (const m of original.matchAll(re)) {
    out.push({ amount: Number(m[1].replace(/\./g, "")) + (m[2] ? Number(m[2]) / 100 : 0), text: m[0] });
  }
  return out;
}

export function checkReply(text: string, ctx: GuardContext): GuardResult {
  const issues: GuardIssue[] = [];
  const add = (code: GuardIssue["code"], message: string, excerpt: string) => {
    if (!issues.some((i) => i.code === code && i.excerpt === excerpt)) issues.push({ code, message, excerpt: excerpt.slice(0, 140) });
  };
  const lead = (ctx.leadMinutes ?? 60) * 60_000;

  if (!text || text.trim().length < 2) {
    return { ok: false, issues: [{ code: "tom_tekst", message: "Svaret er tomt.", excerpt: "" }], checkedAt: new Date(ctx.nowMs).toISOString() };
  }

  for (const s of sentences(text)) {
    const promisesVisit = VISIT.test(s);

    if (/\bvi\b[^,]*\b(kommer|er der|er hos|er ude|når frem|sender)\b[^,]*\b(straks|med det samme|inden for|indenfor|om \d+|om en|om et|om ca)\b/.test(s)) {
      add("ankomstloefte", "Svaret lover en ankomsttid, som ingen har bekræftet.", s);
    }
    if (ctx.emergency && promisesVisit && /\bvi\b/.test(s) && !/\bringer\b|\bkontakter\b|\bvagthavende\b/.test(s)) {
      add("akut_loefte", "Akut sag: kun vagthavende må love et besøg. Lad svaret sige, at vagten ringer kunden op.", s);
    }

    // En sætning kan indeholde flere tider ("i morgen kl. 8-10 eller mandag kl. 12-14").
    // Hver del kontrolleres for sig; en del uden dag arver dagen fra delen før.
    let lastDay: ReturnType<typeof findDay> = null;
    let sawDay = false;
    let sawTime = false;
    for (const clause of s.split(/\s*(?:\beller\b|;|,)\s*/)) {
      const ownDay = findDay(clause, ctx);
      const time = findTime(clause);
      const day = ownDay ?? (time ? lastDay : null);
      if (ownDay) { lastDay = ownDay; sawDay = true; }
      if (!time) continue;
      sawTime = true;
      if (!day) { add("uklar_tid", "Tidspunktet mangler en dato. Vælg en bekræftet tid fra kalenderen.", s); continue; }
      checkWindow(day, time, s);
    }
    if (sawDay && !sawTime && promisesVisit) add("uklar_tid", "Svaret lover en dag uden et bekræftet tidsrum.", s);
  }

  function checkWindow(day: LocalDate, time: Window, s: string) {
    if (!valid(time.sh, time.sm) || (time.eh !== undefined && !valid(time.eh, time.em ?? 0))) {
      add("uklar_tid", "Ugyldigt klokkeslæt.", s);
      return;
    }
    const start = zonedToUtc(day.y, day.m, day.d, time.sh, time.sm, ctx.tz);
    const end = time.eh !== undefined ? zonedToUtc(day.y, day.m, day.d, time.eh, time.em ?? 0, ctx.tz) : start + 60 * 60_000;
    if (end <= start) { add("uklar_tid", "Sluttidspunktet ligger før starttidspunktet.", s); return; }
    if (start < ctx.nowMs + lead) {
      add(
        "tid_i_fortiden",
        end <= ctx.nowMs ? "Tidspunktet er allerede passeret." : "Tidsrummet er begyndt eller starter om mindre end en time.",
        s,
      );
      return; // et passeret tidspunkt skal ikke også vurderes mod kalenderen
    }
    if (!withinOpeningHours(start, end, ctx.openingHours, ctx.tz)) {
      add("uden_for_aabningstid", "Tidspunktet ligger uden for åbningstiden.", s);
    }
    const match = ctx.slots.find((sl) => sl.state === "ledig" && Date.parse(sl.start) === start && (time.eh === undefined || Date.parse(sl.end) === end));
    if (!match) add("tid_ikke_i_kalender", "Tidspunktet findes ikke som ledig tid i kalenderen.", s);
  }

  const allowed = new Set([...ctx.priceList.map((p) => p.amountDkk), ...(ctx.approvedAmounts ?? [])]);
  for (const a of parseAmounts(text)) {
    if (!allowed.has(a.amount)) add("pris_uden_grundlag", "Beløbet står ikke i den godkendte prisliste eller i et godkendt tilbud.", a.text);
  }

  return { ok: issues.length === 0, issues, checkedAt: new Date(ctx.nowMs).toISOString() };
}
