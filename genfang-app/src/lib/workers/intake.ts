// Worker 01 – Intake. Regelbaseret klassificering (ingen modelkald i testversionen).
// Når en sprogmodel kobles på, skal den kun FORESLÅ kategori – disse regler for akutte
// sager bevares som et sikkerhedsnet, så en vandskade aldrig ender som "lav prioritet".

import type { EmergencyKind, InquiryCategory, Urgency } from "../types.ts";

const EMERGENCY: { kind: EmergencyKind; re: RegExp; guidance: string }[] = [
  {
    kind: "gaslugt",
    re: /gaslugt|lugter (?:af|som) gas|lugt af gas|gasudslip/,
    guidance:
      "Ved gaslugt: Undgå åben ild, og tænd eller sluk ikke for elkontakter. Luk for gassen ved hovedhanen, hvis det kan gøres uden risiko. Luft ud, og forlad boligen. Ring 112, hvis der er fare.",
  },
  {
    kind: "vandskade",
    re: /vand (?:på|ud på|ud under|under|i) (?:gulvet|badeværelse|kælder|køkken)|vand ud under|breder sig|oversvøm|sprunget (?:et )?rør|rørsprængning|vandskade|kan ikke lukke for vandet|løber vand|vandet fosser|lækage/,
    guidance:
      "Luk for vandet ved stophanen (ofte under køkkenvasken eller ved vandmåleren). Hvis vandet nærmer sig stikkontakter eller elinstallationer, så sluk for strømmen til rummet – og rør ikke ved noget elektrisk, hvis du står i vand. Tør op, flyt værdigenstande, og tag billeder til forsikringen.",
  },
  {
    kind: "tilstoppet_afloeb",
    re: /(?:toilet|afløb|kloak)[^.]{0,40}(?:løber over|flyder over|kommer op)/,
    guidance: "Undlad at skylle ud eller bruge vand i boligen, indtil afløbet er undersøgt.",
  },
];

export interface IntakeResult {
  category: InquiryCategory;
  urgency: Urgency;
  emergency?: { kind: EmergencyKind; signals: string[]; guidance: string };
  missingInfo: string[];
}

export function classify(input: { subject: string; message: string; address?: string; phone?: string; channel: string }): IntakeResult {
  const text = `${input.subject} ${input.message}`.toLowerCase();
  for (const e of EMERGENCY) {
    const m = text.match(e.re);
    if (m) {
      const missing = [];
      if (!input.address) missing.push("Adresse");
      if (!input.phone) missing.push("Telefonnummer til vagthavende");
      return { category: "akut", urgency: "akut", emergency: { kind: e.kind, signals: [m[0]], guidance: e.guidance }, missingInfo: missing };
    }
  }
  const quote = /tilbud|pris på|hvad koster|overslag|hvad vil det koste/.test(text);
  const service = /eftersyn|radiator|utæt|drypper|skift|udskift|rens|varme|fyr|toilet|armatur|bruser/.test(text);
  const category: InquiryCategory = quote ? "tilbud" : service ? "service" : "andet";
  const missing: string[] = [];
  if (!input.address) missing.push("Adresse");
  if (quote && !/billede|foto/.test(text)) missing.push("Billede af nuværende installation");
  if (input.channel !== "telefon" && !input.phone) missing.push("Telefonnummer");
  const urgency: Urgency = /ingen varme|intet varmt vand|virker ikke/.test(text) ? "normal" : quote ? "normal" : "lav";
  return { category, urgency, missingInfo: missing };
}

export const normEmail = (e?: string) => e?.trim().toLowerCase() || undefined;
export const normPhone = (p?: string) => (p ? p.replace(/\D/g, "").replace(/^45(?=\d{8}$)/, "") : undefined) || undefined;
