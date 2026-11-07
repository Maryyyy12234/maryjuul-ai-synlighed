// Varig lagring af GENFANGs tilstand i Postgres.
//
// Model (pilotfase): hele domænetilstanden gemmes som ét JSONB-dokument med versionsnummer.
// - Indlæses én gang ved serverstart (src/instrumentation.ts), før der tages imod forespørgsler.
// - Gemmes efter hver ændring; API-ruterne venter på, at gemningen er færdig, før de svarer.
// - Versionsnummeret forhindrer, at en forældet instans overskriver nyere data.
// Passer til én serverinstans og få pilotkunder. Ved flere kunder/instanser skal appen over på det
// normaliserede skema i supabase/migrations (med RLS), som allerede er testet.

import type { Db } from "./seed.ts";

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const DDL = `
create table if not exists genfang_state (
  id integer primary key check (id = 1),
  data jsonb not null,
  version bigint not null,
  updated_at timestamptz not null default now()
)`;

export class StateStore {
  private version = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private q: Query;
  constructor(q: Query) { this.q = q; }

  async init() {
    await this.q(DDL);
  }

  async load(): Promise<Db | null> {
    const r = await this.q("select data, version from genfang_state where id = 1");
    if (!r.rows.length) return null;
    this.version = Number(r.rows[0].version);
    const data = r.rows[0].data;
    return (typeof data === "string" ? JSON.parse(data) : data) as Db;
  }

  /** Gemmer i rækkefølge (aldrig to skrivninger samtidig). Kaster ved versionskonflikt. */
  save(db: Db): Promise<void> {
    const json = JSON.stringify(db);
    const run = async () => {
      if (this.version === 0) {
        const r = await this.q(
          "insert into genfang_state (id, data, version) values (1, $1::jsonb, 1) on conflict (id) do nothing returning version",
          [json],
        );
        if (r.rows.length) { this.version = 1; return; }
        throw new Error("genfang_state findes allerede – indlæs før der gemmes");
      }
      const r = await this.q(
        "update genfang_state set data = $1::jsonb, version = version + 1, updated_at = now() where id = 1 and version = $2 returning version",
        [json, this.version],
      );
      if (!r.rows.length) throw new Error("Versionskonflikt: en anden instans har gemt nyere data");
      this.version = Number(r.rows[0].version);
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
}
