// Delte typer for GENFANG. Holdes fri for Next.js/React-afhængigheder,
// så de senere kan flyttes til packages/types og bruges af Expo-appen.

export type TenantId = string;
export type UserId = string;

export type Role = "owner" | "staff";

export interface Tenant {
  id: TenantId;
  name: string;
  trade: string;
}

export interface User {
  id: UserId;
  tenantId: TenantId;
  email: string;
  name: string;
  role: Role;
}

/** Worker 01 (klassificering) sætter category og urgency. */
export type InquiryCategory = "akut" | "tilbud" | "service" | "andet";
export type Urgency = "akut" | "normal" | "lav";

export type InquiryStatus =
  | "ny" //            modtaget, endnu ikke klassificeret/udkast
  | "udkast_klar" //   Worker 02 har lavet svarudkast – afventer menneske
  | "godkendt" //      godkendt af menneske, klar til udsendelse
  | "afvist"; //       udkast afvist – skal håndteres manuelt

export interface Draft {
  text: string;
  generatedBy: "worker-02";
  createdAt: string;
  /** Sat hvis brugeren har redigeret udkastet før godkendelse. */
  editedBy?: UserId;
}

export interface Inquiry {
  id: string;
  tenantId: TenantId;
  customerName: string;
  channel: "mail" | "formular" | "telefon";
  subject: string;
  message: string;
  address?: string;
  receivedAt: string;
  category: InquiryCategory;
  urgency: Urgency;
  status: InquiryStatus;
  draft?: Draft;
  /** Optimistisk låsning: stiger ved hver ændring. Forhindrer dobbelt-godkendelse. */
  version: number;
  decidedBy?: UserId;
  decidedAt?: string;
}

export type QuoteStatus = "kladde" | "sendt" | "accepteret" | "afslaaet";

export interface Quote {
  id: string;
  tenantId: TenantId;
  inquiryId?: string;
  customerName: string;
  title: string;
  amountDkk: number; // inkl. moms
  status: QuoteStatus;
  sentAt?: string;
  /** Worker 03 planlægger opfølgning. */
  followUpAt?: string;
}

export interface WorkerStatus {
  id: "worker-01" | "worker-02" | "worker-03" | "worker-04";
  name: string;
  job: string;
  state: "aktiv" | "venter" | "fejl" | "slukket";
  lastRunAt: string;
  note?: string;
}

export interface AuditEntry {
  at: string;
  tenantId: TenantId;
  userId: UserId;
  action: "approve" | "reject" | "login" | "push_subscribe";
  target?: string;
  detail?: string;
}

export interface OutboxJob {
  id: string;
  tenantId: TenantId;
  inquiryId: string;
  createdAt: string;
  /** I testversionen sendes intet: jobbet registreres kun. */
  state: "blokeret_testversion";
}

export interface Overview {
  tenant: Tenant;
  user: Pick<User, "name" | "role">;
  counts: { newInquiries: number; pendingApprovals: number; openQuotes: number; urgent: number };
  pendingApprovals: InquirySummary[];
  newInquiries: InquirySummary[];
  quotes: Quote[];
  workers: WorkerStatus[];
}

export type InquirySummary = Pick<
  Inquiry,
  "id" | "customerName" | "subject" | "receivedAt" | "category" | "urgency" | "status" | "channel"
>;

/** Ensartet fejlform for API'et – samme kontrakt for web, iOS, Android og desktop. */
export interface ApiError {
  error: { code: "unauthorized" | "forbidden" | "not_found" | "conflict" | "invalid" | "rate_limited"; message: string };
}
