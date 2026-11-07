import type { Role } from "./types.ts";

// Adgangsmatrix. Håndhæves på serveren i hver API-rute og på hver side –
// at en knap er skjult i UI'et er aldrig den eneste beskyttelse.
const MATRIX = {
  view_cases: ["owner", "staff"],
  edit_draft: ["owner", "staff"],
  approve_reply: ["owner", "staff"],
  escalate: ["owner", "staff"],
  ack_escalation: ["owner", "staff"],
  regenerate_draft: ["owner", "staff"],
  view_quotes: ["owner", "staff"],
  approve_quote: ["owner"],
  approve_followup: ["owner"],
  view_analytics: ["owner"],
  view_audit: ["owner"],
  anonymize_customer: ["owner"],
  simulate_intake: ["owner"],
  platform_admin: ["superadmin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role, p: Permission): boolean {
  return (MATRIX[p] as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Ejer", staff: "Medarbejder", superadmin: "GENFANG-ejer" };
