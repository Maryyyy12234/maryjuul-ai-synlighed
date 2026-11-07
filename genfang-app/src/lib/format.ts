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
export const STATUS: Record<string, string> = { ny: "Ny", udkast_klar: "Afventer godkendelse", godkendt: "Godkendt", afvist: "Afvist" };
export const QUOTE_STATUS: Record<string, string> = {
  kladde: "Kladde", afventer_godkendelse: "Afventer godkendelse", sendt: "Sendt", accepteret: "Accepteret",
  afvist: "Afvist", udloebet: "Udløbet", faktureret: "Faktureret",
};
export const PROVENANCE: Record<string, string> = { testdata: "Testdata", estimat: "Beregnet estimat", verificeret: "Verificeret" };
export const EMERGENCY: Record<string, string> = { vandskade: "Mulig vandskade", gaslugt: "Mulig gaslugt", tilstoppet_afloeb: "Afløb løber over", intet_varmt_vand: "Intet varmt vand", varmesvigt: "Varmesvigt" };

export function pctStr(r: number | null | undefined): string {
  return r === null || r === undefined ? "–" : `${(Math.round(r * 1000) / 10).toString().replace(".", ",")} %`;
}
export function ppStr(pp: number | null | undefined): string {
  if (pp === null || pp === undefined) return "";
  const v = Math.abs(pp).toString().replace(".", ",");
  return `${pp > 0 ? "+" : pp < 0 ? "−" : "±"}${v} procentpoint`;
}
export function relStr(rel: number | null | undefined): string {
  if (rel === null || rel === undefined) return "";
  const v = Math.round(Math.abs(rel) * 100);
  return `${rel > 0 ? "+" : rel < 0 ? "−" : "±"}${v} %`;
}
export function minStr(m: number | null | undefined): string {
  if (m === null || m === undefined) return "–";
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return `${(Math.round(h * 10) / 10).toString().replace(".", ",")} t`;
}
