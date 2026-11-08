// Worker 02 – Responder. Skabelonbaseret og deterministisk i testversionen.
// Grundregel: Responder må KUN bruge (a) ledige tider fra kalenderen, (b) priser fra den
// godkendte prisliste. Alt andet formuleres som "vi vender tilbage". Resultatet kontrolleres
// altid af sikkerhedslaget før godkendelse.

import type { CalendarSlot, Draft, Inquiry, Tenant } from "../types.ts";
import { addLocalDays, localParts, withinOpeningHours } from "../time.ts";

const WEEKDAY = ["", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
const MONTH = ["", "januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

const hm = (h: number, m: number) => (m ? `${h}.${String(m).padStart(2, "0")}` : `${h}`);

/** Formulerer en kalendertid, så den kan genkendes entydigt af sikkerhedslaget. */
export function describeSlot(slot: CalendarSlot, nowMs: number, tz: string): string {
  const s = localParts(Date.parse(slot.start), tz);
  const e = localParts(Date.parse(slot.end), tz);
  const t = localParts(nowMs, tz);
  const tomorrow = addLocalDays(t.y, t.m, t.d, 1);
  const same = (a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) => a.y === b.y && a.m === b.m && a.d === b.d;
  const daysAhead = Math.round((Date.UTC(s.y, s.m - 1, s.d) - Date.UTC(t.y, t.m - 1, t.d)) / 86_400_000);
  const day = same(s, t) ? "i dag"
    : same(s, tomorrow) ? "i morgen"
    : daysAhead <= 7 ? WEEKDAY[s.weekday]
    : `${s.d}. ${MONTH[s.m]}`;
  return `${day} mellem kl. ${hm(s.h, s.min)} og ${hm(e.h, e.min)}`;
}

export function pickSlots(tenant: Tenant, slots: CalendarSlot[], nowMs: number, count = 2, leadMinutes = 120): CalendarSlot[] {
  return slots
    .filter((s) => s.state === "ledig" && Date.parse(s.start) >= nowMs + leadMinutes * 60_000)
    .filter((s) => withinOpeningHours(Date.parse(s.start), Date.parse(s.end), tenant.openingHours, tenant.timezone))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, count);
}

export function writeDraft(inquiry: Inquiry, tenant: Tenant, slots: CalendarSlot[], nowMs: number): Draft {
  const first = inquiry.customerName.split(" ")[0];
  const owner = tenant.employees.find((e) => e.title.toLowerCase().includes("ejer"))?.name ?? tenant.employees[0]?.name ?? "";
  const sign = `Venlig hilsen\n${owner}, ${tenant.name.replace(/\s*\(testdata\)/, "")}`;
  const createdAt = new Date(nowMs).toISOString();

  if (inquiry.emergency) {
    const onCall = tenant.employees.find((e) => e.onCall);
    const text = [
      `Hej ${first}`,
      "",
      "Tak for din besked. Det lyder som en mulig akut skade, og vi tager den alvorligt.",
      "",
      `Indtil vi har talt sammen: ${inquiry.emergency.guidance}`,
      "",
      `Vi har givet besked til ${onCall ? `vores vagthavende, ${onCall.name}` : "vores vagthavende"}, som ringer dig op hurtigst muligt for at aftale det videre forløb.`,
      inquiry.missingInfo.length ? `\nSend gerne ${inquiry.missingInfo.map((m) => m.toLowerCase()).join(" og ")}, så vi er klar.` : "",
      "",
      sign,
    ].join("\n");
    return { text, generatedBy: "worker-02", createdAt, basis: { slotIds: [], priceIds: [], note: "Akut sag: ingen tid foreslået. Vagthavende bekræfter besøg." } };
  }

  const lines = [`Hej ${first}`, "", "Tak for din henvendelse."];
  const priceIds: string[] = [];
  const text = `${inquiry.subject} ${inquiry.message}`.toLowerCase();
  const price = tenant.priceList.find((p) => p.label.toLowerCase().split(" ").some((w) => w.length > 6 && text.includes(w)));

  if (inquiry.category === "tilbud") {
    if (price && price.unit === "fast") {
      lines.push(`Ifølge vores prisliste koster ${price.label.toLowerCase()} ${price.amountDkk.toLocaleString("da-DK")} kr. inkl. moms. Den endelige pris bekræftes, når vi har set installationen.`);
      priceIds.push(price.id);
    } else {
      lines.push("Vi sender dig et skriftligt tilbud, så snart vi har de nødvendige oplysninger.");
    }
  }

  const chosen = inquiry.category === "tilbud" ? [] : pickSlots(tenant, slots, nowMs);
  if (chosen.length) {
    // "i morgen mellem kl. 8 og 10 eller mellem kl. 10 og 12" – dagen gentages ikke.
    const opts = chosen.map((s, i) => {
      const d = describeSlot(s, nowMs, tenant.timezone);
      const prev = i > 0 ? describeSlot(chosen[i - 1], nowMs, tenant.timezone) : "";
      const day = d.slice(0, d.indexOf(" mellem"));
      return prev.startsWith(day + " mellem") ? d.slice(day.length + 1) : d;
    });
    lines.push(opts.length === 1
      ? `Vi har en ledig tid ${opts[0]}. Passer det? Tiden er først reserveret, når du har bekræftet.`
      : `Vi har ledige tider ${opts.join(" eller ")}. Passer en af dem? Tiden er først reserveret, når du har bekræftet.`);
  } else if (inquiry.category !== "tilbud") {
    lines.push("Vi vender tilbage med et konkret tidspunkt, så snart vi har tjekket kalenderen.");
  }

  if (inquiry.missingInfo.length) lines.push(`For at hjælpe dig bedst muligt må du gerne sende: ${inquiry.missingInfo.map((m) => m.toLowerCase()).join(", ")}.`);
  lines.push("", sign);
  return { text: lines.join("\n"), generatedBy: "worker-02", createdAt, basis: { slotIds: chosen.map((s) => s.id), priceIds } };
}
