// Delte typer for GENFANG. Fri for Next.js/React, så de kan flyttes til packages/types
// og genbruges af Expo (iOS/Android) og Tauri (Windows/macOS).

export type TenantId = string;
export type UserId = string;

/** owner = virksomhedsejer, staff = medarbejder, superadmin = GENFANG-platformens ejer (ingen adgang til kundedata). */
export type Role = "owner" | "staff" | "superadmin";

/** Datagrundlag – vises ved hvert tal, så testdata, estimater og verificerede resultater aldrig blandes. */
export type Provenance = "testdata" | "estimat" | "verificeret";

export interface OpeningDay { open: string; close: string }

export interface Employee {
  id: string;
  name: string;
  title: string;
  phone: string; // syntetisk
  onCall: boolean; // vagtordning denne uge
  userId?: UserId;
}

export interface PriceItem {
  id: string;
  label: string;
  amountDkk: number; // inkl. moms
  unit: "fast" | "pr_time" | "fra";
}

export interface CalendarSlot {
  id: string;
  employeeId: string;
  start: string; // ISO UTC
  end: string;
  state: "ledig" | "reserveret";
  source: "testkalender"; // senere: "google" | "outlook" | "ordrestyring"
}

export interface Plan { id: "pilot" | "business"; name: string; priceDkk: number } // ekskl. moms

export interface Tenant {
  id: TenantId;
  name: string;
  trade: string;
  timezone: string;
  locale: string;
  openingHours: Record<number, OpeningDay | null>; // 1=man … 7=søn
  employees: Employee[];
  priceList: PriceItem[];
  plan: Plan;
  paused: boolean; // nødstop for denne virksomhed (sat af superadmin)
  dpaSigned: boolean; // databehandleraftale med GENFANG
  retentionDays: number;
}

export interface User {
  id: UserId;
  tenantId: TenantId; // superadmin: "__platform__"
  email: string;
  name: string;
  role: Role;
}

export interface Customer {
  id: string;
  tenantId: TenantId;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  marketingConsent: boolean; // kun relevant for reklame – ikke for svar på egne henvendelser
  anonymized?: boolean;
}

export type InquiryCategory = "akut" | "tilbud" | "service" | "andet";
export type Urgency = "akut" | "normal" | "lav";
export type EmergencyKind = "vandskade" | "gaslugt" | "intet_varmt_vand" | "varmesvigt" | "tilstoppet_afloeb";

export type InquiryStatus = "ny" | "udkast_klar" | "godkendt" | "afvist";

export interface Draft {
  text: string;
  generatedBy: "worker-02" | "legacy";
  createdAt: string;
  editedBy?: UserId;
  /** Hvilket grundlag Responder brugte – vises for brugeren. */
  basis?: { slotIds: string[]; priceIds: string[]; note?: string };
}

export interface Escalation {
  to: string; // employeeId
  toName: string;
  reason: string;
  at: string;
  by: "worker-01" | UserId;
  state: "afventer_kvittering" | "kvitteret";
  ackAt?: string;
  ackBy?: UserId;
  /** I testversionen sendes ingen SMS/opkald. */
  delivery: "blokeret_testversion";
}

export interface Inquiry {
  id: string;
  tenantId: TenantId;
  customerId: string;
  customerName: string;
  channel: "mail" | "formular" | "telefon";
  subject: string;
  message: string;
  address?: string;
  receivedAt: string;
  firstResponseAt?: string;
  category: InquiryCategory;
  urgency: Urgency;
  emergency?: { kind: EmergencyKind; signals: string[]; guidance: string };
  escalation?: Escalation;
  missingInfo: string[];
  knownCustomer: boolean;
  status: InquiryStatus;
  draft?: Draft;
  version: number;
  decidedBy?: UserId;
  decidedAt?: string;
}

export type QuoteStatus = "kladde" | "afventer_godkendelse" | "sendt" | "accepteret" | "afvist" | "udloebet" | "faktureret";

export interface Quote {
  id: string;
  tenantId: TenantId;
  inquiryId?: string;
  customerId: string;
  customerName: string;
  title: string;
  amountDkk: number; // inkl. moms
  status: QuoteStatus;
  createdAt: string;
  sentAt?: string;
  validDays: number;
  respondedAt?: string;
  invoicedAt?: string;
  paidAt?: string; // betalt faktura = eneste "realiserede" omsætning
  followUps: number;
  version: number;
}

export interface FollowUpSuggestion {
  id: string;
  tenantId: TenantId;
  kind: "tilbud_ubesvaret" | "mangler_oplysninger";
  quoteId?: string;
  inquiryId?: string;
  customerName: string;
  reason: string;
  draft: string;
  /** Hvorfor beskeden lovligt må sendes – eller hvorfor ikke. */
  legalBasis: string;
  allowed: boolean;
  state: "forslag" | "godkendt" | "afvist";
  createdAt: string;
  version: number;
}

export type WorkerId = "worker-01" | "worker-02" | "worker-03" | "worker-04";

export interface WorkerDef { id: WorkerId; name: string; role: string; does: string[]; needsApproval: string }

export interface WorkerRun {
  id: string;
  tenantId: TenantId;
  worker: WorkerId;
  at: string;
  status: "ok" | "fejl" | "blokeret" | "stoppet";
  summary: string;
  error?: string;
  aiTokens: number; // 0 i testversionen – ingen modelkald
}

export interface WorkerStatus extends WorkerDef {
  state: "aktiv" | "fejl" | "stoppet";
  lastRunAt?: string;
  lastError?: string;
  runs24h: number;
}

export interface AuditEntry {
  at: string;
  tenantId: TenantId;
  userId: UserId;
  action:
    | "approve" | "reject" | "login" | "push_subscribe" | "escalate" | "escalation_ack"
    | "regenerate" | "quote_approve" | "quote_reject" | "followup_approve" | "followup_reject"
    | "anonymize" | "emergency_stop" | "emergency_resume" | "tenant_pause" | "tenant_resume" | "intake_simulated"
    | "guard_block";
  target?: string;
  detail?: string;
}

export interface OutboxJob {
  id: string;
  tenantId: TenantId;
  kind: "svar" | "tilbud" | "opfoelgning" | "eskalering";
  ref: string;
  createdAt: string;
  state: "blokeret_testversion";
}

export interface GuardIssue {
  code: "tid_i_fortiden" | "tid_ikke_i_kalender" | "uden_for_aabningstid" | "uklar_tid" | "ankomstloefte" | "pris_uden_grundlag" | "akut_loefte" | "tom_tekst";
  message: string;
  excerpt: string;
}

export interface GuardResult { ok: boolean; issues: GuardIssue[]; checkedAt: string }

export type InquirySummary = Pick<
  Inquiry,
  "id" | "customerName" | "subject" | "receivedAt" | "category" | "urgency" | "status" | "channel"
> & { escalated: boolean; emergencyKind?: EmergencyKind; guardOk?: boolean };

export interface Metric {
  value: number | null;
  unit: "kr" | "pct" | "min" | "timer" | "antal";
  provenance: Provenance;
  basis: string; // datagrundlag i klar tekst
  previous?: number | null;
}

/** Ensartet fejlform for API'et – samme kontrakt for web, iOS, Android og desktop. */
export interface ApiError {
  error: {
    code: "unauthorized" | "forbidden" | "not_found" | "conflict" | "invalid" | "rate_limited" | "blocked" | "stopped";
    message: string;
  };
}
