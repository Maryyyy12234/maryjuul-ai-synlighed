const TZ = "Europe/Copenhagen";

export function relTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.round(diff / 60_000);
  if (m < 1) return "nu";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} t`;
  const d = Math.round(h / 24);
  return d === 1 ? "i går" : `${d} d`;
}

export function clock(iso: string): string {
  return new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function dayLabel(iso: string, now = Date.now()): string {
  const fmt = (t: number) => new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeZone: TZ }).format(new Date(t));
  const t = new Date(iso).getTime();
  if (fmt(t) === fmt(now)) return "i dag";
  if (fmt(t) === fmt(now + 86_400_000)) return "i morgen";
  if (fmt(t) === fmt(now - 86_400_000)) return "i går";
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(t));
}

export function today(now = Date.now()): string {
  const s = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(now));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(now = Date.now()): string {
  const h = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date(now)));
  if (h < 5) return "God nat";
  if (h < 10) return "Godmorgen";
  if (h < 12) return "God formiddag";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

export function dkk(n: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n) + " kr.";
}

export const CHANNEL: Record<string, string> = { mail: "Mail", formular: "Formular", telefon: "Telefon" };
export const CATEGORY: Record<string, string> = { akut: "Akut", tilbud: "Tilbud", service: "Service", andet: "Andet" };
export const STATUS: Record<string, string> = { ny: "Ny", udkast_klar: "Afventer dig", godkendt: "Godkendt", afvist: "Afvist" };
export const QUOTE_STATUS: Record<string, string> = { kladde: "Kladde", sendt: "Sendt", accepteret: "Accepteret", afslaaet: "Afslået" };
