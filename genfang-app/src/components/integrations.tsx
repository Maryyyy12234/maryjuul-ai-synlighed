import { integrationStatus } from "@/lib/integrations";

export function IntegrationList() {
  return (
    <ul className="kv integration-list">
      {integrationStatus().map((i) => (
        <li key={i.id}>
          <span>{i.label}<small>{i.how}</small></span>
          <span style={{ color: i.active ? "#2f5d00" : "var(--ink-2)", fontWeight: 600 }}>{i.active ? "Aktiv" : "Ikke sat op"}</span>
        </li>
      ))}
    </ul>
  );
}
