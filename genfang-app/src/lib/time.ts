// Tidszone-sikre hjælpefunktioner uden eksterne biblioteker.
// Alle forretningsregler (åbningstider, "i dag", "i morgen") vurderes i virksomhedens
// lokale tidszone – ikke serverens (Vercel kører i UTC).

export interface LocalParts { y: number; m: number; d: number; h: number; min: number; weekday: number } // weekday: 1=man … 7=søn

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(ms: number, tz: string): LocalParts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { y: +get("year"), m: +get("month"), d: +get("day"), h: +get("hour"), min: +get("minute"), weekday: WD[get("weekday")] };
}

/** Lokal vægur-tid (i tz) → UTC-millisekunder. Håndterer sommer-/vintertid. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    const diff = Date.UTC(y, m - 1, d, h, min) - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/** Lokal dato (y,m,d) plus n dage – kalenderdage, ikke 24-timers blokke. */
export function addLocalDays(y: number, m: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: ((t.getUTCDay() + 6) % 7) + 1 };
}

export interface OpeningHours { [weekday: number]: { open: string; close: string } | null }

export function toMinutes(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); }

/** Ligger hele intervallet [startMs, endMs) inden for åbningstiden samme lokale dag? */
export function withinOpeningHours(startMs: number, endMs: number, hours: OpeningHours, tz: string): boolean {
  const s = localParts(startMs, tz);
  const e = localParts(endMs - 1, tz);
  if (s.y !== e.y || s.m !== e.m || s.d !== e.d) return false;
  const day = hours[s.weekday];
  if (!day) return false;
  const sm = s.h * 60 + s.min;
  const em = e.h * 60 + e.min + 1;
  return sm >= toMinutes(day.open) && em <= toMinutes(day.close);
}

export function isOpenAt(ms: number, hours: OpeningHours, tz: string): boolean {
  const p = localParts(ms, tz);
  const day = hours[p.weekday];
  if (!day) return false;
  const m = p.h * 60 + p.min;
  return m >= toMinutes(day.open) && m < toMinutes(day.close);
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
