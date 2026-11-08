import { aiEnabled } from "./workers/claude-responder.ts";
import { deliveryEnabled } from "./store.ts";

/** Hvilke integrationer er aktive – vises i appen, så status aldrig er et gæt. */
export function integrationStatus() {
  return [
    { id: "db", label: "Database (Postgres)", active: !!process.env.DATABASE_URL, how: "Sættes automatisk af Render Blueprint (DATABASE_URL)." },
    { id: "ai", label: "Claude skriver svarudkast", active: aiEnabled(), how: "Sæt ANTHROPIC_API_KEY på Render. Uden nøgle bruges sikre skabeloner." },
    { id: "out", label: "Afsendelse af godkendte mails", active: deliveryEnabled(), how: "Kræver eget domæne i Resend + RESEND_API_KEY, GENFANG_FROM_EMAIL og GENFANG_DELIVERY=on." },
    { id: "in", label: "Indgående mails bliver til sager", active: !!process.env.RESEND_WEBHOOK_SECRET && !!process.env.INBOUND_TENANT_ID, how: "Resend-webhook til /api/webhooks/inbound-email + RESEND_WEBHOOK_SECRET og INBOUND_TENANT_ID." },
    { id: "sms", label: "SMS/opkald til vagten", active: false, how: "Ikke bygget endnu – eskaleringer vises i appen." },
  ];
}
