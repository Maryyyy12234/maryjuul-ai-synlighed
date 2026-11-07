# GENFANG – database (Supabase/Postgres)

Migration: `supabase/migrations/20261107000001_genfang_core.sql` · Test: `npm run test:db` (ægte Postgres via PGlite, 12 tests).

## Sikkerhedsmodel

| Lag | Regel |
|---|---|
| Læsning | `authenticated` kan kun læse rækker i virksomheder, brugeren er medlem af (RLS, `FORCE ROW LEVEL SECURITY`). Opfølgningsforslag kun for ejere. |
| Skrivning | Ingen direkte INSERT/UPDATE/DELETE for klienter. Alle ændringer via `app.*`-funktioner, som kun `service_role` (Next.js-serveren) må kalde. |
| Atomisk godkendelse | `app.decide_reply` låser rækken (`FOR UPDATE`), tjekker medlemskab, version, status og nødstop, opdaterer og lægger ét job i `outbox` (unik pr. sag) i samme transaktion. |
| Virksomhedskonsistens | Sammensatte fremmednøgler: en sag/et tilbud kan kun pege på en kunde i samme virksomhed. |
| Audit | `audit_log` er kun til tilføjelse – UPDATE, DELETE og TRUNCATE blokeres af triggere, også for superbruger. |
| Platformens ejer | Ingen læseadgang til kundedata. `app.admin_tenant_overview` returnerer kun aggregater. |
| Udsendelse | `platform_settings.delivery_enabled = false` og outbox-status `blokeret_testversion` indtil udsendelse er godkendt. |

## Sikkerhedslaget (guard) og databasen

Guard kører i Node på serveren (samme kode som i testene) **før** `app.decide_reply` kaldes. Databasen
håndhæver det, guard ikke kan: atomisitet, dobbelt-godkendelse, tenant og nødstop.

## Vigtigt ved kald

Kald funktioner som `select * from app.decide_reply(...)` eller `supabase.rpc('decide_reply', …)` med service-nøglen
**kun på serveren**. Brug aldrig `select (app.decide_reply(...)).*` – Postgres kalder så funktionen én gang pr. kolonne
(det fangede testene).

## Næste skridt for at tage databasen i brug

1. Vælg Supabase-projekt (EU-region). Gratis-planen giver efter min viden 2 aktive projekter – du har allerede 2 aktive.
2. Kør migrationen (`supabase db push` eller via Supabase MCP `apply_migration`).
3. Implementér `src/lib/store.ts`-kontrakten mod Supabase (læsning med brugerens JWT, skrivning via `app.*`-RPC med service-nøgle).
4. Kør `npm test`, `npm run test:db` og e2e mod Supabase-branchen, før rigtige data.
